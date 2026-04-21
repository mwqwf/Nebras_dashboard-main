/**
 * hooks.server.js — جدار الحماية المركزي (SvelteKit Server Hook)
 *
 * هذه لوحة تحكّم SPA تعتمد المصادقة على جانب العميل (Firebase Auth).
 * ولذا فإنّ الطلبات الحسّاسة إلى نقاط الـ API الإداريّة يجب أن تُرفَق
 * دائماً بـ `Authorization: Bearer <Firebase ID token>`. هذا الملف يقوم
 * بـ:
 *
 *   1) التحقّق من صحّة التوكن عبر firebase-admin SDK.
 *   2) قراءة سجلّ المستخدم من `dashboard_users/{uid}`:
 *        • إن لم يوجد        → 401 (غير مصرّح — سيتكفّل العميل بإعادة
 *                              التوجيه إلى /login).
 *        • isBlocked === true → 403 + رسالة "تم تعليق وصولك من قبل
 *                               الإدارة"، والعميل يُسجِّل الخروج إجباريّاً.
 *        • خلاف ذلك         → يمرّر الطلب ويُرفق `locals.auth` بمعلومات
 *                             الصلاحيّة للمعالجات.
 *
 * ملاحظات معماريّة:
 *   • المسارات العامّة (/login) ومسارات auth (/api/auth/*) لا تمرّ بهذا
 *     الجدار — فذاك مطلوب لإتمام تسجيل الدخول نفسه.
 *   • صفحات الـ SPA (غير /api/…) لا يمكن فرضها خادميّاً بدون جلسة كوكي
 *     (والمصادقة هنا عميليّة بالكامل). التحقّق الفعلي للمالك/المحظور على
 *     الصفحات يُنفَّذ في `+layout.svelte` الجذر اعتماداً على نتيجة
 *     `/api/auth/check` (الذي يُعيد blocked:true فيُجبِر العميل تسجيل
 *     الخروج). هذا الـ hook يُغطّي طبقة الـ API Defense-in-depth.
 *
 * قواعد صارمة:
 *   • لا يطبّق على مسارات إنشاء الحساب (/api/auth/*) حتى لا نخرّب تدفّق
 *     OTP-Approval الحاليّ.
 *   • لا يُعدّل أي مسار آخر غير /api/admin/* (لتقليل احتمالات الكسر).
 */

import { json } from '@sveltejs/kit';
import { getAdminDatabase, verifyIdToken } from '$lib/server/firebaseAdmin.js';
import { isOwnerEmail } from '$lib/server/mailer.js';

const PROTECTED_PREFIX = '/api/admin/';

function extractBearer(request) {
	const header = request.headers.get('authorization') || request.headers.get('Authorization');
	if (!header) return '';
	const m = /^Bearer\s+(.+)$/i.exec(header.trim());
	return m ? m[1].trim() : '';
}

async function loadAuthorization(idToken) {
	const decoded = await verifyIdToken(idToken);
	const uid = decoded.uid;
	const email = decoded.email || '';

	const snap = await getAdminDatabase().ref(`dashboard_users/${uid}`).get();
	if (!snap.exists()) {
		// المالك قد يكون لم يُنشَأ سجلّه بعد (أوّل دخول) — نستعيد الحالة من
		// البريد المُوثَّق. في كلّ الحالات الأخرى نعتبره غير مُصرّح.
		if (isOwnerEmail(email)) {
			return {
				uid,
				email,
				role: 'owner',
				isBlocked: false,
				found: false,
				isOwnerByEmail: true
			};
		}
		return { uid, email, role: null, isBlocked: false, found: false, isOwnerByEmail: false };
	}

	const v = snap.val() || {};
	// الدور الفعلي بعد احتساب ترقية المالك (كمقياس احتياطي).
	const effectiveRole = isOwnerEmail(email) ? 'owner' : v.role === 'admin' ? 'supervisor' : v.role || 'supervisor';
	const isBlocked = isOwnerEmail(email) ? false : v.isBlocked === true;

	return {
		uid,
		email,
		role: effectiveRole,
		isBlocked,
		found: true,
		isOwnerByEmail: isOwnerEmail(email)
	};
}

/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
	const path = event.url.pathname;

	// الجدار يعمل فقط على نقاط /api/admin/* الحسّاسة.
	if (!path.startsWith(PROTECTED_PREFIX)) {
		return resolve(event);
	}

	const idToken = extractBearer(event.request);
	if (!idToken) {
		return json({ error: 'unauthenticated', reason: 'missing_bearer_token' }, { status: 401 });
	}

	let auth;
	try {
		auth = await loadAuthorization(idToken);
	} catch (err) {
		return json(
			{ error: 'invalid_token', message: err?.message || 'token verification failed' },
			{ status: 401 }
		);
	}

	// ليس عضواً في قائمة الـ admins إطلاقاً ⇒ طرد.
	if (!auth.found && !auth.isOwnerByEmail) {
		return json({ error: 'forbidden', reason: 'not_in_admins' }, { status: 403 });
	}

	// محظور ⇒ رسالة صريحة + إشارة للواجهة لتُجبِر تسجيل الخروج.
	if (auth.isBlocked) {
		return json(
			{
				error: 'blocked',
				reason: 'access_suspended',
				message: 'تم تعليق وصولك من قبل الإدارة',
				forceSignOut: true
			},
			{ status: 403 }
		);
	}

	event.locals.auth = auth;
	return resolve(event);
}
