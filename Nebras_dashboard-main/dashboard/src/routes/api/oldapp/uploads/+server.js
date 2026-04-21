/**
 * /api/oldapp/uploads — رفع ملفّات إلى Cloud Storage لمشروع OldApp.
 *
 * Request:
 *   POST  multipart/form-data
 *     file:      File (إلزامي)
 *     folder?:   string  (افتراضي: "oldapp/uploads")
 *     filename?: string  (اسم مقترح؛ يُصحَّح تلقائيّاً)
 *
 * Response (201):
 *   { ok, url, path, bucket, contentType, size, filename, downloadToken }
 *
 * الحماية:
 *   - `hooks.server.js` يتأكّد من Bearer + dashboard_users + !isBlocked.
 *   - المعالج يتأكّد من role ∈ {owner, supervisor}.
 *   - إن لم يُضبط OLDAPP_SERVICE_ACCOUNT أو OLDAPP_STORAGE_BUCKET → 501.
 */

import { handleAdminUpload } from '$lib/server/uploadBridge.js';
import {
	getOldAppAdminApp,
	isOldAppAdminConfigured
} from '$lib/server/firebaseAdmin.js';

export const config = {
	bodySizeLimit: 50 * 1024 * 1024
};

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function POST(event) {
	return handleAdminUpload(event, {
		getAdminApp: getOldAppAdminApp,
		isConfigured: isOldAppAdminConfigured,
		missingEnvHint:
			'أضف OLDAPP_SERVICE_ACCOUNT_JSON/PATH و OLDAPP_STORAGE_BUCKET في ملف .env.',
		defaultFolder: 'oldapp/uploads'
	});
}
