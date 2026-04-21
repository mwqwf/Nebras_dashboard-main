/**
 * uploadBridge.js — وحدة مشتركة لرفع الملفّات عبر Admin SDK إلى
 * Cloud Storage للمشاريع الثانويّة (Mshcat / OldApp). معزولة عمداً عن
 * نقاط الـ API لتُعاد استخدامها دون تكرار الكود.
 *
 * سلوك الرفع:
 *   1) يقرأ FormData من الطلب (حقل `file` إلزاميّ + `folder?` + `filename?`).
 *   2) يحفظ البايتات في دلو Storage الخاصّ بالتطبيق المطلوب.
 *   3) يضيف Custom metadata `firebaseStorageDownloadTokens` بقيمة UUID —
 *      هذا هو السلوك نفسه الذي تتّبعه SDKات Firebase في العميل، فيُنتَج
 *      رابط تنزيل Firebase قياسيّ يعمل مباشرةً من التطبيقات والمتصفّحات
 *      دون الحاجة لقواعد قراءة عمومية.
 *   4) يعيد رابطاً مباشراً بصيغة:
 *        https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<encoded>?alt=media&token=<t>
 *
 * ملاحظات عمليّة:
 *   • الدلو يُقرأ من `app.options.storageBucket` — الذي نُعيّنه من
 *     `MSHCAT_STORAGE_BUCKET` أو `OLDAPP_STORAGE_BUCKET` في .env.
 *   • الحدّ الأقصى الافتراضي لـ SvelteKit formData هو ~500KB إن لم يُضبط
 *     bodySizeLimit على مستوى المسار. استخدم `config.bodySizeLimit` داخل
 *     نقطة الـ upload لتكبيره عند الحاجة.
 */

import { json } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { getStorage } from 'firebase-admin/storage';

/**
 * يحوّل اسم الملف إلى شكل آمن للاستخدام كمفتاح داخل Bucket.
 * يحتفظ بالحروف الأبجديّة العربيّة/اللاتينيّة والأرقام ومحارف بسيطة،
 * ويستبدل الباقي بـ `_`.
 */
function sanitizeFilename(name) {
	const base = String(name || 'file')
		.trim()
		.replace(/[\u0000-\u001F\u007F]/g, '')
		// /, \, :, *, ?, ", <, >, | غير مسموح في كثير من الأنظمة.
		.replace(/[/\\:*?"<>|]+/g, '_');
	if (!base) return 'file';
	if (base.length > 160) return base.slice(0, 160);
	return base;
}

function sanitizeFolder(folder) {
	const raw = String(folder || '').trim();
	if (!raw) return '';
	return raw
		.split('/')
		.map((s) => s.trim())
		.filter(Boolean)
		.map((seg) => seg.replace(/[^A-Za-z0-9\u0600-\u06FF._-]+/g, '_'))
		.join('/');
}

function guessContentType(file) {
	const t = String(file?.type || '').trim();
	if (t) return t;
	return 'application/octet-stream';
}

/**
 * يبني رابط Firebase Storage عموميّاً مع Download Token.
 */
function buildDownloadUrl(bucketName, objectPath, token) {
	const encoded = encodeURIComponent(objectPath);
	return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media&token=${token}`;
}

/**
 * معالج عامّ — يستخدمه كلا الـ endpoints.
 *
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @param {object} opts
 * @param {() => import('firebase-admin/app').App} opts.getAdminApp   تطبيق Admin للمشروع المستهدف.
 * @param {() => boolean}                          opts.isConfigured   فحص تهيئة Service Account.
 * @param {string}                                 opts.missingEnvHint رسالة خطأ تخبر المستخدم عن اسم المتغيّر الناقص.
 * @param {string}                                 opts.defaultFolder  المجلّد الجذر داخل الدلو إن لم يُحدَّد.
 */
export async function handleAdminUpload(event, opts) {
	// ── طبقات الحماية ─────────────────────────────────────────
	const auth = event.locals?.auth;
	if (!auth) return json({ error: 'unauthenticated' }, { status: 401 });
	if (auth.role !== 'owner' && auth.role !== 'supervisor') {
		return json({ error: 'forbidden', reason: 'role_not_allowed' }, { status: 403 });
	}
	if (!opts.isConfigured()) {
		return json(
			{
				error: 'not_configured',
				reason: 'admin_service_account_missing',
				message: opts.missingEnvHint
			},
			{ status: 501 }
		);
	}

	// ── تهيئة التطبيق ودلو Storage ───────────────────────────
	let app;
	try {
		app = opts.getAdminApp();
	} catch (err) {
		return json(
			{
				error: 'not_configured',
				message: err?.message || 'admin app init failed'
			},
			{ status: 501 }
		);
	}

	const bucketName = app.options?.storageBucket;
	if (!bucketName) {
		return json(
			{
				error: 'not_configured',
				reason: 'storage_bucket_missing',
				message:
					'لم يُضبط storageBucket لهذا المشروع. أضف MSHCAT_STORAGE_BUCKET / OLDAPP_STORAGE_BUCKET في .env.'
			},
			{ status: 501 }
		);
	}

	// ── قراءة الملفّ من FormData ──────────────────────────────
	let formData;
	try {
		formData = await event.request.formData();
	} catch (err) {
		return json(
			{ error: 'bad_request', reason: 'invalid_form_data', message: err?.message || '' },
			{ status: 400 }
		);
	}

	const fileEntry = formData.get('file');
	if (!fileEntry || typeof fileEntry === 'string') {
		return json({ error: 'bad_request', reason: 'file_required' }, { status: 400 });
	}

	const uploaded = /** @type {File} */ (fileEntry);
	const folderInput = /** @type {string|null} */ (formData.get('folder'));
	const filenameInput = /** @type {string|null} */ (formData.get('filename'));

	const folder = sanitizeFolder(folderInput) || opts.defaultFolder;
	const originalName = sanitizeFilename(filenameInput || uploaded.name || 'file');

	// UUID لكلّ رفع — يضمن عدم التصادم عند رفع ملفّين بنفس الاسم.
	const token = randomUUID();
	const uid = String(event.locals?.auth?.uid || 'anon').replace(/[^A-Za-z0-9_-]+/g, '_');
	const pathSegments = [folder, uid, `${token}-${originalName}`].filter(Boolean);
	const objectPath = pathSegments.join('/');

	const contentType = guessContentType(uploaded);

	let buffer;
	try {
		buffer = Buffer.from(await uploaded.arrayBuffer());
	} catch (err) {
		return json(
			{ error: 'bad_request', reason: 'read_file_failed', message: err?.message || '' },
			{ status: 400 }
		);
	}

	// ── الرفع إلى Storage مع إضافة Download Token ──────────
	try {
		const bucket = getStorage(app).bucket(bucketName);
		const fileRef = bucket.file(objectPath);
		await fileRef.save(buffer, {
			contentType,
			resumable: false,
			metadata: {
				contentType,
				metadata: {
					firebaseStorageDownloadTokens: token,
					uploadedByUid: String(event.locals?.auth?.uid || ''),
					uploadedByEmail: String(event.locals?.auth?.email || ''),
					uploadedAt: new Date().toISOString()
				}
			}
		});

		const url = buildDownloadUrl(bucketName, objectPath, token);

		return json(
			{
				ok: true,
				url,
				path: objectPath,
				bucket: bucketName,
				contentType,
				size: buffer.byteLength,
				filename: originalName,
				downloadToken: token
			},
			{ status: 201 }
		);
	} catch (err) {
		return json(
			{
				error: 'upload_failed',
				message: err?.message || String(err || 'unknown error')
			},
			{ status: 500 }
		);
	}
}
