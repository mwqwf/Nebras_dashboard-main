/**
 * Firebase Admin SDK — خادم فقط (SvelteKit server).
 *
 * نستخدمه لإرسال إشعارات FCM من لوحة التحكّم إلى جميع أجهزة المستخدمين
 * عبر Topic عمومي. لا تعرض هذا الملف أو أيّ من قيم الـ service account للمتصفّح.
 *
 * يعتمد على أحد متغيري البيئة:
 *   FIREBASE_SERVICE_ACCOUNT_JSON  — محتوى ملف JSON كاملاً كسلسلة واحدة.
 *   FIREBASE_SERVICE_ACCOUNT_PATH  — مسار نسبي/مطلق لملف JSON على القرص.
 *
 * إن لم يتوفّر أيّ منهما، تُطلق الدوالّ خطأً واضحاً وتعود المسارات الخادمة
 * بـ 501 بدل 500 حتى لا تفشل صفحات الرفع في الواجهة.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';
import { env } from '$env/dynamic/private';

/** @type {import('firebase-admin/app').App | null} */
let cachedApp = null;
let initError = null;

function loadServiceAccount() {
	const jsonInline = (env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
	const jsonPath = (env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '').trim();

	if (jsonInline) {
		try {
			return JSON.parse(jsonInline);
		} catch (err) {
			throw new Error(
				'FIREBASE_SERVICE_ACCOUNT_JSON موجود لكنه ليس JSON صالحاً: ' + (err?.message || err)
			);
		}
	}

	if (jsonPath) {
		const abs = resolve(jsonPath);
		const raw = readFileSync(abs, 'utf8');
		try {
			return JSON.parse(raw);
		} catch (err) {
			throw new Error(
				`ملف FIREBASE_SERVICE_ACCOUNT_PATH=${abs} ليس JSON صالحاً: ` + (err?.message || err)
			);
		}
	}

	throw new Error(
		'لم يُضبط FIREBASE_SERVICE_ACCOUNT_JSON ولا FIREBASE_SERVICE_ACCOUNT_PATH — ' +
			'أضف أحدهما في ملف .env لتفعيل إرسال إشعارات FCM.'
	);
}

/**
 * يُرجِع تطبيق Admin جاهزاً أو يرمي خطأً واضحاً.
 * يقوم بالتخزين المؤقّت حتى لا نُعيد تهيئته في كل طلب.
 *
 * @returns {import('firebase-admin/app').App}
 */
export function getAdminApp() {
	if (cachedApp) return cachedApp;
	if (initError) throw initError;

	if (getApps().length > 0) {
		cachedApp = getApp();
		return cachedApp;
	}

	try {
		const serviceAccount = loadServiceAccount();
		cachedApp = initializeApp({
			credential: cert(serviceAccount),
			projectId: serviceAccount.project_id
		});
		return cachedApp;
	} catch (err) {
		initError = err;
		throw err;
	}
}

/** ملخّص: هل الـ Admin SDK جاهز للإرسال؟ (للاستخدام في فحوصات 501). */
export function isAdminConfigured() {
	return Boolean(
		(env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim() ||
			(env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '').trim()
	);
}

/**
 * إرسال رسالة FCM إلى topic محدّد.
 *
 * @param {{
 *   topic: string,
 *   title: string,
 *   body: string,
 *   data?: Record<string, string>
 * }} options
 */
export async function sendTopicMessage({ topic, title, body, data = {} }) {
	const app = getAdminApp();
	const messaging = getMessaging(app);

	// Firebase يشترط أن تكون كل قيم data من نوع string.
	const safeData = {};
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
				// يجعل الإشعار قابلاً للنقر ويفتح التطبيق.
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
