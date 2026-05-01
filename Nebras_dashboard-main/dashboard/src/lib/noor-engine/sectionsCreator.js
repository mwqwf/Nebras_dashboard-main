/**
 * Sections Creator — ينشئ الأقسام في Firebase RTDB حسب قرار المصنّف.
 *
 * يعمل على جانب الخادم (Admin SDK) فقط.
 * يدعم: create_main, create_sub, create_secondary, use_existing.
 * يُعلّم كلّ قسم يُنشئه بـ __createdBy: 'noor_library_engine' لسهولة التراجع.
 */

const SECTIONS_ROOT = 'sections_unified';
const ENGINE_TAG = 'noor_library_engine';

function makeId() {
	return Date.now() + Math.floor(Math.random() * 1000);
}

/**
 * يُحقّق قرار التصنيف ويُنشئ الأقسام الناقصة ثمّ يعيد IDs الفعلية.
 *
 * @param {import('firebase-admin/database').Database} db
 * @param {object} classification — ناتج classifier.classifyBook أو classifyFallback
 * @returns {Promise<ResolvedSections>}
 *
 * @typedef {object} ResolvedSections
 * @property {string} mainId
 * @property {string} mainName
 * @property {string|null} subId
 * @property {string|null} subName
 * @property {string|null} secondaryId
 * @property {string|null} secondaryName
 * @property {string[]} created — أسماء الأقسام التي أُنشئت
 */
export async function resolveSections(db, classification) {
	const created = [];
	let mainId = classification.mainSectionId || null;
	let mainName = classification.mainSectionName || '';
	let subId = classification.subSectionId || null;
	let subName = classification.subSectionName || '';
	let secondaryId = classification.secondarySectionId || null;
	let secondaryName = classification.secondarySectionName || '';

	const decision = classification.decision || 'use_existing';

	if (decision === 'create_main' || (!mainId && mainName)) {
		const existing = await findMainByName(db, mainName);
		if (existing) {
			mainId = String(existing.id);
		} else {
			mainId = String(makeId());
			await db.ref(`${SECTIONS_ROOT}/main/${mainId}`).set({
				id: Number(mainId),
				name: mainName.trim(),
				order_index: 0,
				is_listed: true,
				thumbnail: null,
				created_at: new Date().toISOString(),
				__createdBy: ENGINE_TAG
			});
			created.push(`رئيسي: ${mainName}`);
		}
	}

	if (
		(decision === 'create_sub' || decision === 'create_main') &&
		mainId &&
		subName &&
		!subId
	) {
		const existing = await findSubByName(db, subName, mainId);
		if (existing) {
			subId = String(existing.id);
		} else {
			subId = String(makeId());
			await db.ref(`${SECTIONS_ROOT}/sub/${subId}`).set({
				id: Number(subId),
				name: subName.trim(),
				main_section: Number(mainId),
				is_listed: true,
				thumbnail: null,
				created_at: new Date().toISOString(),
				__createdBy: ENGINE_TAG
			});
			created.push(`فرعي: ${subName}`);
		}
	}

	if (decision === 'create_secondary' && subId && secondaryName && !secondaryId) {
		const existing = await findSecondaryByName(db, secondaryName, subId);
		if (existing) {
			secondaryId = String(existing.id);
		} else {
			secondaryId = String(makeId());
			await db.ref(`${SECTIONS_ROOT}/secondary/${secondaryId}`).set({
				id: Number(secondaryId),
				name: secondaryName.trim(),
				sub_section: Number(subId),
				is_listed: true,
				thumbnail: null,
				created_at: new Date().toISOString(),
				__createdBy: ENGINE_TAG
			});
			created.push(`ثانوي: ${secondaryName}`);
		}
	}

	return { mainId, mainName, subId, subName, secondaryId, secondaryName, created };
}

async function findMainByName(db, name) {
	const snap = await db.ref(`${SECTIONS_ROOT}/main`).get();
	if (!snap.exists()) return null;
	const all = Object.values(snap.val() || {});
	return all.find((s) => normalize(s.name) === normalize(name)) || null;
}

async function findSubByName(db, name, mainId) {
	const snap = await db.ref(`${SECTIONS_ROOT}/sub`).get();
	if (!snap.exists()) return null;
	const all = Object.values(snap.val() || {});
	return (
		all.find(
			(s) =>
				normalize(s.name) === normalize(name) &&
				String(s.main_section) === String(mainId)
		) || null
	);
}

async function findSecondaryByName(db, name, subId) {
	const snap = await db.ref(`${SECTIONS_ROOT}/secondary`).get();
	if (!snap.exists()) return null;
	const all = Object.values(snap.val() || {});
	return (
		all.find(
			(s) =>
				normalize(s.name) === normalize(name) &&
				String(s.sub_section) === String(subId)
		) || null
	);
}

function normalize(str) {
	return String(str || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

export { ENGINE_TAG };
