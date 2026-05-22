/**
 * حارس صفحة بلاغات المحتوى — للمالك فقط. غير المالك يُحوّل إلى لوحته.
 * البيانات تُجلب من `/api/admin/reports` في المتصفّح ليبقى مصدر واحد للحقيقة.
 */
import { redirect } from '@sveltejs/kit';

export function load(event) {
	const auth = event.locals?.auth;
	if (!auth) throw redirect(303, '/login');
	if (auth.role !== 'owner') throw redirect(303, '/moderator');
	return {};
}
