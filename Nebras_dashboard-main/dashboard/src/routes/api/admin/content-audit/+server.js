/**
 * /api/admin/content-audit — أداة تدقيق المحتوى (للمالك فقط).
 *
 * تفحص المحتوى الحاليّ وتُبرز **ما يحمل إشارات خطر حقيقيّة** ليراجعه
 * المالك ويحذف المخالف:
 *
 *   • terrorism   : أسماء إصدارات/تنظيمات متطرّفة (النبأ/دابق/داعش…).
 *   • copyright   : علامات تجاريّة/منصّات محميّة (YouTube/Netflix/MBC…)
 *                   أو إشارات حقوق صريحة.
 *   • sexual      : ألفاظ جنسيّة صريحة.
 *   • archive_link: رابط مصدره archive.org (يجب ألّا يُخدَم).
 *
 * لا نُعلّم المحتوى لمجرّد كونه رفعاً يدويّاً — الرفع اليدويّ مُراجَع أصلاً.
 *
 * GET  → قائمة العناصر المُعلَّمة (مع الفئات والكلمات المُطابِقة).
 * POST → { action: 'delete', contentId, contentType } يحذف العنصر فعليّاً.
 */
import { json } from '@sveltejs/kit';
import { requireOwner } from '$lib/server/authGuard.js';
import { getNebrasFirestoreAdmin, isAdminConfigured } from '$lib/server/firebaseAdmin.js';
import { deleteContentEverywhere } from '$lib/server/contentTakedown.js';
import { scanRisk } from '$lib/server/contentRiskLexicon.js';
import {
	NEBRAS_FS_CONTENT_FILES,
	NEBRAS_FS_CONTENT_YOUTUBE
} from '$lib/firebase/nebrasUnifiedPaths.js';

const SCAN_LIMIT = 1500;
const RETURN_LIMIT = 500;

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function GET(event) {
	const denied = requireOwner(event);
	if (denied) return denied;
	if (!isAdminConfigured()) return json({ error: 'not_configured' }, { status: 501 });

	const fs = getNebrasFirestoreAdmin();
	const [filesSnap, ytSnap] = await Promise.all([
		fs.collection(NEBRAS_FS_CONTENT_FILES).limit(SCAN_LIMIT).get(),
		fs.collection(NEBRAS_FS_CONTENT_YOUTUBE).limit(SCAN_LIMIT).get()
	]);

	const flagged = [];
	let scanned = 0;

	const consider = (id, data, isYouTube) => {
		scanned += 1;
		const { flags, matched } = computeFlags(data);
		if (flags.length === 0) return;
		flagged.push({
			contentId: String(data?.id || data?.fileId || id || ''),
			title: String(data?.title || data?.name || ''),
			contentType: isYouTube ? 'youtube' : String(data?.content_type || 'file'),
			sourceUrl: pickUrl(data),
			provider: String(data?.__provider || ''),
			flags,
			matched
		});
	};

	for (const d of filesSnap.docs) consider(d.id, d.data() || {}, false);
	for (const d of ytSnap.docs) consider(d.id, d.data() || {}, true);

	flagged.sort((a, b) => b.flags.length - a.flags.length);

	return json({
		ok: true,
		scanned,
		flaggedCount: flagged.length,
		items: flagged.slice(0, RETURN_LIMIT)
	});
}

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function POST(event) {
	const denied = requireOwner(event);
	if (denied) return denied;
	if (!isAdminConfigured()) return json({ error: 'not_configured' }, { status: 501 });

	let body;
	try {
		body = await event.request.json();
	} catch {
		return json({ error: 'invalid_body' }, { status: 400 });
	}

	if (String(body?.action || '') !== 'delete') {
		return json({ error: 'unknown_action' }, { status: 400 });
	}
	const contentId = String(body?.contentId || '').trim();
	const contentType = String(body?.contentType || '').trim();
	if (!contentId) return json({ error: 'content_id_required' }, { status: 400 });

	await deleteContentEverywhere(contentId, contentType);
	return json({ ok: true, action: 'delete', contentId });
}

function pickUrl(data) {
	return String(
		data?.video_url ||
			data?.file_url ||
			data?.audio_url ||
			data?.sourceUrl ||
			data?.source_url ||
			data?.downloadUrl ||
			data?.url ||
			''
	);
}

function computeFlags(data) {
	// نفحص الحقول النصّيّة المرئيّة للمستخدم بحثاً عن إشارات خطر.
	const text = [
		data?.title,
		data?.name,
		data?.description,
		data?.author,
		data?.created_by,
		data?.section_name,
		data?.subsection_name
	]
		.filter(Boolean)
		.join(' \n ');

	const risks = scanRisk(text); // [{category, terms}]
	const flags = risks.map((r) => r.category);
	const matched = risks.flatMap((r) => r.terms);

	const url = pickUrl(data).toLowerCase();
	if (url.includes('archive.org')) {
		flags.push('archive_link');
	}
	return { flags, matched };
}
