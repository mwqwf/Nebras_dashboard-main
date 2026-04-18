/**
 * Multi-Upload Store — Svelte 5 Reactive Store
 *
 * يعيش هذا المتجر على مستوى التطبيق كوحدة (module singleton) حتى يستمر
 * الرفع المتعدد أثناء تنقل المستخدم بين صفحات لوحة التحكم دون إعادة تحميل.
 *
 * المهام:
 *   - إدارة طابور ملفات الرفع المتعدد (queue) مع بيانات كل بند.
 *   - التحكم في بدء/إيقاف الرفع المتسلسل.
 *   - السماح بحذف بند واحد في أي وقت — حتى أثناء رفعه فعلياً —
 *     دون التأثير على بقية البنود، مع إجهاض الرفع الخاص به تلقائياً.
 *   - يحفظ كائنات الـ uploader في Map خارج الحالة التفاعلية (غير reactive)
 *     كي لا يُجبر Svelte على إعادة التصيير مع كل تحديث تقدم.
 */

import { createFileUploader, mimeToContentType } from '$lib/utils/fileUpload.js';
import { notifyContentAdded } from '$lib/utils/notifyEvents.js';

/** @typedef {'queued'|'uploading'|'completed'|'failed'} QueueStatus */

/**
 * @typedef {Object} QueueItem
 * @property {string} id
 * @property {File}   file
 * @property {File|null} thumbnail
 * @property {string} thumbnailPreview
 * @property {{ title:string, description:string, author:string, main_section:(string|number), subsection:(string|number), secondary_subsection:(string|number), is_listed:boolean }} form
 * @property {{ main:string, sub:string, secondary:string }} labels
 * @property {QueueStatus} status
 * @property {number} progress
 * @property {string} error
 */

// ─── خريطة الـ uploaders الحية (غير تفاعلية) ─────────────────
/** @type {Map<string, { start: ()=>Promise<any>, abort: ()=>void }>} */
const uploaderRegistry = new Map();

// ─── الحالة التفاعلية ───────────────────────────────────────
/**
 * @type {{
 *   queue: QueueItem[],
 *   isUploading: boolean,
 *   currentId: string|null,
 *   lastError: string,
 *   allDoneAt: number,
 *   lastSections: { main_section: string, subsection: string, secondary_subsection: string }
 * }}
 */
let multiState = $state({
	queue: [],
	isUploading: false,
	currentId: null,
	lastError: '',
	allDoneAt: 0,
	// تُستخدم لتذكّر آخر اختيار أقسام أجراه المستخدم داخل نموذج "إضافة إلى الطابور"
	// حتى لا يُضطرّ إلى إعادة اختيارها مع كل ملف في نفس الدفعة.
	lastSections: { main_section: '', subsection: '', secondary_subsection: '' }
});

export function getMultiUploadState() {
	return multiState;
}

/** حفظ آخر اختيار أقسام ليُعاد استخدامه تلقائياً عند إضافة البند التالي. */
export function setLastSections({ main_section = '', subsection = '', secondary_subsection = '' } = {}) {
	multiState.lastSections = {
		main_section: String(main_section ?? ''),
		subsection: String(subsection ?? ''),
		secondary_subsection: String(secondary_subsection ?? '')
	};
}

/** نسيان آخر اختيار أقسام (عند بدء الرفع أو تفريغ الطابور). */
export function clearLastSections() {
	multiState.lastSections = { main_section: '', subsection: '', secondary_subsection: '' };
}

// ─── إدارة البنود ────────────────────────────────────────────

function newId() {
	return `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** إضافة بند جديد إلى نهاية الطابور. يعيد id البند الجديد. */
export function addItem({ file, thumbnail = null, thumbnailPreview = '', form, labels }) {
	const id = newId();
	multiState.queue = [
		...multiState.queue,
		{
			id,
			file,
			thumbnail,
			thumbnailPreview,
			form: { ...form },
			labels: { ...labels },
			status: 'queued',
			progress: 0,
			error: ''
		}
	];
	return id;
}

/** تحديث بند موجود. لا يغيّر الترتيب. */
export function updateItem(id, patch) {
	const idx = multiState.queue.findIndex((it) => it.id === id);
	if (idx === -1) return;
	const next = [...multiState.queue];
	next[idx] = { ...next[idx], ...patch };
	multiState.queue = next;
}

/** استبدال بيانات بند كاملة (أثناء تعديل من المحرّر). */
export function replaceItemFields(id, fields) {
	updateItem(id, fields);
}

/**
 * حذف بند من الطابور.
 * - إن كان البند قيد الرفع الآن: يتم إجهاض رفعه فوراً، ثم يتم حذفه،
 *   وتستمر الدورة الرئيسية في startAll لاختيار البند التالي طبيعياً.
 * - إن كان في الطابور فقط (queued/failed/completed): يُحذف مباشرةً.
 */
export function removeItem(id) {
	const up = uploaderRegistry.get(id);
	if (up) {
		try {
			up.abort();
		} catch {
			/* ignore */
		}
		uploaderRegistry.delete(id);
	}
	multiState.queue = multiState.queue.filter((it) => it.id !== id);
	if (multiState.currentId === id) {
		multiState.currentId = null;
	}
}

/** نقل بند للأعلى/الأسفل. لا يعمل على بند قيد الرفع. */
export function moveItem(id, direction) {
	const idx = multiState.queue.findIndex((it) => it.id === id);
	if (idx === -1) return;
	const target = idx + direction;
	if (target < 0 || target >= multiState.queue.length) return;
	if (
		multiState.queue[idx].status === 'uploading' ||
		multiState.queue[target].status === 'uploading'
	) {
		return;
	}
	const next = [...multiState.queue];
	[next[idx], next[target]] = [next[target], next[idx]];
	multiState.queue = next;
}

/** إزالة جميع البنود المنتهية بنجاح. */
export function clearCompleted() {
	multiState.queue = multiState.queue.filter((it) => it.status !== 'completed');
}

/** إعادة ضبط الطابور بالكامل (مع إجهاض أي رفع جارٍ). */
export function resetQueue() {
	stopAll({ markUploadingAsFailed: false });
	multiState.queue = [];
	multiState.lastError = '';
	multiState.allDoneAt = 0;
	clearLastSections();
}

// ─── الرفع ───────────────────────────────────────────────────

/**
 * بدء رفع جميع البنود الموجودة في الطابور بالتسلسل، حسب ترتيبها الحالي.
 * تتم إعادة المسح في كل دورة على `multiState.queue` الحالي، بحيث لو حُذف
 * بند أو أُضيف بعد البدء، يلتقطه الحلقة بشكل طبيعي.
 */
export async function startAll() {
	if (multiState.isUploading) return;
	multiState.isUploading = true;
	multiState.lastError = '';
	multiState.allDoneAt = 0;
	// بمجرد انطلاق الرفع لم نعد بحاجة لتذكّر آخر اختيار أقسام — ننسى تلقائياً.
	clearLastSections();

	while (multiState.isUploading) {
		const next = multiState.queue.find(
			(it) => it.status === 'queued' || it.status === 'failed'
		);
		if (!next) break;
		await uploadOne(next.id);
		if (!multiState.isUploading) break;
	}

	multiState.isUploading = false;
	multiState.currentId = null;

	const anythingLeft = multiState.queue.length > 0;
	const everyDone = anythingLeft && multiState.queue.every((it) => it.status === 'completed');
	if (everyDone) {
		multiState.allDoneAt = Date.now();
	}
}

/** إيقاف كل رفع جارٍ وإعادة البنود المتأثرة إلى حالة queued. */
export function stopAll({ markUploadingAsFailed = false } = {}) {
	multiState.isUploading = false;
	for (const [id, up] of uploaderRegistry.entries()) {
		try {
			up.abort();
		} catch {
			/* ignore */
		}
		uploaderRegistry.delete(id);
	}
	multiState.queue = multiState.queue.map((it) => {
		if (it.status !== 'uploading') return it;
		return markUploadingAsFailed
			? { ...it, status: 'failed', progress: 0, error: 'Upload stopped' }
			: { ...it, status: 'queued', progress: 0, error: '' };
	});
	multiState.currentId = null;
}

/**
 * رفع بند واحد. يُحدّث الحالة والتقدم. يُسجّل uploader في السجل كي يمكن
 * إجهاضه لاحقاً من خلال removeItem أو stopAll.
 */
async function uploadOne(itemId) {
	const startSnapshot = multiState.queue.find((it) => it.id === itemId);
	if (!startSnapshot) return;

	updateItem(itemId, { status: 'uploading', progress: 0, error: '' });
	multiState.currentId = itemId;

	const contentType = mimeToContentType(startSnapshot.file.type);
	const metadata = {
		title: startSnapshot.form.title,
		description: startSnapshot.form.description || undefined,
		author: startSnapshot.form.author || undefined,
		subsection: Number(startSnapshot.form.subsection),
		content_type: contentType,
		is_listed: startSnapshot.form.is_listed
	};
	if (startSnapshot.form.secondary_subsection) {
		metadata.secondary_subsection = Number(startSnapshot.form.secondary_subsection);
	}

	const uploader = createFileUploader(startSnapshot.file, metadata, startSnapshot.thumbnail, {
		onProgress: (p) => {
			if (multiState.queue.some((it) => it.id === itemId)) {
				updateItem(itemId, { progress: p });
			}
		},
		onStatus: () => {},
		onError: (msg) => {
			if (multiState.queue.some((it) => it.id === itemId)) {
				updateItem(itemId, { error: msg });
			}
		}
	});

	uploaderRegistry.set(itemId, uploader);

	try {
		const result = await uploader.start();
		if (multiState.queue.some((it) => it.id === itemId)) {
			updateItem(itemId, { status: 'completed', progress: 100, error: '' });
			// إشعار FCM بعد نجاح كل بند — لا يُعطَّل الطابور إن فشل.
			notifyContentAdded({
				title: startSnapshot.form.title,
				contentType: contentType,
				contentId: result?.id,
				mainSectionId: startSnapshot.form?.main_section,
				subSectionId: startSnapshot.form?.subsection,
				secondarySectionId: startSnapshot.form?.secondary_subsection,
				mainSectionName: startSnapshot.labels?.main || '',
				subSectionName: startSnapshot.labels?.sub || '',
				secondarySectionName: startSnapshot.labels?.secondary || ''
			});
		}
	} catch (err) {
		if (multiState.queue.some((it) => it.id === itemId)) {
			const msg = err?.message || 'Upload failed';
			updateItem(itemId, { status: 'failed', error: msg });
		}
	} finally {
		uploaderRegistry.delete(itemId);
	}
}
