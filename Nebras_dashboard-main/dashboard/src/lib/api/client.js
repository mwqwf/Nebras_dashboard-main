/**
 * API Client — Fetch wrapper with JWT auth
 *
 * - Attaches Bearer token from in-memory store
 * - On 401: attempts one silent refresh, retries original request
 * - On refresh failure: clears auth and redirects to /
 */

import { getAuthState, setAccessToken, clearAuth } from '$lib/stores/auth.svelte.js';
import { refreshAccessToken } from '$lib/api/auth.js';
import { goto } from '$app/navigation';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

/**
 * Make an authenticated API request.
 * @param {string} endpoint - API path (e.g. '/api/users/me/')
 * @param {RequestInit} options - Fetch options
 * @param {boolean} _isRetry - Internal flag, do not use externally
 * @returns {Promise<Response>}
 */
export async function apiRequest(endpoint, options = {}, _isRetry = false) {
    const state = getAuthState();
    const url = `${API_BASE}${endpoint}`;

    const isFormData = options.body instanceof FormData;

    const headers = {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...options.headers
    };

    // Attach Bearer token if available
    if (state.accessToken) {
        headers['Authorization'] = `Bearer ${state.accessToken}`;
    }

    const response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include' // include cookies for refresh token
    });

    // If 401 and not already a retry, attempt silent refresh
    if (response.status === 401 && !_isRetry) {
        const refreshed = await refreshAccessToken();
        if (refreshed) {
            // Retry original request with new token
            return apiRequest(endpoint, options, true);
        } else {
            // Refresh failed — clear state and redirect to root
            clearAuth();
            goto('/');
            throw new Error('Session expired. Please log in again.');
        }
    }

    return response;
}

/**
 * Convenience GET request.
 */
export async function apiGet(endpoint) {
    return apiRequest(endpoint, { method: 'GET' });
}

/**
 * Convenience POST request with JSON body.
 */
export async function apiPost(endpoint, body) {
    return apiRequest(endpoint, {
        method: 'POST',
        body: JSON.stringify(body)
    });
}

/**
 * Convenience PATCH request with JSON body.
 */
export async function apiPatch(endpoint, body) {
    return apiRequest(endpoint, {
        method: 'PATCH',
        body: JSON.stringify(body)
    });
}

/**
 * Convenience DELETE request.
 */
export async function apiDelete(endpoint) {
    return apiRequest(endpoint, { method: 'DELETE' });
}

/**
 * Convenience PUT request with JSON body.
 */
export async function apiPut(endpoint, body) {
    return apiRequest(endpoint, {
        method: 'PUT',
        body: JSON.stringify(body)
    });
}

/**
 * Convenience POST request with FormData (multipart/form-data).
 * Used for file uploads. Do NOT stringify — pass a FormData object.
 */
export async function apiPostForm(endpoint, formData) {
    return apiRequest(endpoint, {
        method: 'POST',
        body: formData
    });
}

/**
 * Convenience PATCH request with FormData (multipart/form-data).
 * Used for file uploads. Do NOT stringify — pass a FormData object.
 */
export async function apiPatchForm(endpoint, formData) {
    return apiRequest(endpoint, {
        method: 'PATCH',
        body: formData
    });
}
