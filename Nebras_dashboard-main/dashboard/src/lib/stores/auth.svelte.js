/**
 * Auth Store — Svelte 5 Reactive Store
 *
 * Stores the authenticated user and access token in localStorage
 * so page refreshes are instant (no need for a /refresh call every time).
 * Refresh token is still handled via a Secure cookie for silent renewal.
 *
 * viewMode: 'admin' | 'moderator' — allows admins to toggle
 * their dashboard view without changing their actual role.
 */

// ─── LocalStorage helpers (safe for SSR) ────────────────

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
        // Storage full or blocked — ignore silently
    }
}

function clearStorage() {
    if (typeof window === 'undefined') return;
    try {
        localStorage.removeItem('nebras_access_token');
        localStorage.removeItem('nebras_user');
        localStorage.removeItem('nebras_view_mode');
    } catch {
        // ignore
    }
}

// ─── State (hydrated from localStorage) ─────────────────

/** @type {{ user: object|null, accessToken: string|null, isLoading: boolean, viewMode: 'admin'|'moderator' }} */
let authState = $state({
    user: loadFromStorage('nebras_user', null),
    accessToken: loadFromStorage('nebras_access_token', null),
    isLoading: true,
    viewMode: loadFromStorage('nebras_view_mode', 'admin')
});

// ─── Setters (persist to localStorage) ──────────────────

export function setUser(user) {
    authState.user = user;
    saveToStorage('nebras_user', user);
}

export function setAccessToken(token) {
    authState.accessToken = token;
    saveToStorage('nebras_access_token', token);
}

export function setLoading(loading) {
    authState.isLoading = loading;
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
    authState.accessToken = null;
    authState.viewMode = 'admin';
    clearStorage();
}

// ─── Getters (reactive via $derived) ────────────────────

export function getAuthState() {
    return authState;
}
