/**
 * smartUpload.js — الموجّه الذكي لرفع الملفّات حسب المشروع.
 *
 * استراتيجيّة التوجيه (مهمّة جدّاً):
 *   • target = 'nebras'   → رفع مباشر عبر Web SDK (قواعد Nebras تسمح
 *                          للمدير بالكتابة — لا نحتاج لوسيط).
 *   • target = 'mshcat'   → FormData → POST /api/mshcat/uploads.
 *   • target = 'oldapp'   → FormData → POST /api/oldapp/uploads.
 *
 * لماذا نُبقي Nebras على الـ Web SDK؟ لأنّ مدة الجلسة، التقدّم اللحظي
 * (progress)، الاستئناف عند الانقطاع (resumable) — كلّها تعمل بسلاسة
 * مع Firebase Storage Web SDK ولا يُستحسن إعادة اختراعها في الخادم.
 *
 * الواجهة موحَّدة — ترجع:
 *   { url, path, bucket?, contentType, size, filename, target }
 *
 * الأخطاء: ترمي الدالة Error بالحقل `.status` (إن كان من الخادم) ورسالة
 * عربيّة جاهزة للعرض. استخدمها داخل try/catch في صفحات .svelte.
 */

import {
	ref as storageRef,
	uploadBytes,
	uploadBytesResumable,
	getDownloadURL
} from 'firebase/storage';
import { getFirebaseStorage } from '$lib/firebase/client.js';
import { rawAuthedFetch } from './_authedFetch.js';

/** @typedef {'nebras'|'mshcat'|'oldapp'} UploadTarget */

/**
 * @typedef {Object} SmartUploadResult
 * @property {string} url          رابط التنزيل المباشر (قابل للحفظ في الـ DB).
 * @property {string} path         المسار الداخلي داخل الدلو.
 * @property {string|null} [bucket] اسم الدلو (يأتي من الخادم في حالة الثانويّة).
 * @property {string} contentType
 * @property {number} size
 * @property {string} filename
 * @property {UploadTarget} target
 * @property {string} [downloadToken] (Mshcat/OldApp فقط)
 */

function sanitizeSegment(name) {
	return String(name || 'file')
		.trim()
		.replace(/[\u0000-\u001F\u007F]/g, '')
		.replace(/[#$\[\]./\\:*?"<>|]+/g, '_')
		.slice(0, 180) || 'file';
}

function inferContentType(file) {
	return String(file?.type || '').trim() || 'application/octet-stream';
}

/**
 * يوجّه الرفع إلى القناة الصحيحة. لا يكتب شيئاً في قاعدة بيانات؛ يعيد
 * الرابط فقط لكي يحفظه المستدعي في المكان المناسب (Firestore / RTDB).
 *
 * @param {Object} opts
 * @param {File}   opts.file
 * @param {UploadTarget} opts.target
 * @param {string} [opts.folder]            مجلّد جذر داخل الدلو
 * @param {string} [opts.filename]          اسم مقترح للمفتاح داخل الدلو
 * @param {(pct:number)=>void} [opts.onProgress]  يعمل فقط مع nebras (resumable)
 * @param {()=>boolean} [opts.isAborted]    إشارة إلغاء (nebras فقط)
 * @param {(task:any)=>void} [opts.onTaskCreated]  مرجع للـ UploadTask (nebras فقط)
 * @returns {Promise<SmartUploadResult>}
 */
export async function smartUpload(opts) {
	const { file, target } = opts;
	if (!file || typeof file !== 'object' || !('size' in file)) {
		throw makeError('لم يُقدَّم ملف صالح للرفع.', 'invalid_file');
	}
	if (target === 'nebras') return uploadToNebras(opts);
	if (target === 'mshcat' || target === 'oldapp') return uploadToSecondary(opts);
	throw makeError(`هدف الرفع غير معروف: ${target}`, 'unknown_target');
}

/**
 * رفع مبسّط (غير resumable) لملفّ صغير مثل الـ thumbnails إلى Nebras.
 * يعيد URL فقط. للملفّات الكبيرة استخدم `smartUpload` مع onProgress.
 *
 * @param {File} file
 * @param {string} path المسار داخل دلو Nebras
 */
export async function uploadSmallToNebras(file, path) {
	const storage = getFirebaseStorage();
	if (!storage) {
		throw makeError('Firebase غير مهيّأ. تحقّق من متغيّرات VITE_FIREBASE_* في .env.', 'nebras_not_configured');
	}
	const ref = storageRef(storage, path);
	await uploadBytes(ref, file, { contentType: inferContentType(file) });
	return getDownloadURL(ref);
}

// ─────────────────────────────────────────────────────────────────
// Nebras — Web SDK مباشرة
// ─────────────────────────────────────────────────────────────────

async function uploadToNebras(opts) {
	const { file, folder = 'dashboard/uploads', filename, onProgress, isAborted, onTaskCreated } = opts;
	const storage = getFirebaseStorage();
	if (!storage) {
		throw makeError(
			'Firebase غير مهيّأ. تحقّق من متغيّرات VITE_FIREBASE_* في .env.',
			'nebras_not_configured'
		);
	}

	const safeName = sanitizeSegment(filename || file.name || 'file');
	const path = `${folder.replace(/^\/+|\/+$/g, '')}/${Date.now()}_${safeName}`;
	const ref = storageRef(storage, path);
	const contentType = inferContentType(file);

	// Resumable إن كنّا بحاجة إلى progress/إلغاء، وإلّا uploadBytes أبسط وأخف.
	const needsResumable = typeof onProgress === 'function' || typeof isAborted === 'function';

	if (!needsResumable) {
		await uploadBytes(ref, file, { contentType });
		const url = await getDownloadURL(ref);
		return {
			url,
			path,
			bucket: null,
			contentType,
			size: file.size,
			filename: safeName,
			target: /** @type {UploadTarget} */ ('nebras')
		};
	}

	const task = uploadBytesResumable(ref, file, { contentType });
	onTaskCreated?.(task);

	await new Promise((resolve, reject) => {
		task.on(
			'state_changed',
			(snap) => {
				if (typeof isAborted === 'function' && isAborted()) {
					task.cancel();
					return;
				}
				const total = snap.totalBytes || file.size || 1;
				onProgress?.((snap.bytesTransferred / total) * 100);
			},
			(err) => {
				if (err?.code === 'storage/canceled') reject(makeError('تمّ إلغاء الرفع.', 'aborted'));
				else reject(err);
			},
			() => resolve(undefined)
		);
	});

	if (typeof isAborted === 'function' && isAborted()) {
		throw makeError('تمّ إلغاء الرفع.', 'aborted');
	}

	const url = await getDownloadURL(task.snapshot.ref);
	return {
		url,
		path,
		bucket: null,
		contentType,
		size: file.size,
		filename: safeName,
		target: /** @type {UploadTarget} */ ('nebras')
	};
}

// ─────────────────────────────────────────────────────────────────
// Mshcat / OldApp — عبر جسر الخادم
// ─────────────────────────────────────────────────────────────────

async function uploadToSecondary(opts) {
	const { file, target, folder, filename } = opts;
	const form = new FormData();
	form.append('file', file);
	if (folder) form.append('folder', folder);
	if (filename) form.append('filename', filename);

	let res;
	try {
		res = await rawAuthedFetch(`/api/${target}/uploads`, {
			method: 'POST',
			body: form
		});
	} catch (networkErr) {
		throw makeError(
			'تعذّر الاتصال بالخادم — تأكد من اتصال الإنترنت ثمّ أعد المحاولة.',
			'network_error',
			0,
			networkErr
		);
	}

	let payload = null;
	try {
		payload = await res.json();
	} catch {
		payload = null;
	}

	if (!res.ok) {
		// نعيد رفع الخطأ للواجهة مع status + رسالة عربيّة قابلة للعرض.
		const reason = payload?.reason || payload?.error || '';
		const msg = payload?.message || mapStatusMessage(res.status, reason);
		throw makeError(msg, reason || null, res.status, null, payload);
	}

	const url = String(payload?.url || '');
	if (!url) throw makeError('الخادم لم يُرجع رابط التنزيل.', 'no_url', 500, null, payload);

	return {
		url,
		path: String(payload?.path || ''),
		bucket: payload?.bucket || null,
		contentType: String(payload?.contentType || inferContentType(file)),
		size: Number(payload?.size || file.size),
		filename: String(payload?.filename || sanitizeSegment(filename || file.name)),
		downloadToken: payload?.downloadToken || undefined,
		target
	};
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function makeError(message, reason = null, status = 0, cause = null, payload = null) {
	const err = /** @type {any} */ (new Error(message));
	err.reason = reason;
	err.status = status;
	err.payload = payload;
	if (cause) err.cause = cause;
	return err;
}

function mapStatusMessage(status, reason) {
	if (status === 401) return 'يجب تسجيل الدخول لإتمام الرفع.';
	if (status === 403) {
		if (reason === 'access_suspended') return 'تم تعليق وصولك من قبل الإدارة.';
		if (reason === 'role_not_allowed') return 'صلاحيّاتك لا تسمح بالرفع.';
		return 'الوصول مرفوض.';
	}
	if (status === 501) {
		return (
			'خاصيّة الرفع عبر السيرفر غير مفعّلة لهذا المشروع — ' +
			'يحتاج المسؤول إلى ضبط مفاتيح الخدمة ودلو التخزين في ملف .env.'
		);
	}
	if (status === 400) return 'طلب غير صالح — تحقّق من الملف المرفق.';
	if (status >= 500) return 'خطأ على الخادم أثناء الرفع — حاول مرّة أخرى لاحقاً.';
	return `تعذّر إتمام الرفع (HTTP ${status}).`;
}
