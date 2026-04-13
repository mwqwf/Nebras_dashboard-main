/**
 * Moderator API
 *
 * Sections CRUD + YouTube Video CRUD.
 * Uses multipart/form-data for create/update (thumbnail/file uploads).
 * The backend enforces created_by = current user automatically.
 */

import { apiGet, apiPost, apiPostForm, apiPatchForm, apiDelete } from '$lib/api/client.js';

// ─── Helpers ────────────────────────────────────────────

/**
 * Build a FormData object from a plain/nested object.
 * Supports nested objects via dot notation: { metadata: { title: 'x' } } → 'metadata.title' = 'x'
 * Skips undefined/null values. Handles File objects natively.
 */
function buildFormData(data, fd = new FormData(), prefix = '') {
    for (const [key, value] of Object.entries(data)) {
        if (value === undefined || value === null) continue;

        const fieldKey = prefix ? `${prefix}.${key}` : key;

        if (value instanceof File) {
            fd.append(fieldKey, value);
        } else if (typeof value === 'object' && !(value instanceof Date) && !Array.isArray(value)) {
            // Recurse for nested objects
            buildFormData(value, fd, fieldKey);
        } else if (value !== '') {
            fd.append(fieldKey, String(value));
        }
    }
    return fd;
}

// ─── YouTube Videos ─────────────────────────────────────

/**
 * List the moderator's own YouTube videos with optional filters.
 * Filter keys match Django view: metadata__subsection, metadata__subsection__main_section,
 * metadata__secondary_subsection, search.
 * @param {Object} params
 */
export async function listMyYoutubeVideos({
    search = '', subsection, main_section, secondary_subsection, page = 1
} = {}) {
    const qp = new URLSearchParams();
    if (search) qp.set('search', search);
    if (subsection) qp.set('metadata__subsection', String(subsection));
    if (main_section) qp.set('metadata__subsection__main_section', String(main_section));
    if (secondary_subsection) qp.set('metadata__secondary_subsection', String(secondary_subsection));
    if (page > 1) qp.set('page', String(page));

    const query = qp.toString();
    const res = await apiGet(`/api/content/youtube/${query ? `?${query}` : ''}`);
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to fetch YouTube videos');
    }
    return res.json();
}

/**
 * Create a YouTube video (multipart/form-data).
 * @param {Object} data - { video_url, thumbnail? (File), metadata: { title, description?, subsection, secondary_subsection?, content_type:'youtube' } }
 */
export async function createYoutubeVideo(data) {
    const fd = buildFormData(data);
    const res = await apiPostForm('/api/content/youtube/', fd);
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(JSON.stringify(err));
    }
    return res.json();
}

/**
 * Update a YouTube video (PATCH, multipart/form-data).
 * @param {number} id
 * @param {Object} data
 */
export async function updateYoutubeVideo(id, data) {
    const fd = buildFormData(data);
    const res = await apiPatchForm(`/api/content/youtube/${id}/`, fd);
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(JSON.stringify(err));
    }
    return res.json();
}

/**
 * Delete a YouTube video.
 * @param {number} id
 */
export async function removeYoutubeVideo(id) {
    const res = await apiDelete(`/api/content/youtube/${id}/`);
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to delete YouTube video');
    }
    return true;
}


// ─── Main Sections ──────────────────────────────────────

/**
 * List the moderator's own main sections.
 * @param {Object} params - { search?, page? }
 */
export async function listMyMainSections({ search = '', page = 1 } = {}) {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (page > 1) params.set('page', String(page));

    const query = params.toString();
    const endpoint = `/api/sections/main/${query ? `?${query}` : ''}`;

    const res = await apiGet(endpoint);
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to fetch main sections');
    }
    return res.json();
}

/**
 * Create a main section (multipart/form-data).
 * @param {Object} data - { name, order_index?, thumbnail? (File) }
 */
export async function createMainSection(data) {
    const fd = buildFormData(data);
    const res = await apiPostForm('/api/sections/main/', fd);
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(JSON.stringify(err));
    }
    return res.json();
}

/**
 * Update a main section (PATCH, multipart/form-data).
 * @param {number} id
 * @param {Object} data - { name?, order_index?, thumbnail? (File) }
 */
export async function updateMainSection(id, data) {
    const fd = buildFormData(data);
    const res = await apiPatchForm(`/api/sections/main/${id}/`, fd);
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(JSON.stringify(err));
    }
    return res.json();
}

/**
 * Delete a main section.
 * @param {number} id
 */
export async function removeMainSection(id) {
    const res = await apiDelete(`/api/sections/main/${id}/`);
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to delete main section');
    }
    return true;
}

// ─── Sub Sections ───────────────────────────────────────

/**
 * List the moderator's own sub sections, optionally filtered by main_section.
 * @param {Object} params - { main_section?, search?, page? }
 */
export async function listMySubSections({ main_section, search = '', page = 1 } = {}) {
    const params = new URLSearchParams();
    if (main_section !== undefined && main_section !== '') params.set('main_section', String(main_section));
    if (search) params.set('search', search);
    if (page > 1) params.set('page', String(page));

    const query = params.toString();
    const endpoint = `/api/sections/sub/${query ? `?${query}` : ''}`;

    const res = await apiGet(endpoint);
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to fetch sub sections');
    }
    return res.json();
}

/**
 * Create a sub section (multipart/form-data).
 * @param {Object} data - { name, main_section, thumbnail? (File) }
 */
export async function createSubSection(data) {
    const fd = buildFormData(data);
    const res = await apiPostForm('/api/sections/sub/', fd);
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(JSON.stringify(err));
    }
    return res.json();
}

/**
 * Update a sub section (PATCH, multipart/form-data).
 * @param {number} id
 * @param {Object} data - { name?, thumbnail? (File) }
 */
export async function updateSubSection(id, data) {
    const fd = buildFormData(data);
    const res = await apiPatchForm(`/api/sections/sub/${id}/`, fd);
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(JSON.stringify(err));
    }
    return res.json();
}

/**
 * Delete a sub section.
 * @param {number} id
 */
export async function removeSubSection(id) {
    const res = await apiDelete(`/api/sections/sub/${id}/`);
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to delete sub section');
    }
    return true;
}

// ─── Secondary Sub Sections ────────────────────────────

/**
 * List the moderator's own secondary sub sections, optionally filtered by sub_section.
 * @param {Object} params - { sub_section?, search?, page? }
 */
export async function listMySecondarySections({ sub_section, search = '', page = 1 } = {}) {
    const params = new URLSearchParams();
    if (sub_section !== undefined && sub_section !== '') params.set('sub_section', String(sub_section));
    if (search) params.set('search', search);
    if (page > 1) params.set('page', String(page));

    const query = params.toString();
    const endpoint = `/api/sections/secondary/${query ? `?${query}` : ''}`;

    const res = await apiGet(endpoint);
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to fetch secondary sections');
    }
    return res.json();
}

/**
 * Create a secondary sub section (multipart/form-data).
 * @param {Object} data - { name, sub_section, thumbnail? (File) }
 */
export async function createSecondarySection(data) {
    const fd = buildFormData(data);
    const res = await apiPostForm('/api/sections/secondary/', fd);
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(JSON.stringify(err));
    }
    return res.json();
}

/**
 * Update a secondary sub section (PATCH, multipart/form-data).
 * @param {number} id
 * @param {Object} data - { name?, thumbnail? (File) }
 */
export async function updateSecondarySection(id, data) {
    const fd = buildFormData(data);
    const res = await apiPatchForm(`/api/sections/secondary/${id}/`, fd);
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(JSON.stringify(err));
    }
    return res.json();
}

/**
 * Delete a secondary sub section.
 * @param {number} id
 */
export async function removeSecondarySection(id) {
    const res = await apiDelete(`/api/sections/secondary/${id}/`);
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Failed to delete secondary section');
    }
    return true;
}

// ─── R2 File Content ────────────────────────────────────

/**
 * List moderator's own R2 files with optional filters.
 */
export async function listMyFiles({
    search = '', subsection, main_section, secondary_subsection,
    content_type, upload_type, page = 1
} = {}) {
    const qp = new URLSearchParams();
    if (search) qp.set('search', search);
    if (subsection) qp.set('metadata__subsection', String(subsection));
    if (main_section) qp.set('metadata__subsection__main_section', String(main_section));
    if (secondary_subsection) qp.set('metadata__secondary_subsection', String(secondary_subsection));
    if (content_type) qp.set('metadata__content_type', content_type);
    if (upload_type) qp.set('upload_type', upload_type);
    if (page > 1) qp.set('page', String(page));
    const query = qp.toString();
    const res = await apiGet(`/api/content/files/${query ? `?${query}` : ''}`);
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || 'Failed to fetch files'); }
    return res.json();
}

/**
 * Initiate a file upload. Metadata is sent as a JSON string field.
 * @param {Object} opts - { file_size, file_type, filename, metadata: {...}, thumbnail? (File) }
 */
export async function initiateFileUpload({ file_size, file_type, filename, metadata, thumbnail }) {
    // Backend expects dot-notation fields: metadata.title, metadata.subsection, etc.
    const fd = buildFormData({
        filename,
        file_size,
        file_type,
        metadata,          // buildFormData recurses into nested objects → metadata.title, metadata.subsection …
        ...(thumbnail instanceof File ? { thumbnail } : {})
    });
    const res = await apiPostForm('/api/content/files/', fd);
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(JSON.stringify(err)); }
    return res.json();
}

/** Get presigned upload URL for a file (or next part). */
export async function getFileUploadUrl(fileId) {
    const res = await apiPost(`/api/content/files/${fileId}/upload-url/`, {});
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || 'Failed to get upload URL'); }
    return res.json();
}

/** Register a completed part (multipart only). */
export async function registerPart({ multipart_upload, part_number, etag }) {
    const res = await apiPost('/api/content/parts/', { multipart_upload, part_number, etag });
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || 'Failed to register part'); }
    return res.json();
}

/** Complete a file upload (both single and multipart). */
export async function completeFileUpload(fileId) {
    const res = await apiPost(`/api/content/files/${fileId}/complete/`, {});
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || 'Failed to complete upload'); }
    return res.json();
}

/** Update file metadata (PATCH). */
export async function updateFile(fileId, data) {
    const fd = buildFormData(data);
    const res = await apiPatchForm(`/api/content/files/${fileId}/`, fd);
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(JSON.stringify(err)); }
    return res.json();
}

/** Delete a file. */
export async function removeFile(fileId) {
    const res = await apiDelete(`/api/content/files/${fileId}/`);
    if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || 'Failed to delete file'); }
    return true;
}

// ─── Dashboard Statistics ──────────────────────────────

/**
 * Get aggregate total counts of content items, YouTube videos, and sections created by the moderator.
 * @returns {Promise<Object>}
 */
export async function getModeratorTotals() {
    const res = await apiGet('/api/dashboard-statistics/moderator/totals/');
    if (!res.ok) throw new Error('Failed to fetch moderator totals');
    return res.json();
}

/**
 * Get content distribution uploaded by the moderator.
 * @returns {Promise<Object>}
 */
export async function getModeratorContentDistribution() {
    const res = await apiGet('/api/dashboard-statistics/moderator/content-distribution/');
    if (!res.ok) throw new Error('Failed to fetch moderator content distribution');
    return res.json();
}

/**
 * Get daily upload counts by content type for the last 30 days specific to the moderator.
 * @returns {Promise<{data: Array}>}
 */
export async function getModeratorContentAddedChart() {
    const res = await apiGet('/api/dashboard-statistics/moderator/content-added-chart/');
    if (!res.ok) throw new Error('Failed to fetch moderator content added chart');
    return res.json();
}
