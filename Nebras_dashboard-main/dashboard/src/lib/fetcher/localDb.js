/**
 * Local DB — مخزن محلي في الذاكرة يحاكي Firebase RTDB.
 *
 * يُستخدم عندما لا تكون بيانات Firebase مُهيّأة. يسمح بتشغيل
 * محرك الجلب كاملاً (جلب → تصنيف → إنشاء أقسام → تخزين)
 * ثمّ استعراض البيانات المُخزّنة مباشرة.
 */

let sections = { main: {}, sub: {}, secondary: {} };
let files = {};
let idCounter = Date.now();

function makeId() {
	return ++idCounter;
}

export function isLocalMode() {
	return true;
}

export function getLocalSections() {
	return sections;
}

export function getLocalFiles() {
	return files;
}

export function listLocalMainSections() {
	return Object.values(sections.main);
}

export function listLocalSubSections(mainSectionId) {
	const all = Object.values(sections.sub);
	if (!mainSectionId) return all;
	return all.filter((s) => String(s.main_section) === String(mainSectionId));
}

export function listLocalSecondarySections(subSectionId) {
	const all = Object.values(sections.secondary);
	if (!subSectionId) return all;
	return all.filter((s) => String(s.sub_section) === String(subSectionId));
}

export function findLocalMainByName(name) {
	const n = normalize(name);
	return Object.values(sections.main).find((s) => normalize(s.name) === n) || null;
}

export function findLocalSubByName(name, mainSectionId) {
	const n = normalize(name);
	return (
		Object.values(sections.sub).find(
			(s) =>
				normalize(s.name) === n &&
				String(s.main_section) === String(mainSectionId)
		) || null
	);
}

export function findLocalSecondaryByName(name, subSectionId) {
	const n = normalize(name);
	return (
		Object.values(sections.secondary).find(
			(s) =>
				normalize(s.name) === n &&
				String(s.sub_section) === String(subSectionId)
		) || null
	);
}

export function createLocalMainSection(data) {
	const id = makeId();
	const section = {
		id,
		name: String(data.name || '').trim(),
		order_index: Number(data.order_index || 0),
		is_listed: true,
		thumbnail: null,
		created_at: new Date().toISOString()
	};
	sections.main[id] = section;
	return section;
}

export function createLocalSubSection(data) {
	const id = makeId();
	const section = {
		id,
		name: String(data.name || '').trim(),
		main_section: data.main_section,
		is_listed: true,
		thumbnail: null,
		created_at: new Date().toISOString()
	};
	sections.sub[id] = section;
	return section;
}

export function createLocalSecondarySection(data) {
	const id = makeId();
	const section = {
		id,
		name: String(data.name || '').trim(),
		sub_section: data.sub_section,
		is_listed: true,
		thumbnail: null,
		created_at: new Date().toISOString()
	};
	sections.secondary[id] = section;
	return section;
}

export function storeLocalFile(payload) {
	const id = payload.id || makeId();
	files[id] = { ...payload, id };
	return { stored: true, id };
}

export function listLocalFiles() {
	return Object.values(files).sort(
		(a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
	);
}

export function getLocalStats() {
	return {
		mainSections: Object.keys(sections.main).length,
		subSections: Object.keys(sections.sub).length,
		secondarySections: Object.keys(sections.secondary).length,
		files: Object.keys(files).length
	};
}

function normalize(str) {
	return String(str || '')
		.trim()
		.replace(/\s+/g, ' ')
		.toLowerCase();
}
