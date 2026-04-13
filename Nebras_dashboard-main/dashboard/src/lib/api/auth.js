/**
 * Auth API — Login, Refresh, Me, Logout
 *
 * Refresh token storage note:
 * Ideally, the backend should set the refresh token as an httpOnly
 * Set-Cookie header. Since JS cannot set httpOnly cookies, we store
 * it in a regular Secure, SameSite=Strict cookie as the best
 * available alternative. For production, configure the backend to
 * return the refresh token via Set-Cookie.
 */

import { setUser, setAccessToken, clearAuth } from '$lib/stores/auth.svelte.js';
import { goto } from '$app/navigation';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

// ─── Cookie Helpers ─────────────────────────────────────

function setRefreshCookie(token) {
    const maxAge = 60 * 60 * 24 * 7; // 7 days
    document.cookie = `nebras_refresh=${token}; path=/; max-age=${maxAge}; SameSite=Strict; Secure`;
}

function getRefreshCookie() {
    const match = document.cookie.match(/(?:^|;\s*)nebras_refresh=([^;]*)/);
    return match ? match[1] : null;
}

function clearRefreshCookie() {
    document.cookie = 'nebras_refresh=; path=/; max-age=0; SameSite=Strict; Secure';
}

// ─── Login ──────────────────────────────────────────────

/**
 * Authenticate with username + password.
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{ success: boolean, error?: string }>}
 */
export async function login(username, password) {
    try {
        const res = await fetch(`${API_BASE}/api/users/login/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
            credentials: 'include'
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            return {
                success: false,
                error: data.detail || data.non_field_errors?.[0] || 'Invalid credentials'
            };
        }

        const data = await res.json();

        // Store access token in memory
        setAccessToken(data.access);

        // Store refresh token in cookie
        if (data.refresh) {
            setRefreshCookie(data.refresh);
        }

        // Fetch complete user profile data immediately (including profile_image url)
        await fetchMe();

        return { success: true };
    } catch (err) {
        return {
            success: false,
            error: 'Network error. Please check your connection.'
        };
    }
}

// ─── Refresh ────────────────────────────────────────────

/**
 * Attempt silent token refresh using the stored refresh cookie.
 * @returns {Promise<boolean>} true if refresh succeeded
 */
export async function refreshAccessToken() {
    const refreshToken = getRefreshCookie();
    if (!refreshToken) return false;

    try {
        const res = await fetch(`${API_BASE}/api/users/token/refresh/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh: refreshToken }),
            credentials: 'include'
        });

        if (!res.ok) {
            clearRefreshCookie();
            return false;
        }

        const data = await res.json();
        setAccessToken(data.access);

        // Some backends also rotate the refresh token
        if (data.refresh) {
            setRefreshCookie(data.refresh);
        }

        return true;
    } catch {
        return false;
    }
}

// ─── Fetch Current User ─────────────────────────────────

/**
 * Fetch current user profile from /api/users/me/.
 * Requires a valid access token in memory.
 * @returns {Promise<boolean>} true if user was fetched successfully
 */
export async function fetchMe() {
    const { getAuthState } = await import('$lib/stores/auth.svelte.js');
    const state = getAuthState();

    if (!state.accessToken) return false;

    try {
        const res = await fetch(`${API_BASE}/api/users/me/`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.accessToken}`
            },
            credentials: 'include'
        });

        if (!res.ok) return false;

        const user = await res.json();
        setUser(user);
        return true;
    } catch {
        return false;
    }
}

// ─── Logout ─────────────────────────────────────────────

/**
 * Clear all auth state and redirect to login.
 */
export function logout() {
    clearAuth();
    clearRefreshCookie();
    goto('/login');
}
