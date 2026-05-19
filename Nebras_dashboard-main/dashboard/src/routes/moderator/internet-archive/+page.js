import { redirect } from '@sveltejs/kit';

/** اختصار من مسار moderator إلى صفحة المحرّك الفعليّة. */
export function load() {
	redirect(307, '/admin/internet-archive');
}
