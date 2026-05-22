/** حارس صفحة تدقيق المحتوى — للمالك فقط. */
import { redirect } from '@sveltejs/kit';

export function load(event) {
	const auth = event.locals?.auth;
	if (!auth) throw redirect(303, '/login');
	if (auth.role !== 'owner') throw redirect(303, '/moderator');
	return {};
}
