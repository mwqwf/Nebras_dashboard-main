/**
 * GET /api/admin/internet-archive/sections
 *
 * يُعيد شجرة الأقسام الحاليّة لاختيار التصنيف الهدف عند الاستيراد. لا
 * يلمس IA — قراءة Firestore فقط. آمن للاستدعاء المتكرّر.
 */

import { json } from '@sveltejs/kit';
import { buildSectionsTree } from '$lib/server/noorLibrary/sectionsTree.js';

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function GET(event) {
	const auth = event.locals?.auth;
	if (!auth) return json({ error: 'unauthenticated' }, { status: 401 });
	if (auth.role !== 'owner' && auth.role !== 'supervisor') {
		return json({ error: 'forbidden', reason: 'role_not_allowed' }, { status: 403 });
	}

	try {
		const sections = await buildSectionsTree();
		return json({ ok: true, tree: sections.tree });
	} catch (err) {
		return json(
			{ error: 'sections_read_failed', message: err?.message || String(err) },
			{ status: 500 }
		);
	}
}
