/**
 * POST /api/auth/check
 *
 * يستقبل ID token صادر من Firebase Auth في العميل، ويقرّر صلاحيّة
 * المستخدم وفق سياسة المصادقة الصارمة:
 *
 *   1) Google Sign-In حصراً (لا Email/Password إطلاقاً).
 *   2) Owner Bypass: إذا كان البريد القادم من Google يطابق OWNER_EMAIL
 *      في `.env` (بعد trim + lowercase) يُمنَح صلاحيّات الإدارة الكاملة
 *      فوراً، ويُسجَّل في `dashboard_users/{uid}` بدور `owner`، دون أيّ
 *      شاشة انتظار أو طلب رمز.
 *   3) أي مستخدم آخر:
 *        • إن كان مُدرَجاً مسبقاً في `dashboard_users` → authorized:true.
 *        • وإلا → needsOwnerCode:true (يُرسَل الرمز إلى المالك في طلب
 *          لاحق عبر /api/auth/request-code).
 *
 * Body: { idToken: string }
 *
 * Responses:
 *   200 { authorized: true,  user: { uid, email, displayName, photoURL, role } }
 *   200 { authorized: false, needsOwnerCode: true, user: {...} }
 *   401 { error: 'invalid_token' }
 *   500 { error: 'server_error' }
 */

import { json } from '@sveltejs/kit';
import { getAdminDatabase, verifyIdToken } from '$lib/server/firebaseAdmin.js';
import { isOwnerEmail } from '$lib/server/mailer.js';

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
	const email = decoded.email || '';
	const userInfo = {
		uid,
		email,
		displayName: decoded.name || '',
		photoURL: decoded.picture || ''
	};

	try {
		const db = getAdminDatabase();
		const userRef = db.ref(`dashboard_users/${uid}`);
		const snap = await userRef.get();

		// ─── 1) Owner Bypass ───────────────────────────────────────────
		// نتحقّق من هوية المالك عبر البريد الذي رجع من Google (decoded.email)
		// بعد التحقّق من ID token، فلا يمكن تزويره من المتصفّح. إذا تطابق،
		// نضمن وجود السجلّ في قاعدة البيانات (idempotent) ثم نعيده authorized.
		if (isOwnerEmail(email)) {
			const now = Date.now();
			if (snap.exists()) {
				const patch = { lastSignedInAt: now };
				// إن كان السجلّ موجوداً بدور سابق، نرفعه إلى owner مرّةً فقط.
				if (snap.val()?.role !== 'owner') {
					patch.role = 'owner';
				}
				await userRef.update(patch).catch(() => {});
			} else {
				await userRef.set({
					...userInfo,
					role: 'owner',
					createdAt: now,
					lastSignedInAt: now,
					createdVia: 'owner_bypass'
				});
			}
			return json({
				authorized: true,
				user: { ...userInfo, role: 'owner' }
			});
		}

		// ─── 2) مستخدم مُعتمَد مسبقاً ───────────────────────────────────
		if (snap.exists()) {
			await userRef
				.child('lastSignedInAt')
				.set(Date.now())
				.catch(() => {});
			return json({
				authorized: true,
				user: { ...userInfo, role: snap.val()?.role || 'admin' }
			});
		}

		// ─── 3) مستخدم جديد غير المالك → يحتاج رمز المالك ───────────────
		return json({ authorized: false, needsOwnerCode: true, user: userInfo });
	} catch (err) {
		console.error('[api/auth/check] server_error:', err);
		return json({ error: 'server_error', message: err?.message || 'unknown' }, { status: 500 });
	}
}
