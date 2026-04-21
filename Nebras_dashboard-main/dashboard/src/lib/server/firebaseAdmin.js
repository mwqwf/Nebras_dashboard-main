/**
 * Firebase Admin SDK — خادم فقط (SvelteKit server).
 *
 * يدعم حاليّاً ثلاثة مشاريع Firebase منفصلة كلٌّ بـ Service Account مستقلّ:
 *
 *   • nebras   → المشروع الأساسيّ (الـ default app). يُستخدم لـ:
 *        - التحقّق من Firebase ID tokens (Auth).
 *        - قراءة/كتابة Realtime Database (dashboard_users، الإشعارات، … إلخ).
 *        - إرسال إشعارات FCM عبر Topic.
 *
 *   • mshcat   → مشروع `mshcat-fkdl`. يُستخدم لكتابة Firestore (categories / books)
 *                من جانب الخادم فقط (Smart Router).
 *
 *   • oldapp   → مشروع `mxqp-8d1e8` (التطبيق القديم). يُستخدم لكتابة Firestore
 *                (categories / subcategories / lessons / books) من جانب الخادم فقط.
 *
 * متغيّرات البيئة المعتمدة (server-side فقط — لا بادئة VITE_):
 *
 *   Nebras:
 *     NEBRAS_SERVICE_ACCOUNT_JSON   أو   NEBRAS_SERVICE_ACCOUNT_PATH
 *     (توافق رجعيّ) FIREBASE_SERVICE_ACCOUNT_JSON  /  FIREBASE_SERVICE_ACCOUNT_PATH
 *     (اختياري)     NEBRAS_SERVICE_ACCOUNT  ← يقبل JSON مدمجاً أو مساراً (Heuristic).
 *     (اختياري)     FIREBASE_DATABASE_URL   ← إن لم يُحدَّد نبنيه من project_id.
 *
 *   Mshcat:
 *     MSHCAT_SERVICE_ACCOUNT_JSON   أو   MSHCAT_SERVICE_ACCOUNT_PATH
 *     (اختياري)     MSHCAT_SERVICE_ACCOUNT  ← JSON مدمج أو مسار.
 *     (اختياري)     MSHCAT_STORAGE_BUCKET  ← للرفع المستقبلي (admin.storage()).
 *
 *   OldApp:
 *     OLDAPP_SERVICE_ACCOUNT_JSON   أو   OLDAPP_SERVICE_ACCOUNT_PATH
 *     (اختياري)     OLDAPP_SERVICE_ACCOUNT  ← JSON مدمج أو مسار.
 *     (اختياري)     OLDAPP_STORAGE_BUCKET
 *
 * يُحافَظ على كافّة التصديرات القديمة (getAdminApp / getAdminDatabase /
 * getAdminAuthService / verifyIdToken / isAdminConfigured / sendTopicMessage)
 * لتبقى جميع الـ endpoints الحاليّة تعمل بلا تعديل.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { getAuth as getAdminAuth } from 'firebase-admin/auth';
import { getDatabase as getAdminRtdb } from 'firebase-admin/database';
import { getFirestore as getAdminFirestore } from 'firebase-admin/firestore';
import { env } from '$env/dynamic/private';

// ── أسماء تطبيقات Admin ───────────────────────────────────────────
// Nebras = default app (للحفاظ على التوافق مع الكود القديم الذي يستدعي getApp()).
const APP_NAMES = /** @type {const} */ ({
	nebras: undefined,
	mshcat: 'MshcatAdmin',
	oldapp: 'OldAppAdmin'
});

/** @type {{ nebras: import('firebase-admin/app').App|null, mshcat: import('firebase-admin/app').App|null, oldapp: import('firebase-admin/app').App|null }} */
const cachedApps = { nebras: null, mshcat: null, oldapp: null };
/** @type {{ nebras: Error|null, mshcat: Error|null, oldapp: Error|null }} */
const initErrors = { nebras: null, mshcat: null, oldapp: null };

// ── أدوات مساعدة لقراءة البيئة + تحميل مفاتيح الخدمة ───────────────
function readEnv(name) {
	return String(env[name] || process.env[name] || '').trim();
}

/**
 * يعيد الـ service account كـ JSON بعد قراءته من (inline JSON) أو من ملف على القرص.
 * يقبل `inline` كسلسلة JSON مبدوءة بـ `{` أو كمسار ملفّ (Heuristic).
 *
 * @param {string} inline
 * @param {string} path
 * @returns {null | Record<string, any>}
 */
function parseServiceAccount(inline, path) {
	if (inline) {
		const trimmed = inline.trim();
		if (trimmed.startsWith('{')) {
			try {
				return JSON.parse(trimmed);
			} catch (err) {
				throw new Error(
					'service account inline JSON غير صالح: ' + (err?.message || err)
				);
			}
		}
		const abs = resolve(trimmed);
		const raw = readFileSync(abs, 'utf8');
		try {
			return JSON.parse(raw);
		} catch (err) {
			throw new Error(`الملف ${abs} ليس JSON صالحاً: ` + (err?.message || err));
		}
	}
	if (path) {
		const abs = resolve(path);
		const raw = readFileSync(abs, 'utf8');
		try {
			return JSON.parse(raw);
		} catch (err) {
			throw new Error(`الملف ${abs} ليس JSON صالحاً: ` + (err?.message || err));
		}
	}
	return null;
}

/**
 * يحمّل مفتاح الخدمة الخاصّ بالمشروع المطلوب مع سلسلة fallback للأسماء القديمة.
 * يعيد `null` إذا لم تُضبط أيّ بيئة — بدل رمي خطأ — لتمكّن نقاط الـ API من
 * إرجاع 501 (not configured) بدل 500.
 *
 * @param {'nebras'|'mshcat'|'oldapp'} alias
 */
function loadServiceAccountFor(alias) {
	if (alias === 'nebras') {
		const combined = readEnv('NEBRAS_SERVICE_ACCOUNT');
		const jsonInline = readEnv('NEBRAS_SERVICE_ACCOUNT_JSON') || readEnv('FIREBASE_SERVICE_ACCOUNT_JSON');
		const jsonPath = readEnv('NEBRAS_SERVICE_ACCOUNT_PATH') || readEnv('FIREBASE_SERVICE_ACCOUNT_PATH');
		if (!combined && !jsonInline && !jsonPath) return null;
		return parseServiceAccount(combined || jsonInline, jsonPath);
	}
	if (alias === 'mshcat') {
		const combined = readEnv('MSHCAT_SERVICE_ACCOUNT');
		const jsonInline = readEnv('MSHCAT_SERVICE_ACCOUNT_JSON');
		const jsonPath = readEnv('MSHCAT_SERVICE_ACCOUNT_PATH');
		if (!combined && !jsonInline && !jsonPath) return null;
		return parseServiceAccount(combined || jsonInline, jsonPath);
	}
	if (alias === 'oldapp') {
		const combined = readEnv('OLDAPP_SERVICE_ACCOUNT');
		const jsonInline = readEnv('OLDAPP_SERVICE_ACCOUNT_JSON');
		const jsonPath = readEnv('OLDAPP_SERVICE_ACCOUNT_PATH');
		if (!combined && !jsonInline && !jsonPath) return null;
		return parseServiceAccount(combined || jsonInline, jsonPath);
	}
	return null;
}

/**
 * يُهيّئ (أو يُعيد من الذاكرة) تطبيق Admin للمشروع المحدّد. نبحث أوّلاً عمّا
 * إذا كان التطبيق مهيّأً بالفعل (في حالات Hot Reload) ثمّ ننشئه.
 *
 * @param {'nebras'|'mshcat'|'oldapp'} alias
 * @returns {import('firebase-admin/app').App}
 */
function initAppFor(alias) {
	if (cachedApps[alias]) return cachedApps[alias];
	if (initErrors[alias]) throw initErrors[alias];

	try {
		const name = APP_NAMES[alias];

		// Nebras = default app (name === undefined). إن كان هناك تطبيق
		// افتراضيّ مُهيّأً مسبقاً، أعِده بدلاً من إنشاء ثانٍ.
		if (alias === 'nebras') {
			if (getApps().length > 0) {
				const def = getApps().find((a) => a.name === '[DEFAULT]');
				if (def) {
					cachedApps.nebras = def;
					return def;
				}
			}
		} else {
			// Mshcat/OldApp مسمّاة صراحةً؛ إن وُجد تطبيق بنفس الاسم فاستعِده.
			const existing = getApps().find((a) => a.name === name);
			if (existing) {
				cachedApps[alias] = existing;
				return existing;
			}
		}

		const sa = loadServiceAccountFor(alias);
		if (!sa) {
			const hint =
				alias === 'nebras'
					? 'NEBRAS_SERVICE_ACCOUNT_JSON / NEBRAS_SERVICE_ACCOUNT_PATH أو FIREBASE_SERVICE_ACCOUNT_JSON / FIREBASE_SERVICE_ACCOUNT_PATH'
					: alias === 'mshcat'
						? 'MSHCAT_SERVICE_ACCOUNT_JSON أو MSHCAT_SERVICE_ACCOUNT_PATH'
						: 'OLDAPP_SERVICE_ACCOUNT_JSON أو OLDAPP_SERVICE_ACCOUNT_PATH';
			throw new Error(
				`Service Account لمشروع ${alias} غير مُعرَّف — أضف ${hint} في ملف .env.`
			);
		}

		/** @type {import('firebase-admin/app').AppOptions} */
		const options = {
			credential: cert(sa),
			projectId: sa.project_id
		};

		if (alias === 'nebras') {
			options.databaseURL =
				env.FIREBASE_DATABASE_URL ||
				process.env.FIREBASE_DATABASE_URL ||
				`https://${sa.project_id}-default-rtdb.firebaseio.com`;
		}

		// استنتاج دلو التخزين من المتغيّر المخصّص، ثمّ من JSON، ثمّ افتراض
		// `<projectId>.appspot.com` (لتسهيل رفع الملفات عبر admin.storage()).
		const bucketEnv =
			alias === 'mshcat'
				? readEnv('MSHCAT_STORAGE_BUCKET')
				: alias === 'oldapp'
					? readEnv('OLDAPP_STORAGE_BUCKET')
					: readEnv('NEBRAS_STORAGE_BUCKET') || readEnv('FIREBASE_STORAGE_BUCKET');
		const bucketFromSa = typeof sa.storage_bucket === 'string' ? sa.storage_bucket : '';
		const bucket = bucketEnv || bucketFromSa;
		if (bucket) options.storageBucket = bucket;

		const app = name ? initializeApp(options, name) : initializeApp(options);
		cachedApps[alias] = app;
		return app;
	} catch (err) {
		initErrors[alias] = /** @type {Error} */ (err);
		throw err;
	}
}

// ── Nebras (المشروع الأساسيّ) — التصديرات القديمة + الجديدة ─────────

/**
 * يُرجع تطبيق Admin للمشروع الأساسي (Nebras). محفوظ للتوافق مع الكود القائم.
 * @returns {import('firebase-admin/app').App}
 */
export function getAdminApp() {
	return initAppFor('nebras');
}

export function getNebrasAdminApp() {
	return initAppFor('nebras');
}

/** Admin Auth (Nebras) — يستخدم لفكّ وتوثيق Firebase ID tokens. */
export function getAdminAuthService() {
	return getAdminAuth(getAdminApp());
}

/** Realtime Database (Nebras) — لقراءة/كتابة dashboard_users وسواه. */
export function getAdminDatabase() {
	return getAdminRtdb(getAdminApp());
}

/** Firestore (Nebras) — عام؛ مفيد إن قرّر Nebras استخدام Firestore مستقبلاً. */
export function getNebrasFirestoreAdmin() {
	return getAdminFirestore(initAppFor('nebras'));
}

// ── Mshcat — ربط الكتابة الإداريّة في `mshcat-fkdl` ────────────────

/** @returns {import('firebase-admin/app').App} */
export function getMshcatAdminApp() {
	return initAppFor('mshcat');
}

/** Firestore الخاصّ بمشروع Mshcat — يُستخدم من نقاط /api/mshcat/*. */
export function getMshcatFirestoreAdmin() {
	return getAdminFirestore(initAppFor('mshcat'));
}

// ── OldApp — ربط الكتابة الإداريّة في `mxqp-8d1e8` ─────────────────

/** @returns {import('firebase-admin/app').App} */
export function getOldAppAdminApp() {
	return initAppFor('oldapp');
}

/** Firestore الخاصّ بمشروع OldApp — يُستخدم من نقاط /api/oldapp/*. */
export function getOldAppFirestoreAdmin() {
	return getAdminFirestore(initAppFor('oldapp'));
}

// ── التحقّق من التوكن (دون تغيير واجهة الاستخدام الخارجيّة) ────────

/**
 * يتحقّق من Firebase ID token. يرمي `Error` إن لم يكن صالحاً.
 * @param {string} idToken
 * @returns {Promise<import('firebase-admin/auth').DecodedIdToken>}
 */
export async function verifyIdToken(idToken) {
	const token = (idToken || '').toString().trim();
	if (!token) throw new Error('missing_id_token');
	return getAdminAuthService().verifyIdToken(token, true);
}

// ── فحوصات التهيئة — تُستخدم من نقاط الـ API لإرجاع 501 بدل 500 ────

export function isAdminConfigured() {
	return Boolean(
		readEnv('NEBRAS_SERVICE_ACCOUNT') ||
			readEnv('NEBRAS_SERVICE_ACCOUNT_JSON') ||
			readEnv('NEBRAS_SERVICE_ACCOUNT_PATH') ||
			readEnv('FIREBASE_SERVICE_ACCOUNT_JSON') ||
			readEnv('FIREBASE_SERVICE_ACCOUNT_PATH')
	);
}

export function isMshcatAdminConfigured() {
	return Boolean(
		readEnv('MSHCAT_SERVICE_ACCOUNT') ||
			readEnv('MSHCAT_SERVICE_ACCOUNT_JSON') ||
			readEnv('MSHCAT_SERVICE_ACCOUNT_PATH')
	);
}

export function isOldAppAdminConfigured() {
	return Boolean(
		readEnv('OLDAPP_SERVICE_ACCOUNT') ||
			readEnv('OLDAPP_SERVICE_ACCOUNT_JSON') ||
			readEnv('OLDAPP_SERVICE_ACCOUNT_PATH')
	);
}

// ── إرسال إشعارات FCM (عبر تطبيق Nebras فقط) — دون تغيير ───────────

/**
 * إرسال رسالة FCM إلى topic محدّد عبر مشروع Nebras.
 *
 * @param {{ topic: string, title: string, body: string, data?: Record<string, unknown> }} options
 */
export async function sendTopicMessage({ topic, title, body, data = {} }) {
	const app = getAdminApp();
	const messaging = getMessaging(app);

	const safeData = /** @type {Record<string,string>} */ ({});
	for (const [k, v] of Object.entries(data || {})) {
		if (v === null || v === undefined) continue;
		safeData[k] = typeof v === 'string' ? v : String(v);
	}

	/** @type {import('firebase-admin/messaging').Message} */
	const message = {
		topic,
		notification: { title, body },
		data: safeData,
		android: {
			priority: 'high',
			notification: {
				channelId: 'nebras_notifications',
				clickAction: 'FLUTTER_NOTIFICATION_CLICK'
			}
		},
		apns: {
			payload: {
				aps: {
					alert: { title, body },
					sound: 'default'
				}
			}
		}
	};

	return messaging.send(message);
}

// ملاحظة: نُصدِّر getApp كأداة داخليّة اختياريّة فقط (لبعض حالات الـ test).
export { getApp as _internalGetApp };
