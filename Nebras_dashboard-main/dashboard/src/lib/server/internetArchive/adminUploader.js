/**
 * adminUploader.js — رفع buffer إلى Firebase Storage + كتابة مرآة في
 * `dashboard_uploads` و `content_unified_files` بنفس **شكل البيانات**
 * الذي يكتبه storageUpload.js، لكن مع علامات داخليّة تُميِّز المصدر بأنّه
 * Internet Archive — دون أن يراها التطبيق.
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  📵 لا واجهة "Internet Archive" في التطبيق — العلامات الداخليّة   ║
 * ║  تُستعمل **فقط** لـ factoryReset / blacklist / مراجعة الأمن من    ║
 * ║  لوحة التحكّم. التطبيق يقرأ الحقول العامّة (id, title, sourceUrl, ║
 * ║  thumbnail, subsection, …) ولا يرى __provider ولا __iaIdentifier. ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 *   • Storage path: dashboard/content/{fileId}/{ts}_{safe} (نفس الرفع اليدوي)
 *   • Download URL مع firebaseStorageDownloadTokens (UUID)
 *   • Multi-write على content_unified_files + dashboard_uploads
 *   • fileId بصيغة fb_<epoch>_… (نفس الرفع اليدوي — ترتيب التطبيق)
 *   • __provider = "internet_archive" (لوحة التحكم فقط)
 *   • __iaIdentifier, __iaSourceUrl, __iaLicense, __iaCollection
 */

import { randomUUID } from 'node:crypto';
import { getStorage } from 'firebase-admin/storage';
import { FieldValue } from 'firebase-admin/firestore';
import { getNebrasAdminApp } from '$lib/server/firebaseAdmin.js';
import { adminFsWriteFileMirrorBoth } from '$lib/server/nebrasUnifiedFirestoreAdmin.js';
import { stripUndefinedDeep } from '$lib/nebrasUnifiedSanitize.js';
import {
	buildMobileCompatibleFields,
	generateNebrasFileId
} from '$lib/nebrasMobileUploadSchema.js';

const NEBRAS_PROJECT_ID = 'nebras-9118c';

function assertNebrasApp(app) {
	const projectId = app?.options?.projectId || '';
	if (projectId !== NEBRAS_PROJECT_ID) {
		throw Object.assign(
			new Error(
				`عُزل صارم انتُهك: محرّك Internet Archive يجب أن يستخدم Nebras (${NEBRAS_PROJECT_ID}) ` +
					`فقط، لكنّه تلقّى تطبيقاً لمشروع "${projectId}".`
			),
			{ reason: 'target_isolation_violated', status: 500 }
		);
	}
}

function sanitizeSegment(name) {
	return (
		String(name || 'file')
			.trim()
			.replace(/[\u0000-\u001F\u007F]/g, '')
			.replace(/[#$\[\]./\\:*?"<>|]+/g, '_')
			.slice(0, 180) || 'file'
	);
}

function buildDownloadUrl(bucketName, objectPath, token) {
	const encoded = encodeURIComponent(objectPath);
	return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encoded}?alt=media&token=${token}`;
}

/**
 * يحوّل النوع الذي اخترناه (document/audio/video) إلى content_type المستخدَم
 * في schema نبراس (نفس القيم التي تكتبها لوحة التحكّم يدوياً).
 */
function toNebrasContentType(nebrasType) {
	if (nebrasType === 'audio') return 'audio';
	if (nebrasType === 'video') return 'video';
	return 'document'; // book / PDF
}

/**
 * ينزّل thumbnail الخاص بالعنصر من خدمة الصور في IA ويرفعه إلى Nebras
 * Storage. يُفضّل دائماً تجنّب أيّ رابط خارجي يصل للتطبيق.
 */
async function uploadExternalThumbnail(thumbnailUrl, fileId, ctx) {
	if (!thumbnailUrl) return null;
	let res;
	try {
		res = await fetch(thumbnailUrl, {
			headers: { 'User-Agent': 'NebrasDashboard/1.0' },
			redirect: 'follow'
		});
	} catch {
		return null;
	}
	if (!res.ok) return null;
	const ct = res.headers.get('content-type') || 'image/jpeg';
	if (!ct.startsWith('image/')) return null;
	const buf = Buffer.from(await res.arrayBuffer());
	if (buf.byteLength === 0 || buf.byteLength > 10 * 1024 * 1024) return null;

	const ext = ct.includes('png') ? 'png' : ct.includes('webp') ? 'webp' : 'jpg';
	const objectPath = `dashboard/content/${fileId}/thumbnail_${Date.now()}.${ext}`;
	const token = randomUUID();

	const bucket = getStorage(ctx.adminApp).bucket(ctx.bucketName);
	await bucket.file(objectPath).save(buf, {
		contentType: ct,
		resumable: false,
		metadata: {
			contentType: ct,
			metadata: {
				firebaseStorageDownloadTokens: token,
				uploadedByUid: ctx.uploaderUid || '',
				uploadedAt: new Date().toISOString(),
				source: 'nebras_dashboard'
			}
		}
	});
	return buildDownloadUrl(ctx.bucketName, objectPath, token);
}

/**
 * يرفع buffer إلى Storage ثمّ يكتب سجلَّيْن متطابقَيْن في Firestore عبر
 * adminFsWriteFileMirrorBoth (الوحدة الموحَّدة في نبراس).
 *
 * @param {Object} args
 * @param {Buffer} args.buffer
 * @param {string} args.contentType
 * @param {string} args.filename
 * @param {'document'|'audio'|'video'} args.nebrasContentType
 * @param {string|null} [args.thumbnailUrl]
 * @param {Object} args.metadata
 *   @param {string} args.metadata.title
 *   @param {string} [args.metadata.description]
 *   @param {string} [args.metadata.author]
 *   @param {string|number} args.metadata.subsection
 *   @param {string|number} args.metadata.main_section
 *   @param {string|number} [args.metadata.secondary_subsection]
 *   @param {string} [args.metadata.subsection_name]
 *   @param {string} [args.metadata.main_section_name]
 *   @param {string} [args.metadata.secondary_subsection_name]
 *   @param {boolean} [args.metadata.is_listed]
 * @param {Object} args.uploader  { uid, email }
 * @param {Object} [args.iaInfo]
 *   @param {string} args.iaInfo.identifier
 *   @param {string} args.iaInfo.iaSourceUrl
 *   @param {string} [args.iaInfo.license]
 *   @param {string} [args.iaInfo.collection]
 *
 * @returns {Promise<{
 *   fileId: string,
 *   downloadUrl: string,
 *   storagePath: string,
 *   contentType: string,
 *   size: number,
 *   thumbnailUrl: string|null,
 *   payload: any
 * }>}
 */
export async function adminUploadAndRegister(args) {
	const {
		buffer,
		contentType,
		filename,
		nebrasContentType,
		thumbnailUrl,
		metadata,
		uploader,
		iaInfo
	} = args;

	if (!Buffer.isBuffer(buffer) || buffer.byteLength === 0) {
		throw Object.assign(new Error('buffer فارغ.'), { reason: 'empty_buffer', status: 400 });
	}
	if (!metadata?.title) {
		throw Object.assign(new Error('metadata.title مطلوب.'), {
			reason: 'metadata_title_required',
			status: 400
		});
	}
	if (!metadata?.subsection) {
		throw Object.assign(new Error('metadata.subsection مطلوب (الهيكلية الذهبيّة).'), {
			reason: 'metadata_subsection_required',
			status: 400
		});
	}

	const adminApp = getNebrasAdminApp();
	assertNebrasApp(adminApp);
	const bucketName = adminApp.options?.storageBucket;
	if (!bucketName) {
		throw Object.assign(
			new Error('NEBRAS_STORAGE_BUCKET غير مضبوط — لا يمكن رفع الملفّات.'),
			{ reason: 'storage_bucket_missing', status: 501 }
		);
	}

	const fileId = generateNebrasFileId();
	const safeName = sanitizeSegment(filename || 'item.bin');
	const objectPath = `dashboard/content/${fileId}/${Date.now()}_${safeName}`;
	const token = randomUUID();

	const ctx = { adminApp, bucketName, uploaderUid: uploader?.uid || '' };

	let resolvedThumbnail = null;
	if (thumbnailUrl) {
		resolvedThumbnail = await uploadExternalThumbnail(thumbnailUrl, fileId, ctx);
	}

	const finalContentType = contentType || 'application/octet-stream';
	const bucket = getStorage(adminApp).bucket(bucketName);
	await bucket.file(objectPath).save(buffer, {
		contentType: finalContentType,
		resumable: false,
		metadata: {
			contentType: finalContentType,
			metadata: {
				firebaseStorageDownloadTokens: token,
				uploadedByUid: uploader?.uid || '',
				uploadedByEmail: uploader?.email || '',
				uploadedAt: new Date().toISOString(),
				source: 'nebras_dashboard',
				sourceUrl: iaInfo?.iaSourceUrl || '',
				sourceIdentifier: iaInfo?.identifier || ''
			}
		}
	});

	const downloadUrl = buildDownloadUrl(bucketName, objectPath, token);

	const createdAtIso = new Date().toISOString();
	const finalMetadata = {
		...metadata,
		id: fileId,
		thumbnail: resolvedThumbnail || metadata.thumbnail || null,
		content_type: toNebrasContentType(nebrasContentType),
		is_listed: metadata.is_listed ?? true,
		created_at: createdAtIso
	};

	const compatible = buildMobileCompatibleFields(finalMetadata, downloadUrl);

	const payload = stripUndefinedDeep({
		fileId,
		id: fileId,
		downloadUrl,
		filename,
		fileType: finalContentType,
		fileSize: buffer.byteLength,
		metadata: finalMetadata,
		storagePath: objectPath,
		createdAt: FieldValue.serverTimestamp(),

		// علامات داخليّة — لا يقرأها التطبيق (ولا تكسر schema).
		__provider: 'internet_archive',
		__iaIdentifier: String(iaInfo?.identifier || ''),
		__iaSourceUrl: String(iaInfo?.iaSourceUrl || ''),
		__iaLicense: String(iaInfo?.license || ''),
		__iaCollection: String(iaInfo?.collection || ''),
		__iaImportedAt: new Date().toISOString(),
		__iaOriginalFilename: String(filename || ''),

		created_at: createdAtIso,
		...compatible
	});

	await adminFsWriteFileMirrorBoth(fileId, payload);

	return {
		fileId,
		downloadUrl,
		storagePath: objectPath,
		contentType: finalContentType,
		size: buffer.byteLength,
		thumbnailUrl: resolvedThumbnail,
		payload
	};
}
