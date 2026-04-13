/**
 * File Upload Orchestrator
 *
 * Handles the full upload lifecycle:
 *   Single:    initiate → getURL → PUT file → complete
 *   Multipart: initiate → (getURL → PUT chunk → registerPart) × N → complete
 *
 * Usage:
 *   const uploader = createFileUploader(file, metadata, thumbnail, { onProgress, onStatus });
 *   await uploader.start();
 *   // uploader.abort() to cancel
 */

import {
    initiateFileUpload, getFileUploadUrl, registerPart, completeFileUpload
} from '$lib/api/moderator.js';

const CHUNK_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * @param {File} file - The file to upload
 * @param {Object} metadata - { title, content_type, description?, subsection, secondary_subsection? }
 * @param {File|null} thumbnail - Optional thumbnail image
 * @param {Object} callbacks
 *   @param {Function} callbacks.onProgress - (percent: number) => void   (0–100)
 *   @param {Function} callbacks.onStatus   - (status: string) => void    ('initiating'|'uploading'|'completing'|'completed'|'failed')
 *   @param {Function} callbacks.onError    - (error: string) => void
 * @returns {{ start: () => Promise<Object>, abort: () => void }}
 */
export function createFileUploader(file, metadata, thumbnail, { onProgress, onStatus, onError } = {}) {
    let aborted = false;
    let currentXHR = null;

    function setStatus(s) { onStatus?.(s); }
    function setProgress(p) { onProgress?.(Math.round(p)); }

    async function start() {
        try {
            // Step 1: Initiate
            setStatus('initiating');
            setProgress(0);

            const initData = await initiateFileUpload({
                file_size: file.size,
                file_type: file.type,
                filename: file.name,
                metadata,
                thumbnail
            });

            if (aborted) throw new Error('Upload aborted');

            const fileId = initData.id;
            const isMultipart = !!initData.multipart_uploader;

            // Step 2+3: Upload
            setStatus('uploading');

            if (isMultipart) {
                await uploadMultipart(fileId, initData.multipart_uploader);
            } else {
                await uploadSingle(fileId);
            }

            if (aborted) throw new Error('Upload aborted');

            // Step 5: Complete
            setStatus('completing');
            const result = await completeFileUpload(fileId);
            setProgress(100);
            setStatus('completed');
            return result;

        } catch (err) {
            if (!aborted) {
                setStatus('failed');
                onError?.(err.message || 'Upload failed');
            }
            throw err;
        }
    }

    async function uploadSingle(fileId) {
        // Get presigned URL
        const { presigned_url } = await getFileUploadUrl(fileId);
        if (aborted) return;

        // PUT file to presigned URL with progress
        await putWithProgress(presigned_url, file, file.type, (pct) => {
            setProgress(pct);
        });
    }

    async function uploadMultipart(fileId, multipartInfo) {
        const totalParts = multipartInfo.total_parts;
        const multipartId = multipartInfo.id;
        let uploadedParts = multipartInfo.uploaded_parts || 0;

        while (uploadedParts < totalParts) {
            if (aborted) return;

            // Get presigned URL for next part
            const urlData = await getFileUploadUrl(fileId);
            const { presigned_url, next_part_number } = urlData;
            const partNumber = next_part_number;

            // Slice chunk
            const start = (partNumber - 1) * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);
            const chunk = file.slice(start, end);

            if (aborted) return;

            // Upload chunk
            const etag = await putWithProgress(presigned_url, chunk, file.type, (chunkPct) => {
                const overallPct = ((uploadedParts + chunkPct / 100) / totalParts) * 100;
                setProgress(overallPct);
            });

            if (aborted) return;

            // Register part
            await registerPart({
                multipart_upload: multipartId,
                part_number: partNumber,
                etag
            });

            uploadedParts++;
            setProgress((uploadedParts / totalParts) * 100);
        }
    }

    /**
     * PUT binary data to a presigned URL using XMLHttpRequest for progress tracking.
     * Returns the ETag header from the response.
     */
    function putWithProgress(url, body, contentType, onChunkProgress) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            currentXHR = xhr;

            xhr.open('PUT', url, true);

            // The presigned URL signature includes specific headers.
            // We MUST send all of them or the signature won't match (403).
            // Parse X-Amz-SignedHeaders from the URL to know which ones.
            try {
                const urlObj = new URL(url);
                const signedHeaders = (urlObj.searchParams.get('X-Amz-SignedHeaders') || '').split(';');

                for (const h of signedHeaders) {
                    const header = h.trim();
                    if (!header || header === 'host' || header === 'content-length') continue;
                    if (header === 'content-type') {
                        xhr.setRequestHeader('Content-Type', contentType);
                    } else if (header.startsWith('x-amz-meta-')) {
                        // Custom metadata headers — signed with empty values
                        xhr.setRequestHeader(header, '');
                    }
                }
            } catch {
                // Fallback: at minimum set Content-Type
                xhr.setRequestHeader('Content-Type', contentType);
            }

            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) {
                    onChunkProgress((e.loaded / e.total) * 100);
                }
            };

            xhr.onload = () => {
                currentXHR = null;
                if (xhr.status >= 200 && xhr.status < 300) {
                    const etag = xhr.getResponseHeader('ETag') || '';
                    resolve(etag);
                } else {
                    reject(new Error(`Upload failed with status ${xhr.status}`));
                }
            };

            xhr.onerror = () => {
                currentXHR = null;
                reject(new Error('Network error during upload'));
            };

            xhr.onabort = () => {
                currentXHR = null;
                reject(new Error('Upload aborted'));
            };

            xhr.send(body);
        });
    }

    function abort() {
        aborted = true;
        if (currentXHR) {
            currentXHR.abort();
            currentXHR = null;
        }
    }

    return { start, abort };
}

/**
 * Resume an interrupted upload for a pending file.
 *
 * @param {Object} fileRecord  - The existing R2File record from the API (must have id, upload_type, multipart_uploader, file_type)
 * @param {File}   file        - The same file re-selected by the user
 * @param {Object} callbacks   - { onProgress, onStatus, onError }
 * @returns {{ start: () => Promise<Object>, abort: () => void }}
 */
export function createResumeUploader(fileRecord, file, { onProgress, onStatus, onError } = {}) {
    let aborted = false;
    let currentXHR = null;

    function setStatus(s) { onStatus?.(s); }
    function setProgress(p) { onProgress?.(Math.round(p)); }

    async function start() {
        try {
            const fileId = fileRecord.id;
            const isMultipart = !!fileRecord.multipart_uploader;

            setStatus('uploading');

            if (isMultipart) {
                const info = fileRecord.multipart_uploader;
                const totalParts = info.total_parts;
                const multipartId = info.id;
                let uploadedParts = info.uploaded_parts || 0;

                // Start progress from where we left off
                setProgress((uploadedParts / totalParts) * 100);

                while (uploadedParts < totalParts) {
                    if (aborted) throw new Error('Upload aborted');

                    const urlData = await getFileUploadUrl(fileId);
                    const { presigned_url, next_part_number } = urlData;
                    const partNumber = next_part_number;

                    const chunkStart = (partNumber - 1) * CHUNK_SIZE;
                    const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, file.size);
                    const chunk = file.slice(chunkStart, chunkEnd);

                    if (aborted) throw new Error('Upload aborted');

                    const etag = await putWithProgress(presigned_url, chunk, file.type, (chunkPct) => {
                        const overallPct = ((uploadedParts + chunkPct / 100) / totalParts) * 100;
                        setProgress(overallPct);
                    });

                    if (aborted) throw new Error('Upload aborted');

                    await registerPart({
                        multipart_upload: multipartId,
                        part_number: partNumber,
                        etag
                    });

                    uploadedParts++;
                    setProgress((uploadedParts / totalParts) * 100);
                }
            } else {
                // Single upload — just re-upload the whole file
                const { presigned_url } = await getFileUploadUrl(fileId);
                if (aborted) throw new Error('Upload aborted');

                await putWithProgress(presigned_url, file, file.type, (pct) => {
                    setProgress(pct);
                });
            }

            if (aborted) throw new Error('Upload aborted');

            setStatus('completing');
            const result = await completeFileUpload(fileId);
            setProgress(100);
            setStatus('completed');
            return result;

        } catch (err) {
            if (!aborted) {
                setStatus('failed');
                onError?.(err.message || 'Resume failed');
            }
            throw err;
        }
    }

    function putWithProgress(url, body, contentType, onChunkProgress) {
        return new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            currentXHR = xhr;
            xhr.open('PUT', url, true);

            try {
                const urlObj = new URL(url);
                const signedHeaders = (urlObj.searchParams.get('X-Amz-SignedHeaders') || '').split(';');
                for (const h of signedHeaders) {
                    const header = h.trim();
                    if (!header || header === 'host' || header === 'content-length') continue;
                    if (header === 'content-type') {
                        xhr.setRequestHeader('Content-Type', contentType);
                    } else if (header.startsWith('x-amz-meta-')) {
                        xhr.setRequestHeader(header, '');
                    }
                }
            } catch {
                xhr.setRequestHeader('Content-Type', contentType);
            }

            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) onChunkProgress((e.loaded / e.total) * 100);
            };
            xhr.onload = () => {
                currentXHR = null;
                if (xhr.status >= 200 && xhr.status < 300) {
                    resolve(xhr.getResponseHeader('ETag') || '');
                } else {
                    reject(new Error(`Upload failed with status ${xhr.status}`));
                }
            };
            xhr.onerror = () => { currentXHR = null; reject(new Error('Network error during upload')); };
            xhr.onabort = () => { currentXHR = null; reject(new Error('Upload aborted')); };
            xhr.send(body);
        });
    }

    function abort() {
        aborted = true;
        if (currentXHR) { currentXHR.abort(); currentXHR = null; }
    }

    return { start, abort };
}

/**
 * Format file size to human-readable string.
 */
export function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let i = 0;
    let size = bytes;
    while (size >= 1024 && i < units.length - 1) { size /= 1024; i++; }
    return `${size.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/**
 * Map file MIME type to content_type enum value.
 */
export function mimeToContentType(mime) {
    if (!mime) return 'document';
    if (mime.startsWith('video/')) return 'video';
    if (mime.startsWith('audio/')) return 'audio';
    return 'document';
}
