/**
 * GET /api/admin/aggregates/by-source
 *
 * إحصاءات **حقيقية** لكلّ مصدر محتوى، محسوبة من Firestore مباشرة:
 *   • internet_archive  — محرّك الأرشيف
 *   • noor-library      — محرّك مكتبة نور
 *   • hindawi           — محرّك مؤسسة هنداوي
 *   • manual            — رفع يدويّ من اللوحة (بلا __provider)
 *
 * لكلّ مصدر: عدد الكتب/الملفّات + عدد الأقسام (رئيسي/فرعي/ثانوي) التي
 * وُضع فيها محتواه + أعلى الأقسام الرئيسيّة. كما نُعيد إجماليّات الأقسام.
 *
 * المصدر يُحدَّد من حقل `__provider` الذي يكتبه كلّ مُحمّل. غيابه = رفع يدويّ.
 */
import { json } from '@sveltejs/kit';
import { getNebrasFirestoreAdmin, isAdminConfigured } from '$lib/server/firebaseAdmin.js';
import {
	NEBRAS_FS_SECTIONS,
	NEBRAS_FS_CONTENT_FILES,
	NEBRAS_FS_CONTENT_YOUTUBE
} from '$lib/firebase/nebrasUnifiedPaths.js';
import { requireAdminRole } from '$lib/server/adminApiAuth.js';

/** يطبّع قيمة __provider إلى أحد الأدلّة الأربعة. */
function providerBucket(d) {
	const p = String(d?.__provider || '').trim().toLowerCase();
	if (p === 'internet_archive') return 'internet_archive';
	if (p === 'noor-library' || p === 'noor_library' || p === 'noor') return 'noor-library';
	if (p === 'hindawi') return 'hindawi';
	return 'manual';
}

function pickType(d) {
	return String(d?.content_type || d?.metadata?.content_type || 'document')
		.trim()
		.toLowerCase();
}

function emptyBucket() {
	return {
		total: 0,
		byType: { document: 0, audio: 0, video: 0, youtube: 0 },
		mainIds: new Set(),
		subIds: new Set(),
		secIds: new Set(),
		byMain: {} // mainId -> count
	};
}

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function GET(event) {
	const gate = requireAdminRole(event);
	if (!gate.ok) return gate.response;
	if (!isAdminConfigured()) {
		return json({ error: 'not_configured' }, { status: 501 });
	}

	const fs = getNebrasFirestoreAdmin();
	const [mainDoc, subDoc, secDoc, filesSnap, ytSnap] = await Promise.all([
		fs.collection(NEBRAS_FS_SECTIONS).doc('main').get(),
		fs.collection(NEBRAS_FS_SECTIONS).doc('sub').get(),
		fs.collection(NEBRAS_FS_SECTIONS).doc('secondary').get(),
		fs.collection(NEBRAS_FS_CONTENT_FILES).get(),
		fs.collection(NEBRAS_FS_CONTENT_YOUTUBE).get()
	]);

	const mains = mainDoc.exists ? mainDoc.data() || {} : {};
	const subs = subDoc.exists ? subDoc.data() || {} : {};
	const secs = secDoc.exists ? secDoc.data() || {} : {};

	const mainNameById = {};
	for (const [id, v] of Object.entries(mains)) mainNameById[String(id)] = String(v?.name || id);
	const subToMain = {};
	for (const [id, v] of Object.entries(subs)) subToMain[String(id)] = String(v?.main_section ?? '');
	const secToSub = {};
	for (const [id, v] of Object.entries(secs)) secToSub[String(id)] = String(v?.sub_section ?? '');

	/** @type {Record<string, ReturnType<typeof emptyBucket>>} */
	const buckets = {
		internet_archive: emptyBucket(),
		'noor-library': emptyBucket(),
		hindawi: emptyBucket(),
		manual: emptyBucket()
	};

	// توزيع خام لكلّ قيمة __provider فعليّة (للتشخيص الصريح): يكشف ما إذا كان
	// المحتوى اليدويّ بلا وسم (none) فيُحتسب «يدويّاً»، أو يحمل وسماً غير متوقّع.
	const rawProviders = {};

	function ingest(d, isYoutube) {
		const rawKey = String(d?.__provider || '').trim() || '(none/manual)';
		rawProviders[rawKey] = (rawProviders[rawKey] || 0) + 1;
		const b = buckets[providerBucket(d)];
		b.total += 1;
		const t = isYoutube ? 'youtube' : pickType(d);
		if (b.byType[t] !== undefined) b.byType[t] += 1;
		else b.byType.document += 1;

		const subId = String(d.subsection ?? d.metadata?.subsection ?? '');
		const secId = String(d.secondary_subsection ?? d.metadata?.secondary_subsection ?? '');
		const mainId =
			subToMain[subId] || String(d.main_section ?? d.metadata?.main_section ?? '');
		if (mainId) {
			b.mainIds.add(mainId);
			b.byMain[mainId] = (b.byMain[mainId] || 0) + 1;
		}
		if (subId) b.subIds.add(subId);
		if (secId) b.secIds.add(secId);
	}

	for (const doc of filesSnap.docs) ingest(doc.data() || {}, false);
	for (const doc of ytSnap.docs) ingest(doc.data() || {}, true);

	const sources = Object.entries(buckets).map(([key, b]) => ({
		source: key,
		total: b.total,
		byType: b.byType,
		sectionsOccupied: {
			main: b.mainIds.size,
			sub: b.subIds.size,
			secondary: b.secIds.size
		},
		topMainSections: Object.entries(b.byMain)
			.map(([id, count]) => ({ id, name: mainNameById[id] || id, count }))
			.sort((a, c) => c.count - a.count)
			.slice(0, 6)
	}));

	const totalContent = filesSnap.size + ytSnap.size;

	return json({
		ok: true,
		generatedAt: Date.now(),
		totals: {
			content: totalContent,
			files: filesSnap.size,
			youtube: ytSnap.size,
			sections: {
				main: Object.keys(mains).length,
				sub: Object.keys(subs).length,
				secondary: Object.keys(secs).length
			}
		},
		sources,
		rawProviders
	});
}
