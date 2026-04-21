/**
 * Auth API — Google Sign-In + جسر إلى مسارات الخادم (/api/auth/*).
 *
 * كلّ العمليّات الحسّاسة (التحقّق من الأهليّة، توليد الرمز، التحقّق منه)
 * تجري في الخادم. الواجهة مسؤولة فقط عن:
 *   1) فتح نافذة Google Sign-In عبر Firebase Auth.
 *   2) التقاط ID token وإرساله للخادم في كلّ طلب حسّاس.
 *
 * تنبيه: إيميل المالك لا يُعاد إلى الواجهة أبداً؛ كلّ الرسائل تقول
 * فقط «الرمز أُرسل إلى المالك».
 */

import {
	signInWithPopup,
	onAuthStateChanged,
	signOut as firebaseSignOut,
	getIdToken
} from 'firebase/auth';
import { getFirebaseAuth, buildGoogleProvider } from '$lib/firebase/client.js';
import {
	getAuthState,
	setUser,
	setAuthorized,
	setNeedsOwnerCode,
	setLoading,
	setRole,
	setBlocked,
	clearAuth
} from '$lib/stores/auth.svelte.js';

function toPlainUser(firebaseUser) {
	if (!firebaseUser) return null;
	return {
		uid: firebaseUser.uid,
		email: firebaseUser.email || '',
		displayName: firebaseUser.displayName || '',
		photoURL: firebaseUser.photoURL || ''
	};
}

async function fetchIdToken(forceRefresh = false) {
	const auth = getFirebaseAuth();
	if (!auth?.currentUser) return null;
	try {
		return await getIdToken(auth.currentUser, forceRefresh);
	} catch (err) {
		console.warn('[auth] getIdToken failed:', err);
		return null;
	}
}

async function postJson(path, body) {
	const res = await fetch(path, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(body)
	});
	let data = null;
	try {
		data = await res.json();
	} catch {
		data = null;
	}
	return { status: res.status, ok: res.ok, data };
}

// ─── Public API ─────────────────────────────────────────

/**
 * استدعاء واحد للتحقّق من حالة المستخدم الحاليّة (مستخدم Google صالح
 * + مُدرَج في قائمة المصرّح لهم + غير محظور).
 *
 * يُحدِّث store تلقائياً ويُرجِع النتيجة المختصرة. في حال كان السجلّ
 * يحمل isBlocked:true يقوم بتسجيل خروج إجباري فوراً ويعيد حالة محظور.
 *
 * @returns {Promise<{ signedIn: boolean, authorized: boolean, needsOwnerCode: boolean, blocked?: boolean, role?: 'owner'|'supervisor'|null }>}
 */
export async function checkCurrentAuth() {
	const idToken = await fetchIdToken(false);
	if (!idToken) {
		setAuthorized(false);
		setNeedsOwnerCode(false);
		setRole(null);
		setBlocked(false);
		return { signedIn: false, authorized: false, needsOwnerCode: false };
	}

	const { ok, data } = await postJson('/api/auth/check', { idToken });
	if (!ok || !data) {
		setAuthorized(false);
		setNeedsOwnerCode(false);
		setRole(null);
		setBlocked(false);
		return { signedIn: true, authorized: false, needsOwnerCode: false };
	}

	// تم الحظر من قِبل الإدارة ⇒ تسجيل خروج إجباري فوري.
	if (data.blocked) {
		setAuthorized(false);
		setNeedsOwnerCode(false);
		setRole(null);
		setBlocked(true);
		try {
			const auth = getFirebaseAuth();
			if (auth) await firebaseSignOut(auth);
		} catch (err) {
			console.warn('[auth] forced signOut failed:', err);
		}
		return {
			signedIn: false,
			authorized: false,
			needsOwnerCode: false,
			blocked: true,
			role: null
		};
	}

	if (data.authorized) {
		const role = data?.user?.role === 'owner' ? 'owner' : 'supervisor';
		setAuthorized(true);
		setNeedsOwnerCode(false);
		setRole(role);
		setBlocked(false);
		return {
			signedIn: true,
			authorized: true,
			needsOwnerCode: false,
			role
		};
	}

	setAuthorized(false);
	setNeedsOwnerCode(Boolean(data.needsOwnerCode));
	setRole(null);
	setBlocked(false);
	return { signedIn: true, authorized: false, needsOwnerCode: Boolean(data.needsOwnerCode) };
}

/**
 * يفتح نافذة Google Sign-In. عند النجاح يُحدِّث store ثمّ يُعيد نتيجة
 * التحقّق من الأهليّة (checkCurrentAuth).
 *
 * @returns {Promise<{ ok: boolean, signedIn: boolean, authorized: boolean, needsOwnerCode: boolean, error?: string }>}
 */
export async function signInWithGoogle() {
	const auth = getFirebaseAuth();
	if (!auth) {
		return {
			ok: false,
			signedIn: false,
			authorized: false,
			needsOwnerCode: false,
			error: 'firebase_not_configured'
		};
	}

	try {
		const provider = buildGoogleProvider();
		const result = await signInWithPopup(auth, provider);
		setUser(toPlainUser(result.user));
		const checked = await checkCurrentAuth();
		return { ok: true, ...checked };
	} catch (err) {
		const code = err?.code || '';
		if (
			code === 'auth/popup-closed-by-user' ||
			code === 'auth/cancelled-popup-request' ||
			code === 'auth/user-cancelled'
		) {
			return {
				ok: false,
				signedIn: false,
				authorized: false,
				needsOwnerCode: false,
				error: 'cancelled'
			};
		}
		console.error('[auth] signInWithGoogle failed:', err);
		return {
			ok: false,
			signedIn: false,
			authorized: false,
			needsOwnerCode: false,
			error: code || 'unknown'
		};
	}
}

/**
 * يطلب من الخادم إرسال رمز تحقّق جديد إلى بريد المالك.
 * @returns {Promise<{ ok: boolean, delivered?: boolean, reason?: string, retryAfterSec?: number }>}
 */
export async function requestOwnerCode() {
	const idToken = await fetchIdToken(true);
	if (!idToken) return { ok: false, reason: 'not_signed_in' };

	const { ok, status, data } = await postJson('/api/auth/request-code', { idToken });
	if (!ok) {
		return { ok: false, reason: data?.reason || data?.error || `http_${status}` };
	}
	if (data?.ok === false) {
		return { ok: false, reason: data.reason, retryAfterSec: data.retryAfterSec };
	}
	return { ok: true, delivered: Boolean(data?.delivered) };
}

/**
 * يُرسل الرمز للتحقّق. عند النجاح يُضاف المستخدم لقائمة المصرّح لهم
 * في الخادم، ونحدِّث store محلّياً.
 *
 * @param {string} code
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function verifyOwnerCode(code) {
	const idToken = await fetchIdToken(true);
	if (!idToken) return { ok: false, reason: 'not_signed_in' };

	const { ok, status, data } = await postJson('/api/auth/verify-code', { idToken, code });
	if (!ok) {
		return { ok: false, reason: data?.reason || data?.error || `http_${status}` };
	}
	if (data?.ok) {
		const role = data?.user?.role === 'owner' ? 'owner' : 'supervisor';
		setAuthorized(true);
		setNeedsOwnerCode(false);
		setRole(role);
		setBlocked(false);
		return { ok: true };
	}
	return { ok: false, reason: data?.reason || 'unknown' };
}

/**
 * تسجيل الخروج — يفسخ جلسة Firebase ويُنظّف store.
 */
export async function logout() {
	const auth = getFirebaseAuth();
	try {
		if (auth) await firebaseSignOut(auth);
	} catch (err) {
		console.warn('[auth] signOut error:', err);
	} finally {
		clearAuth();
	}
}

/**
 * يُشغِّل مُستمعاً موحّداً لحالة Firebase Auth. يُستخدَم مرّة واحدة
 * في +layout.svelte الجذر.
 *
 * عند تغيّر المستخدم:
 *   • null → نُنظّف store ونوقف التحميل.
 *   • user → نخزّنه ثم نستدعي checkCurrentAuth لتحديد الأهليّة.
 */
export function startAuthListener() {
	const auth = getFirebaseAuth();
	if (!auth) {
		setLoading(false);
		return () => {};
	}

	return onAuthStateChanged(auth, async (firebaseUser) => {
		if (!firebaseUser) {
			clearAuth();
			setLoading(false);
			return;
		}
		setUser(toPlainUser(firebaseUser));
		try {
			await checkCurrentAuth();
		} finally {
			setLoading(false);
		}
	});
}

// (اختياري) مُساعد لإرجاع الـ user الحالي من store
export function getCurrentUser() {
	return getAuthState().user;
}
