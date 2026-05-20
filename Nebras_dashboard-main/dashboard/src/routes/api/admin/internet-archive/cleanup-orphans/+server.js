/**
 * POST /api/admin/internet-archive/cleanup-orphans
 *
 * يحذف من Firestore كلّ وثيقة محتوى لا يستطيع التطبيق تشغيلها أو يجب ألّا
 * يتّصل بمصدرها:
 *   • وثيقة بلا sourceUrl / file_url / video_url صالح (تُظهر "No source available").
 *   • ✅ وثيقة رابطها يشير مباشرة إلى **archive.org** — التطبيق قارئ من
 *     قاعدة البيانات فقط ولا علاقة له بالأرشيف؛ هذه بقايا قديمة تُحذف.
 *     (لا يمسّ هذا محتوى المحرّك المعاد استضافته على Firebase Storage، لأنّ
 *     رابط تشغيله storage لا archive.org.)
 *
 * يطبَّق على: content_unified_files + dashboard_uploads.
 *
 * body: {
 *   dryRun?: boolean,   // true = لا يحذف، يُرجع القائمة فقط
 *   restart?: boolean    // true (افتراضي) = بعد الحذف يبدأ المحرّك من جديد
 * }
 */
import { json } from '@sveltejs/kit';
import { getNebrasFirestoreAdmin, isAdminConfigured } from '$lib/server/firebaseAdmin.js';
import { adminFsDeleteFileMirrorBoth } from '$lib/server/nebrasUnifiedFirestoreAdmin.js';
import { requireAdminRole } from '$lib/server/adminApiAuth.js';
import { resetCursor, startEngine } from '$lib/server/internetArchive/engine.js';

const URL_FIELDS = [
	'sourceUrl',
	'source_url',
	'file_url',
	'audio_url',
	'video_url',
	'downloadUrl',
	'youtube_url',
	'youtube_link',
	'youtube',
	'url',
	'link'
];

function pickUrl(doc) {
	for (const f of URL_FIELDS) {
		const v = doc?.[f];
		if (typeof v === 'string' && v.trim().length > 8) return v.trim();
	}
	// nested check (youtube_video.video_url / r2_file.file_url)
	const yv = doc?.youtube_video;
	if (yv && typeof yv === 'object') {
		const u = yv.video_url || yv.url || yv.link;
		if (typeof u === 'string' && u.trim().length > 8) return u.trim();
	}
	const r2 = doc?.r2_file;
	if (r2 && typeof r2 === 'object') {
		const u = r2.file_url || r2.url || r2.link;
		if (typeof u === 'string' && u.trim().length > 8) return u.trim();
	}
	// metadata fallback
	const meta = doc?.metadata;
	if (meta && typeof meta === 'object') {
		for (const f of URL_FIELDS) {
			const v = meta[f];
			if (typeof v === 'string' && v.trim().length > 8) return v.trim();
		}
	}
	return '';
}

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function POST(event) {
	const gate = requireAdminRole(event);
	if (!gate.ok) return gate.response;
	if (!isAdminConfigured()) {
		return json({ error: 'not_configured' }, { status: 501 });
	}

	let body = {};
	try {
		body = await event.request.json();
	} catch {
		/* ignore — body optional */
	}
	const dryRun = Boolean(body?.dryRun);
	const restart = body?.restart === undefined ? true : Boolean(body?.restart);

	const fs = getNebrasFirestoreAdmin();

	const [filesSnap, uploadsSnap] = await Promise.all([
		fs.collection('content_unified_files').get(),
		fs.collection('dashboard_uploads').get()
	]);

	const removableIds = new Set();
	const samples = [];
	let orphanCount = 0;
	let archiveCount = 0;

	function scan(snap, label) {
		for (const d of snap.docs) {
			const data = d.data() || {};
			const url = pickUrl(data);
			const isOrphan = !url;
			const isArchive = !!url && url.toLowerCase().includes('archive.org');
			if (!isOrphan && !isArchive) continue;
			removableIds.add(d.id);
			if (isOrphan) orphanCount += 1;
			else archiveCount += 1;
			if (samples.length < 12) {
				samples.push({
					collection: label,
					id: d.id,
					reason: isOrphan ? 'no_source' : 'archive_org_link',
					title: data?.title || data?.metadata?.title || '',
					provider: data?.__provider || 'manual',
					licenseStatus: data?.__license_status || 'n/a'
				});
			}
		}
	}

	scan(filesSnap, 'content_unified_files');
	scan(uploadsSnap, 'dashboard_uploads');

	if (dryRun) {
		return json({
			ok: true,
			dryRun: true,
			removableCount: removableIds.size,
			orphanCount,
			archiveCount,
			samples
		});
	}

	let deleted = 0;
	for (const id of removableIds) {
		await adminFsDeleteFileMirrorBoth(id).catch(() => {});
		deleted += 1;
	}

	// "ابدأ من جديد": صفّر مؤشّر الزحف (يبدأ التدوير من البذرة الأولى عبر
	// كل الأنواع) وفعّل المحرّك. لا نمسّ سجلّ المستورَد لتفادي التكرار، لكن
	// الزحف يستأنف نظيفاً مع المنطق الجديد فتظهر الكتب والصوت والفيديو.
	let restarted = false;
	let restartError = null;
	if (restart) {
		try {
			await resetCursor();
			await startEngine();
			restarted = true;
		} catch (err) {
			restartError = err?.message || String(err);
		}
	}

	return json({
		ok: true,
		dryRun: false,
		removableCount: removableIds.size,
		orphanCount,
		archiveCount,
		deleted,
		restarted,
		restartError,
		samples
	});
}
