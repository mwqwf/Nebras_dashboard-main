/**
 * moderation.js — wrappers للواجهة لاستدعاء نقاط الإشراف الخاصّة بالمالك
 * (بلاغات المحتوى + تدقيق المحتوى) عبر `authedJson` الذي يُرفق
 * `Authorization: Bearer <ID token>` — وهو ما تتطلّبه نقاط /api/admin/*.
 */
import { authedJson } from '$lib/api/_authedFetch.js';

/** قائمة البلاغات المعلّقة. */
export function listReports() {
	return authedJson('/api/admin/reports');
}

/** حذف المحتوى المُبلَّغ عنه (وتعليم البلاغ محذوفاً). */
export function deleteReportedContent({ reportId, contentId, contentType }) {
	return authedJson('/api/admin/reports', {
		method: 'POST',
		body: { action: 'delete', reportId, contentId, contentType }
	});
}

/** تجاهل بلاغ كاذب. */
export function dismissReport(reportId) {
	return authedJson('/api/admin/reports', {
		method: 'POST',
		body: { action: 'dismiss', reportId }
	});
}

/** تشغيل تدقيق المحتوى وإرجاع العناصر المُعلَّمة. */
export function runContentAudit() {
	return authedJson('/api/admin/content-audit');
}

/** حذف عنصر محتوى من أداة التدقيق. */
export function deleteAuditContent({ contentId, contentType }) {
	return authedJson('/api/admin/content-audit', {
		method: 'POST',
		body: { action: 'delete', contentId, contentType }
	});
}
