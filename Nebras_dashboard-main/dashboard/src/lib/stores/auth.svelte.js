/**
 * Auth Store — Svelte 5 Reactive Store
 *
 * الحالة موحّدة بـ Firebase Authentication:
 *   user         : الكائن القياسيّ من firebase/auth (أو null).
 *   authorized   : هل تمّ التحقّق من وجود الـ UID في dashboard_users.
 *   isLoading    : true أثناء bootstrap الأوّلي و/أو أثناء check.
 *   needsOwnerCode : true إذا كان المستخدم جديداً ويجب أن يُدخِل الرمز.
 *
 * ملاحظات:
 *   • لا نحتفظ بأيّ JWT يدويّاً؛ Firebase يتكفّل بـ refresh + persistence.
 *   • viewMode محفوظ في localStorage (بقي من التصميم السابق).
 */

function loadFromStorage(key, fallback) {
	if (typeof window === 'undefined') return fallback;
	try {
		const raw = localStorage.getItem(key);
		return raw ? JSON.parse(raw) : fallback;
	} catch {
		return fallback;
	}
}

function saveToStorage(key, value) {
	if (typeof window === 'undefined') return;
	try {
		if (value === null || value === undefined) {
			localStorage.removeItem(key);
		} else {
			localStorage.setItem(key, JSON.stringify(value));
		}
	} catch {
		/* ignore */
	}
}

/**
 * @typedef {Object} AuthUser
 * @property {string} uid
 * @property {string} email
 * @property {string} displayName
 * @property {string} photoURL
 */

/** @type {{
 *   user: AuthUser|null,
 *   authorized: boolean,
 *   isLoading: boolean,
 *   needsOwnerCode: boolean,
 *   viewMode: 'admin'|'moderator'
 * }} */
let authState = $state({
	user: null,
	authorized: false,
	isLoading: true,
	needsOwnerCode: false,
	viewMode: loadFromStorage('nebras_view_mode', 'admin')
});

// ─── Setters ────────────────────────────────────────────

export function setUser(user) {
	authState.user = user;
}

export function setAuthorized(value) {
	authState.authorized = Boolean(value);
}

export function setNeedsOwnerCode(value) {
	authState.needsOwnerCode = Boolean(value);
}

export function setLoading(loading) {
	authState.isLoading = Boolean(loading);
}

export function setViewMode(mode) {
	authState.viewMode = mode;
	saveToStorage('nebras_view_mode', mode);
}

export function toggleViewMode() {
	const newMode = authState.viewMode === 'admin' ? 'moderator' : 'admin';
	authState.viewMode = newMode;
	saveToStorage('nebras_view_mode', newMode);
}

export function clearAuth() {
	authState.user = null;
	authState.authorized = false;
	authState.needsOwnerCode = false;
}

export function getAuthState() {
	return authState;
}
