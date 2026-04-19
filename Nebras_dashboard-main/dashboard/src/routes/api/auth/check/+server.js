/**
 * POST /api/auth/check
 *
 * يستقبل ID token صادر من Firebase Auth في العميل، ويتحقّق من كون
 * الـ UID مُدرَجاً ضمن قائمة المصرّح لهم `dashboard_users/{uid}`.
 *
 * Body: { idToken: string }
 *
 * Responses:
 *   200 { authorized: true,  user: { uid, email, displayName, photoURL } }
 *        — مستخدم معترف به؛ يمكن دخول لوحة التحكّم مباشرةً.
 *   200 { authorized: false, needsOwnerCode: true,
 *         user: { uid, email, displayName, photoURL } }
 *        — مستخدم جديد؛ يجب تمرير مرحلة رمز المالك لإتمام إنشاء الحساب.
 *   401 { error: 'invalid_token' } — التوكن غير صالح أو منتهي.
 *   500 { error: 'server_error' }
 */

import { json } from '@sveltejs/kit';
import { getAdminDatabase, verifyIdToken } from '$lib/server/firebaseAdmin.js';

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function POST({ request }) {
	let body;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'invalid_json' }, { status: 400 });
	}

	let decoded;
	try {
		decoded = await verifyIdToken(body?.idToken);
	} catch (err) {
		return json(
			{ error: 'invalid_token', message: err?.message || 'token verification failed' },
			{ status: 401 }
		);
	}

	const uid = decoded.uid;
	const userInfo = {
		uid,
		email: decoded.email || '',
		displayName: decoded.name || '',
		photoURL: decoded.picture || ''
	};

	try {
		const db = getAdminDatabase();
		const snap = await db.ref(`dashboard_users/${uid}`).get();

		if (snap.exists()) {
			// تحديث آخر دخول (بهدوء — لا نُفشل الاستجابة إن فشل الكتابة)
			await db
				.ref(`dashboard_users/${uid}/lastSignedInAt`)
				.set(Date.now())
				.catch(() => {});

			return json({ authorized: true, user: userInfo });
		}

		return json({ authorized: false, needsOwnerCode: true, user: userInfo });
	} catch (err) {
		console.error('[api/auth/check] server_error:', err);
		return json({ error: 'server_error', message: err?.message || 'unknown' }, { status: 500 });
	}
}
