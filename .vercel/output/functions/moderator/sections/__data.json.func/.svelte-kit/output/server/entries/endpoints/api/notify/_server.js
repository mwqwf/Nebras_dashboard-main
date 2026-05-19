import { json } from "@sveltejs/kit";
import { b as private_env } from "../../../../chunks/shared-server.js";
import { i as isAdminConfigured, s as sendTopicMessage } from "../../../../chunks/firebaseAdmin.js";
const DEFAULT_TOPIC = "nebras_all_users";
function resolveTopic(bodyTopic) {
  const envTopic = private_env.FCM_BROADCAST_TOPIC?.trim();
  return bodyTopic && String(bodyTopic).trim() || envTopic || DEFAULT_TOPIC;
}
async function POST({ request }) {
  if (!isAdminConfigured()) {
    return json(
      {
        ok: false,
        reason: "not_configured",
        message: "Firebase Admin غير مُهيّأ على الخادم — أضف FIREBASE_SERVICE_ACCOUNT_JSON في .env لتفعيل الإشعارات."
      },
      { status: 501 }
    );
  }
  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, reason: "invalid_json" }, { status: 400 });
  }
  const title = (payload?.title || "").toString().trim();
  const body = (payload?.body || "").toString().trim();
  if (!title || !body) {
    return json(
      { ok: false, reason: "missing_title_or_body" },
      { status: 400 }
    );
  }
  const topic = resolveTopic(payload?.topic);
  const data = payload?.data && typeof payload.data === "object" ? payload.data : {};
  try {
    const messageId = await sendTopicMessage({ topic, title, body, data });
    return json({ ok: true, topic, messageId });
  } catch (err) {
    console.error("[api/notify] فشل إرسال FCM:", err);
    return json(
      {
        ok: false,
        reason: "fcm_send_failed",
        message: err?.message || "فشل إرسال الإشعار"
      },
      { status: 502 }
    );
  }
}
export {
  POST
};
