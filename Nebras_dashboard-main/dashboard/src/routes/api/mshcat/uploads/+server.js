/**
 * /api/mshcat/uploads — رفع ملفّات إلى Cloud Storage لمشروع Mshcat.
 *
 * Request:
 *   POST  multipart/form-data
 *     file:      File (إلزامي)
 *     folder?:   string  (افتراضي: "mshcat/uploads")
 *     filename?: string  (اسم مقترح؛ يُصحَّح تلقائيّاً)
 *
 * Response (201):
 *   { ok, url, path, bucket, contentType, size, filename, downloadToken }
 *
 * الحماية:
 *   - `hooks.server.js` يتأكّد من Bearer + dashboard_users + !isBlocked.
 *   - المعالج يتأكّد من role ∈ {owner, supervisor}.
 *   - إن لم يُضبط MSHCAT_SERVICE_ACCOUNT أو MSHCAT_STORAGE_BUCKET → 501.
 */

import { handleAdminUpload } from '$lib/server/uploadBridge.js';
import {
	getMshcatAdminApp,
	isMshcatAdminConfigured
} from '$lib/server/firebaseAdmin.js';

// اسمح بأجسام أكبر من الحدّ الافتراضي (500KB) — الملفات قد تكون وثائق/صوت.
// القيمة قابلة للضبط حسب طبيعة المحتوى المرفوع؛ 50MB توافق معظم الحالات
// دون تكبير غير مبرّر لذاكرة الخادم.
export const config = {
	bodySizeLimit: 50 * 1024 * 1024
};

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function POST(event) {
	return handleAdminUpload(event, {
		getAdminApp: getMshcatAdminApp,
		isConfigured: isMshcatAdminConfigured,
		missingEnvHint:
			'أضف MSHCAT_SERVICE_ACCOUNT_JSON/PATH و MSHCAT_STORAGE_BUCKET في ملف .env.',
		defaultFolder: 'mshcat/uploads'
	});
}
