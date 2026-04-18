/**
 * File Upload Orchestrator (Firebase-only)
 *
 * Handles upload lifecycle through Firebase Storage + Realtime Database only.
 */
import {
	firebaseUploadContentFile,
	uploadContentThumbnail
} from '$lib/firebase/storageUpload.js';

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
	/** @type {import('firebase/storage').UploadTask | null} */
	let firebaseUploadTask = null;

	function setStatus(s) {
		onStatus?.(s);
	}
	function setProgress(p) {
		onProgress?.(Math.round(p));
	}

	async function start() {
		try {
			setStatus('initiating');
			setProgress(0);

			const fileId = `fb_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
			if (aborted) throw new Error('Upload aborted');

			// Upload the thumbnail FIRST (if any) so its download URL can be mirrored
			// into the metadata + root-level fields the mobile app reads.
			let thumbnailUrl = null;
			if (thumbnail) {
				try {
					thumbnailUrl = await uploadContentThumbnail(fileId, thumbnail);
				} catch (thumbErr) {
					console.warn('[fileUpload] Thumbnail upload failed, continuing without it:', thumbErr);
				}
			}
			const finalMetadata = thumbnailUrl
				? { ...metadata, thumbnail: thumbnailUrl }
				: metadata;

			setStatus('uploading');
			await firebaseUploadContentFile(file, fileId, finalMetadata, {
				onProgress: (pct) => setProgress(pct),
				isAborted: () => aborted,
				onTaskCreated: (task) => {
					firebaseUploadTask = task;
				}
			});

			if (aborted) throw new Error('Upload aborted');
			setProgress(100);
			setStatus('completed');
			return { id: fileId, provider: 'firebase' };
		} catch (err) {
			if (!aborted) {
				setStatus('failed');
				onError?.(err.message || 'Upload failed');
			}
			throw err;
		} finally {
			firebaseUploadTask = null;
		}
	}

	function abort() {
		aborted = true;
		try {
			firebaseUploadTask?.cancel();
		} catch {
			/* ignore */
		}
		firebaseUploadTask = null;
	}

	return { start, abort };
}

/**
 * Resume an interrupted upload for a pending file.
 *
 * @param {Object} fileRecord  - سجل ملف سابق (اختياري) لاستخراج id/metadata
 * @param {File}   file        - The same file re-selected by the user
 * @param {Object} callbacks   - { onProgress, onStatus, onError }
 * @returns {{ start: () => Promise<Object>, abort: () => void }}
 */
export function createResumeUploader(fileRecord, file, { onProgress, onStatus, onError } = {}) {
	let aborted = false;
	/** @type {import('firebase/storage').UploadTask | null} */
	let firebaseUploadTask = null;

	function setStatus(s) {
		onStatus?.(s);
	}
	function setProgress(p) {
		onProgress?.(Math.round(p));
	}

	async function start() {
		try {
			setStatus('uploading');
			const fileId = fileRecord?.id || `fb_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
			await firebaseUploadContentFile(file, fileId, fileRecord?.metadata || {}, {
				onProgress: (pct) => setProgress(pct),
				isAborted: () => aborted,
				onTaskCreated: (task) => {
					firebaseUploadTask = task;
				}
			});
			if (aborted) throw new Error('Upload aborted');
			setProgress(100);
			setStatus('completed');
			return { id: fileId, provider: 'firebase' };
		} catch (err) {
			if (!aborted) {
				setStatus('failed');
				onError?.(err.message || 'Resume failed');
			}
			throw err;
		} finally {
			firebaseUploadTask = null;
		}
	}

	function abort() {
		aborted = true;
		try {
			firebaseUploadTask?.cancel();
		} catch {
			/* ignore */
		}
		firebaseUploadTask = null;
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
