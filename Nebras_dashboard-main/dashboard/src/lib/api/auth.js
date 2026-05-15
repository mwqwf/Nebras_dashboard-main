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
	signInWithRedirect,
	getRedirectResult,
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
		// توكن جديد يتضمّن Custom Claims بعد مزامنة الخادم (Firestore rules).
		await fetchIdToken(true);
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

/** @returns {boolean} */
function isLocalDevHost() {
	if (typeof window === 'undefined') return true;
	const host = window.location.hostname;
	return host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
}

/**
 * على عنوان LAN (مثل 10.x) تفشل signInWithPopup غالباً بـ unauthorized-domain
 * ما لم يُضف العنوان يدوياً في Firebase Console. نفضّل redirect هناك.
 * @returns {boolean}
 */
function shouldPreferGoogleRedirect() {
	return typeof window !== 'undefined' && !isLocalDevHost();
}

const POPUP_FALLBACK_CODES = new Set([
	'auth/unauthorized-domain',
	'auth/operation-not-supported-in-this-environment',
	'auth/popup-blocked',
	'auth/popup-closed-by-user' // أحياناً يظهر عند حظر النافذة المنبثقة
]);

function isCancelledAuthError(code) {
	return (
		code === 'auth/popup-closed-by-user' ||
		code === 'auth/cancelled-popup-request' ||
		code === 'auth/user-cancelled'
	);
}

/**
 * يُكمِل تسجيل الدخول بعد العودة من signInWithRedirect.
 * يُستدعى من صفحة /login عند التحميل.
 */
export async function completeGoogleRedirectSignIn() {
	const auth = getFirebaseAuth();
	if (!auth) {
		return {
			handled: false,
			ok: false,
			signedIn: false,
			authorized: false,
			needsOwnerCode: false,
			error: 'firebase_not_configured'
		};
	}

	try {
		const result = await getRedirectResult(auth);
		if (!result?.user) {
			return {
				handled: false,
				ok: true,
				signedIn: false,
				authorized: false,
				needsOwnerCode: false
			};
		}
		setUser(toPlainUser(result.user));
		const checked = await checkCurrentAuth();
		return { handled: true, ok: true, ...checked };
	} catch (err) {
		const code = err?.code || '';
		if (isCancelledAuthError(code)) {
			return {
				handled: true,
				ok: false,
				signedIn: false,
				authorized: false,
				needsOwnerCode: false,
				error: 'cancelled'
			};
		}
		console.error('[auth] completeGoogleRedirectSignIn failed:', err);
		return {
			handled: true,
			ok: false,
			signedIn: false,
			authorized: false,
			needsOwnerCode: false,
			error: code || 'unknown'
		};
	}
}

async function startGoogleRedirect(auth) {
	const provider = buildGoogleProvider();
	await signInWithRedirect(auth, provider);
	return {
		ok: true,
		pendingRedirect: true,
		signedIn: false,
		authorized: false,
		needsOwnerCode: false
	};
}

/**
 * يفتح نافذة Google Sign-In. عند النجاح يُحدِّث store ثمّ يُعيد نتيجة
 * التحقّق من الأهليّة (checkCurrentAuth).
 *
 * على عناوين الشبكة المحلية (غير localhost) يُستخدم redirect تلقائياً.
 *
 * @returns {Promise<{ ok: boolean, signedIn: boolean, authorized: boolean, needsOwnerCode: boolean, pendingRedirect?: boolean, error?: string }>}
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

	if (shouldPreferGoogleRedirect()) {
		try {
			return await startGoogleRedirect(auth);
		} catch (err) {
			console.error('[auth] signInWithRedirect failed:', err);
			return {
				ok: false,
				signedIn: false,
				authorized: false,
				needsOwnerCode: false,
				error: err?.code || 'unknown'
			};
		}
	}

	try {
		const provider = buildGoogleProvider();
		const result = await signInWithPopup(auth, provider);
		setUser(toPlainUser(result.user));
		const checked = await checkCurrentAuth();
		return { ok: true, ...checked };
	} catch (err) {
		const code = err?.code || '';
		if (isCancelledAuthError(code)) {
			return {
				ok: false,
				signedIn: false,
				authorized: false,
				needsOwnerCode: false,
				error: 'cancelled'
			};
		}
		if (POPUP_FALLBACK_CODES.has(code)) {
			try {
				return await startGoogleRedirect(auth);
			} catch (redirectErr) {
				console.error('[auth] redirect fallback failed:', redirectErr);
				return {
					ok: false,
					signedIn: false,
					authorized: false,
					needsOwnerCode: false,
					error: redirectErr?.code || code || 'unknown'
				};
			}
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

/** يحوّل رمز خطأ Firebase إلى مفتاح ترجمة في الواجهة. */
export function authErrorTranslationKey(error) {
	switch (error) {
		case 'firebase_not_configured':
			return 'auth.error.firebase_not_configured';
		case 'auth/unauthorized-domain':
			return 'auth.error.unauthorized_domain';
		case 'auth/popup-blocked':
		case 'auth/operation-not-supported-in-this-environment':
			return 'auth.error.popup_blocked';
		default:
			return 'auth.error.google_failed';
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
		await fetchIdToken(true);
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
