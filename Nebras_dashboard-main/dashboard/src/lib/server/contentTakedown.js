/**
 * حذف محتوًى مخالف من كلّ المواضع — مصدر واحد لمنطق الإزالة يستخدمه:
 *   • واجهة بلاغات المحتوى   (/api/admin/reports)
 *   • أداة تدقيق المحتوى      (/api/admin/content-audit)
 *
 * يحذف من: content_unified_files + dashboard_uploads + content_unified_youtube
 * + ملفّ Storage المرتبط (PDF/صوت/فيديو) + الصور المصغّرة، إن وُجدت.
 */
import {
	getNebrasFirestoreAdmin,
	getNebrasAdminApp
} from '$lib/server/firebaseAdmin.js';
import { getStorage } from 'firebase-admin/storage';
import { adminFsDeleteFileMirrorBoth } from '$lib/server/nebrasUnifiedFirestoreAdmin.js';
import {
	NEBRAS_FS_CONTENT_FILES,
	NEBRAS_FS_CONTENT_YOUTUBE
} from '$lib/firebase/nebrasUnifiedPaths.js';

/**
 * @param {string} contentId
 * @param {string} [contentType] 'youtube' أو غيره
 */
export async function deleteContentEverywhere(contentId, contentType = '') {
	const id = String(contentId || '').trim();
	if (!id) return;
	const fs = getNebrasFirestoreAdmin();
	const isYouTube = String(contentType || '').toLowerCase() === 'youtube';

	if (isYouTube) {
		await fs.collection(NEBRAS_FS_CONTENT_YOUTUBE).doc(id).delete().catch(() => {});
		return;
	}

	// نقرأ storagePath قبل الحذف لإزالة الملفّ الفعليّ.
	let storagePath = '';
	try {
		const snap = await fs.collection(NEBRAS_FS_CONTENT_FILES).doc(id).get();
		if (snap.exists) storagePath = String(snap.data()?.storagePath || '');
	} catch {
		/* ignore */
	}

	await adminFsDeleteFileMirrorBoth(id).catch(() => {});
	// احتياطاً: احذف وثيقة YouTube بنفس المعرّف إن كان النوع غير دقيق.
	await fs.collection(NEBRAS_FS_CONTENT_YOUTUBE).doc(id).delete().catch(() => {});

	if (storagePath) {
		try {
			const bucket = getStorage(getNebrasAdminApp()).bucket();
			await bucket.file(storagePath).delete({ ignoreNotFound: true });
			const folder = storagePath.split('/').slice(0, -1).join('/');
			const [files] = await bucket.getFiles({ prefix: `${folder}/thumbnail_` });
			for (const f of files) {
				await f.delete({ ignoreNotFound: true }).catch(() => {});
			}
		} catch (err) {
			console.warn('[takedown] storage delete failed:', err?.message || String(err));
		}
	}
}
