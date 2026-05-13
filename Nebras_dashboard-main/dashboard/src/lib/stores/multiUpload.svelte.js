/**
 * Multi-Upload Store — Svelte 5 Reactive Store
 *
 * يعيش هذا المتجر على مستوى التطبيق كوحدة (module singleton) حتى يستمر
 * الرفع المتعدد أثناء تنقل المستخدم بين صفحات لوحة التحكم دون إعادة تحميل.
 *
 * المهام:
 *   - إدارة طابور ملفات الرفع المتعدد (queue) مع بيانات كل بند.
 *   - التحكم في بدء/إيقاف الرفع — يعمل عبر "مسبح" متوازٍ بسقف قابل
 *     للضبط مع احترام صارم لترتيب الاختيار: أوّل ملف اختاره المستخدم
 *     يبدأ رفعه أوّلاً دائماً (FIFO start). قد ينتهي ملفٌ صغير قبل
 *     ملفٍ كبير سبقه — لكنّ بدء الرفع يحترم الترتيب الذي رتّبه المستخدم.
 *   - السماح بحذف بند واحد في أي وقت — حتى أثناء رفعه فعلياً —
 *     دون التأثير على بقية البنود، مع إجهاض الرفع الخاص به تلقائياً.
 *   - يحفظ كائنات الـ uploader في Map خارج الحالة التفاعلية (غير reactive)
 *     كي لا يُجبر Svelte على إعادة التصيير مع كل تحديث تقدم.
 */

import { createFileUploader, mimeToContentType } from '$lib/utils/fileUpload.js';
import { notifyContentAdded } from '$lib/utils/notifyEvents.js';
import { mirrorUploadedFileToOldAppLesson, mirrorUploadedFileToMshcatBook } from '$lib/api/moderator.js';

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

// السقف الافتراضي لعدد الرفعات المتوازية. ٣ يوازن جيداً بين سرعة
// الإنجاز وعدم إغراق المتصفح أو الشبكة. يمكن تجاوزه بتمرير
// `{ concurrency }` إلى `startAll`.
export const DEFAULT_CONCURRENCY = 3;

// ─── الحالة التفاعلية ───────────────────────────────────────
/**
 * @type {{
 *   queue: QueueItem[],
 *   isUploading: boolean,
 *   currentId: string|null,
 *   lastError: string,
 *   allDoneAt: number,
 *   concurrency: number,
 *   lastSections: { main_section: string, subsection: string, secondary_subsection: string }
 * }}
 */
let multiState = $state({
	queue: [],
	isUploading: false,
	// أوّل بند يبدأ الرفع في الدفعة الحالية — يُستخدم للمؤشر العائم
	// والإبراز المرئي. مع التوازي يبقى مفهوم "نشط" مستنداً إلى
	// حالة كل بند (`status === 'uploading'`) بدلاً من معرّف واحد.
	currentId: null,
	lastError: '',
	allDoneAt: 0,
	concurrency: DEFAULT_CONCURRENCY,
	// تُستخدم لتذكّر آخر اختيار أقسام أجراه المستخدم داخل نموذج "إضافة إلى الطابور"
	// حتى لا يُضطرّ إلى إعادة اختيارها مع كل ملف في نفس الدفعة.
	lastSections: { main_section: '', subsection: '', secondary_subsection: '' }
});

export function getMultiUploadState() {
	return multiState;
}

/** ضبط عدد الرفعات المتوازية القصوى (1–5). */
export function setConcurrency(n) {
	const v = Math.max(1, Math.min(5, Number(n) || DEFAULT_CONCURRENCY));
	multiState.concurrency = v;
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

/**
 * إضافة بند جديد إلى **نهاية** الطابور دائماً. نستخدم `push` بدلاً من
 * spread لتجنّب رتبة O(n) عند إضافة دفعة كبيرة (مثلاً ١٠٠ ملف معاً).
 * يضمن `push` بقاء ترتيب الاختيار محفوظاً، وبما أنّ مُختار البند التالي
 * في حلقة الرفع يستخدم `Array.find()` (الذي يبدأ من الفهرس 0)، فأوّل
 * بندٍ يدخل الطابور هو أوّل من يبدأ رفعه دائماً.
 */
export function addItem({ file, thumbnail = null, thumbnailPreview = '', form, labels }) {
	const id = newId();
	multiState.queue.push({
		id,
		file,
		thumbnail,
		thumbnailPreview,
		form: { ...form },
		labels: { ...labels },
		status: 'queued',
		progress: 0,
		error: ''
	});
	return id;
}

/**
 * تحديث بند موجود **في الموضع** (in-place). هذا أرخص بكثير من إعادة
 * بناء المصفوفة كاملة، وضروري عند التوازي حيث تصل آلاف أحداث `progress`
 * في الثانية من عدّة بنود متزامنة. الحقول الداخلية مُسجّلة في `$state`
 * deep-reactive لذا يكتفي Svelte 5 بمراقبة `Object.assign`.
 */
export function updateItem(id, patch) {
	const idx = multiState.queue.findIndex((it) => it.id === id);
	if (idx === -1) return;
	Object.assign(multiState.queue[idx], patch);
}

/** استبدال بيانات بند كاملة (أثناء تعديل من المحرّر). */
export function replaceItemFields(id, fields) {
	updateItem(id, fields);
}

/**
 * حذف بند من الطابور.
 * - إن كان البند قيد الرفع الآن: يتم إجهاض رفعه فوراً، ثم يتم حذفه،
 *   وتستمر دورة المسبح في `startAll` لاختيار البند التالي طبيعياً.
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
	// تبديل في الموضع دون إعادة بناء المصفوفة بأكملها.
	const a = multiState.queue[idx];
	multiState.queue[idx] = multiState.queue[target];
	multiState.queue[target] = a;
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

// ─── الرفع المتوازي ─────────────────────────────────────────

/**
 * بدء رفع جميع البنود الموجودة في الطابور عبر مسبح متوازٍ بسقف
 * `concurrency`. القاعدة الذهبية: **`pickNext` يُرجع أوّل بند في
 * الطابور صالح للرفع (status === 'queued' || 'failed')**، أي
 * `Array.find` يبدأ من الفهرس 0 دائماً. وبما أنّ `addItem` يدفع إلى
 * النهاية، فإنّ أوّل ملف اختاره المستخدم هو أوّل من يُبدأ رفعه دائماً.
 *
 * قد ينتهي ملف صغير قبل ملف كبير سبقه — هذا طبيعي ومقبول؛ المضمون
 * هو **ترتيب البدء**، لا ترتيب الانتهاء.
 *
 * @param {{ concurrency?: number }} [opts]
 */
export async function startAll({ concurrency } = {}) {
	if (multiState.isUploading) return;
	multiState.isUploading = true;
	multiState.lastError = '';
	multiState.allDoneAt = 0;
	// بمجرد انطلاق الرفع لم نعد بحاجة لتذكّر آخر اختيار أقسام — ننسى تلقائياً.
	clearLastSections();

	const limit = Math.max(
		1,
		Math.min(5, Number(concurrency) || multiState.concurrency || DEFAULT_CONCURRENCY)
	);

	/** @type {Set<Promise<void>>} */
	const active = new Set();

	function pickNext() {
		// `find` يبدأ من index 0 — وهذا ما يضمن أنّ أوّل بند في
		// الطابور (= أوّل ملف اختاره المستخدم) ينطلق أوّلاً.
		return multiState.queue.find(
			(it) => it.status === 'queued' || it.status === 'failed'
		);
	}

	try {
		// حلقة "ابقَ المسبح ممتلئاً": كلّما فرغ مكانٌ نضع بنداً جديداً
		// من رأس الطابور. ننتظر اكتمال أيّ بند للسماح بالتقاط
		// البند التالي حسب الترتيب.
		while (multiState.isUploading) {
			while (multiState.isUploading && active.size < limit) {
				const next = pickNext();
				if (!next) break;
				// نضع حالة 'uploading' فوراً قبل أيّ await حتى لا يلتقطه
				// `pickNext` التالي في نفس الدورة الإستراتيجية.
				updateItem(next.id, { status: 'uploading', progress: 0, error: '' });
				if (!multiState.currentId) multiState.currentId = next.id;
				const p = uploadOne(next.id).finally(() => active.delete(p));
				active.add(p);
			}
			if (active.size === 0) break;
			// انتظر أوّل بند ينتهي ثم أعد ملء المكان.
			await Promise.race(active);
		}
		// إذا توقّفنا بسبب stopAll، انتظر تنظيف الأنشطة الجارية.
		if (active.size > 0) {
			await Promise.allSettled(active);
		}
	} finally {
		multiState.isUploading = false;
		multiState.currentId = null;

		const anythingLeft = multiState.queue.length > 0;
		const everyDone = anythingLeft && multiState.queue.every((it) => it.status === 'completed');
		if (everyDone) {
			multiState.allDoneAt = Date.now();
		}
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
	for (let i = 0; i < multiState.queue.length; i++) {
		const it = multiState.queue[i];
		if (it.status !== 'uploading') continue;
		if (markUploadingAsFailed) {
			Object.assign(it, { status: 'failed', progress: 0, error: 'Upload stopped' });
		} else {
			Object.assign(it, { status: 'queued', progress: 0, error: '' });
		}
	}
	multiState.currentId = null;
}

/**
 * رفع بند واحد. يُحدّث الحالة والتقدم. يُسجّل uploader في السجل كي يمكن
 * إجهاضه لاحقاً من خلال removeItem أو stopAll.
 *
 * - تحديثات `progress` مخنوقة (throttled) — كلّ ≥1% أو كلّ ≥100ms —
 *   لتقليل ضغط إعادة التصيير حين تكون عدة بنود ترفع بالتوازي.
 * - عمليّات النسخ المرآة (mshcat/oldapp) تُطلَق بـ fire-and-forget بعد
 *   نجاح الرفع: الملف يصبح في Storage + RTDB فوراً، والمرآة تحدث في
 *   الخلفية. أيّ فشل في المرآة يُسجَّل في `error` كتنبيه ناعم دون
 *   انتكاسة الحالة إلى failed (لأن الرفع الأصلي نجح فعلاً).
 */
async function uploadOne(itemId) {
	const startSnapshot = multiState.queue.find((it) => it.id === itemId);
	if (!startSnapshot) return;

	const contentType = mimeToContentType(startSnapshot.file.type);
	const metadata = {
		title: startSnapshot.form.title,
		description: startSnapshot.form.description || undefined,
		author: startSnapshot.form.author || undefined,
		subsection: String(startSnapshot.form.subsection),
		content_type: contentType,
		is_listed: startSnapshot.form.is_listed
	};
	if (startSnapshot.form.secondary_subsection) {
		metadata.secondary_subsection = String(startSnapshot.form.secondary_subsection);
	}

	// خانق تحديثات التقدم: نُمرّر فقط حين يتغيّر النص الظاهر فعلاً.
	let lastReported = -1;
	let lastReportedAt = 0;
	const onProgressThrottled = (p) => {
		const rounded = Math.round(p);
		const now = Date.now();
		if (rounded < 100 && rounded === lastReported && now - lastReportedAt < 100) return;
		if (rounded < 100 && now - lastReportedAt < 80) return;
		lastReported = rounded;
		lastReportedAt = now;
		updateItem(itemId, { progress: rounded });
	};

	const uploader = createFileUploader(startSnapshot.file, metadata, startSnapshot.thumbnail, {
		onProgress: onProgressThrottled,
		onStatus: () => {},
		onError: (msg) => {
			updateItem(itemId, { error: msg });
		}
	});

	uploaderRegistry.set(itemId, uploader);

	try {
		const result = await uploader.start();

		// النجاح الفعلي: الملف وصل Storage + RTDB. نضع البند مكتملاً
		// فوراً قبل تشغيل المرآة كي لا تحجز الواجهة أيّ شيء.
		const stillThere = multiState.queue.some((it) => it.id === itemId);
		if (stillThere) {
			updateItem(itemId, { status: 'completed', progress: 100, error: '' });
		}

		// نسخ مرآة في الخلفية (لا نُعطّل بقية الطابور إذا تأخّرت):
		// مشاركة في Mshcat أو ربط درس OldApp. الفشل يُسجَّل في `error`
		// كرسالة تحذير ناعمة دون إعادة الحالة إلى failed.
		const selSub = String(startSnapshot.form?.subsection || '');
		const selSec = String(startSnapshot.form?.secondary_subsection || '');
		if (selSub.startsWith('mshcat:') || selSec.startsWith('mshcat:')) {
			mirrorUploadedFileToMshcatBook({
				fileId: result?.id,
				subsectionId: startSnapshot.form?.subsection,
				secondarySubsectionId: startSnapshot.form?.secondary_subsection,
				fallbackMetadata: metadata
			}).catch((err) => {
				console.warn('[multiUpload] Mshcat mirror failed:', err);
				if (multiState.queue.some((it) => it.id === itemId)) {
					updateItem(itemId, { error: 'تمّ الرفع، لكنّ النسخ إلى Mshcat فشل.' });
				}
			});
		} else if (selSec.startsWith('oldapp:sub:')) {
			mirrorUploadedFileToOldAppLesson({
				fileId: result?.id,
				subsectionId: startSnapshot.form?.subsection,
				secondarySubsectionId: startSnapshot.form?.secondary_subsection,
				fallbackMetadata: metadata
			}).catch((err) => {
				console.warn('[multiUpload] OldApp mirror failed:', err);
				if (multiState.queue.some((it) => it.id === itemId)) {
					updateItem(itemId, { error: 'تمّ الرفع، لكنّ ربط الدرس في OldApp فشل.' });
				}
			});
		}

		// إشعار FCM (fire-and-forget، لا يُعطّل الطابور إن فشل).
		if (stillThere) {
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
