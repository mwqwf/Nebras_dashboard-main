import { redirect } from '@sveltejs/kit';

/** الرابط القديم — المحرّك يعمل في الخلفية فقط، بدون صفحة تحكم. */
export function load() {
	redirect(307, '/moderator/content/files');
}
