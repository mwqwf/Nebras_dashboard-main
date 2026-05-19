import nodemailer from "nodemailer";
import { b as private_env } from "./shared-server.js";
let cachedTransporter = null;
function readEnv(key) {
  return (private_env[key] || process.env[key] || "").toString().trim();
}
function getOwnerEmail() {
  return readEnv("OWNER_EMAIL");
}
function isOwnerEmail(email) {
  const owner = getOwnerEmail().toLowerCase();
  if (!owner) return false;
  return String(email || "").trim().toLowerCase() === owner;
}
function isSmtpConfigured() {
  return Boolean(readEnv("SMTP_HOST") && readEnv("SMTP_USER") && readEnv("SMTP_PASS"));
}
function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  if (!isSmtpConfigured()) return null;
  const port = Number(readEnv("SMTP_PORT")) || 587;
  const secureRaw = readEnv("SMTP_SECURE").toLowerCase();
  const secure = secureRaw === "true" || port === 465;
  cachedTransporter = nodemailer.createTransport({
    host: readEnv("SMTP_HOST"),
    port,
    secure,
    auth: {
      user: readEnv("SMTP_USER"),
      pass: readEnv("SMTP_PASS")
    }
  });
  return cachedTransporter;
}
async function sendOwnerCode({ code, candidateEmail, candidateName }) {
  const ownerEmail = getOwnerEmail();
  if (!ownerEmail) {
    console.error("[mailer] OWNER_EMAIL غير مضبوط في .env — لا يمكن إرسال رمز التحقّق.");
    return { delivered: false, reason: "owner_email_not_configured" };
  }
  const transporter = getTransporter();
  if (!transporter) {
    console.warn(
      `
========================================
[mailer] SMTP غير مضبوط — وضع التطوير فقط
OWNER_EMAIL = ${ownerEmail}
CODE = ${code}
Candidate = ${candidateName || "N/A"} <${candidateEmail || "N/A"}>
اضبط SMTP_HOST/USER/PASS في .env للنشر.
========================================
`
    );
    return { delivered: false, reason: "smtp_not_configured" };
  }
  const from = readEnv("SMTP_FROM") || readEnv("SMTP_USER");
  const subject = "رمز التحقّق — لوحة تحكّم نبراس";
  const safeCandidate = (candidateEmail || "غير معروف").replace(/[<>]/g, "");
  const safeName = (candidateName || "مستخدم جديد").replace(/[<>]/g, "");
  const text = [
    "السلام عليكم ورحمة الله وبركاته،",
    "",
    `محاولة إنشاء حساب جديد في لوحة تحكّم نبراس من: ${safeName} <${safeCandidate}>`,
    "",
    `رمز التحقّق: ${code}`,
    "",
    "صلاحيّة الرمز 10 دقائق. إذا لم تكن أنت من طلب هذا الرمز، تجاهل هذه الرسالة ولا تشاركها مع أحد.",
    "",
    "— نظام نبراس"
  ].join("\n");
  const html = `<!doctype html><html dir="rtl" lang="ar"><body style="font-family:Tahoma,Arial,sans-serif;background:#f4f6f8;padding:24px;">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:28px;border:1px solid #e5e7eb;">
  <h2 style="margin:0 0 12px;color:#059669;">رمز التحقّق — لوحة تحكّم نبراس</h2>
  <p style="color:#111827;line-height:1.9;margin:0 0 8px;">السلام عليكم ورحمة الله وبركاته،</p>
  <p style="color:#374151;line-height:1.8;margin:0 0 16px;">
    محاولة إنشاء حساب جديد في لوحة التحكّم من:<br/>
    <strong>${safeName}</strong> &lt;${safeCandidate}&gt;
  </p>
  <div style="background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;padding:16px;text-align:center;">
    <div style="color:#065f46;font-size:12px;letter-spacing:2px;">رمز التحقّق</div>
    <div style="font-size:36px;letter-spacing:10px;font-weight:800;color:#065f46;margin-top:6px;">${code}</div>
  </div>
  <p style="color:#6b7280;font-size:13px;line-height:1.8;margin-top:16px;">
    صلاحيّة الرمز 10 دقائق. إذا لم تكن أنت من طلب هذا الرمز، تجاهل هذه الرسالة ولا تشاركها مع أحد.
  </p>
  <p style="color:#9ca3af;font-size:12px;margin-top:24px;">— نظام نبراس</p>
</div>
</body></html>`;
  try {
    await transporter.sendMail({
      from,
      to: ownerEmail,
      subject,
      text,
      html
    });
    return { delivered: true };
  } catch (err) {
    console.error("[mailer] فشل إرسال البريد:", err?.message || err);
    return { delivered: false, reason: "smtp_send_failed" };
  }
}
export {
  isOwnerEmail as i,
  sendOwnerCode as s
};
