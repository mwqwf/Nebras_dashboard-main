/**
 * POST /api/notify
 *
 * يستقبل طلبات إرسال إشعار FCM من صفحات لوحة التحكّم ويرسلها لجميع الأجهزة
 * المشتركة في الـ topic (افتراضياً `nebras_all_users`).
 *
 * Body (JSON):
 *   {
 *     title:  string,  // عنوان الإشعار
 *     body:   string,  // نص الإشعار
 *     data?:  Record<string, string|number>, // حمولة اختيارية للتطبيق
 *     topic?: string   // يُسمح بتجاوز الـ topic الافتراضي للاختبار
 *   }
 *
 * الاستجابات:
 *   200 { ok: true, messageId }          — نُشر الإشعار بنجاح.
 *   501 { ok: false, reason: 'not_configured' }
 *        عندما يكون FIREBASE_SERVICE_ACCOUNT_JSON غير مضبوط. الواجهة يجب أن
 *        تعامل هذه الحالة كـ "إشعار غير مفعّل" ولا توقف الرفع.
 *   4xx/5xx — خطأ حقيقي يجب تسجيله في الواجهة دون تعطيل عملية الرفع.
 */

import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import {
	isAdminConfigured,
	sendTopicMessage
} from '$lib/server/firebaseAdmin.js';

const DEFAULT_TOPIC = 'nebras_all_users';

function resolveTopic(bodyTopic) {
	const envTopic = env.FCM_BROADCAST_TOPIC?.trim();
	return (bodyTopic && String(bodyTopic).trim()) || envTopic || DEFAULT_TOPIC;
}

/** @type {import('@sveltejs/kit').RequestHandler} */
export async function POST({ request }) {
	if (!isAdminConfigured()) {
		return json(
			{
				ok: false,
				reason: 'not_configured',
				message:
					'Firebase Admin غير مُهيّأ على الخادم — أضف FIREBASE_SERVICE_ACCOUNT_JSON في .env لتفعيل الإشعارات.'
			},
			{ status: 501 }
		);
	}

	let payload;
	try {
		payload = await request.json();
	} catch {
		return json({ ok: false, reason: 'invalid_json' }, { status: 400 });
	}

	const title = (payload?.title || '').toString().trim();
	const body = (payload?.body || '').toString().trim();
	if (!title || !body) {
		return json(
			{ ok: false, reason: 'missing_title_or_body' },
			{ status: 400 }
		);
	}

	const topic = resolveTopic(payload?.topic);
	const data = payload?.data && typeof payload.data === 'object' ? payload.data : {};

	try {
		const messageId = await sendTopicMessage({ topic, title, body, data });
		return json({ ok: true, topic, messageId });
	} catch (err) {
		console.error('[api/notify] فشل إرسال FCM:', err);
		return json(
			{
				ok: false,
				reason: 'fcm_send_failed',
				message: err?.message || 'فشل إرسال الإشعار'
			},
			{ status: 502 }
		);
	}
}
