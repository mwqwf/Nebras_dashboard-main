/**
 * downloader.js — تنزيل آمن لملفّات IA إلى buffer في الذاكرة.
 *
 * لماذا buffer في الذاكرة وليس streaming إلى Storage مباشرة؟
 *   - adminUploader في نبراس يقبل Buffer (نفس الواجهة المُستخدَمة من Noor)
 *     وملف Vercel serverless له تايم آوت قصير، لذا التزامن داخل دالة
 *     واحدة أبسط وأكثر موثوقية لملفّات ≤ الحدّ الأقصى المحدّد.
 *   - نطبّق حدّ حجم صلب من playabilityFilter.MAX_SIZE_BYTES لتجنّب OOM.
 *
 * نحقن:
 *   - User-Agent يعرّف نفسه
 *   - تتبُّع الـ redirect (IA يردّ 302 إلى server المخصّص)
 *   - فحص حجم Content-Length (إن وُجد) قبل قراءة البايتات
 *   - إلغاء سريع عند تجاوز الحدّ أثناء البثّ
 */

import { MAX_SIZE_BYTES, verifyDownloadedBuffer } from './playabilityFilter.js';

// User-Agent مع contact email — توصية رسميّة من Internet Archive.
const USER_AGENT =
	'NebrasDashboard/1.0 (https://nebras.app; contact: dashboard@nebras.app) NebrasIAEngine';

/**
 * يُنزّل الملفّ ويُرجع Buffer بعد فحص الـ magic bytes والحجم.
 *
 * @param {string} url رابط التنزيل (https://archive.org/download/...)
 * @param {{
 *   declaredType: 'document'|'audio'|'video',
 *   maxBytes?: number,
 *   timeoutMs?: number
 * }} opts
 * @returns {Promise<{
 *   buffer: Buffer,
 *   contentType: string,
 *   size: number
 * }>}
 */
export async function downloadIaFile(url, opts) {
	const declaredType = opts?.declaredType;
	if (!declaredType) {
		throw Object.assign(new Error('declaredType مطلوب لـ downloadIaFile.'), {
			reason: 'declared_type_required',
			status: 400
		});
	}
	const maxBytes = Number(opts?.maxBytes || MAX_SIZE_BYTES[declaredType] || 0);
	if (!maxBytes) {
		throw Object.assign(new Error('maxBytes غير صالح.'), {
			reason: 'invalid_max_bytes',
			status: 400
		});
	}
	const timeoutMs = Math.max(5_000, Math.min(180_000, Number(opts?.timeoutMs || 90_000)));

	const ac = new AbortController();
	const timer = setTimeout(() => ac.abort(new Error('download_timeout')), timeoutMs);

	let res;
	try {
		res = await fetch(url, {
			method: 'GET',
			redirect: 'follow',
			signal: ac.signal,
			headers: {
				'User-Agent': USER_AGENT,
				Accept: '*/*'
			}
		});
	} catch (err) {
		clearTimeout(timer);
		throw Object.assign(new Error(`فشل بدء التنزيل: ${err?.message || err}`), {
			reason: 'fetch_failed',
			status: 502
		});
	}

	if (!res.ok) {
		clearTimeout(timer);
		throw Object.assign(new Error(`IA download HTTP ${res.status}`), {
			reason: 'download_http_error',
			status: res.status
		});
	}

	// فحص Content-Length إن أعطاه الخادم قبل أن نبدأ بحجز buffer.
	const declaredLen = Number(res.headers.get('content-length') || 0);
	if (declaredLen > 0 && declaredLen > maxBytes) {
		clearTimeout(timer);
		throw Object.assign(new Error('الملفّ أكبر من الحدّ المسموح به (Content-Length).'), {
			reason: 'size_over_limit_header',
			status: 413
		});
	}

	const contentType = String(res.headers.get('content-type') || '').toLowerCase();

	// نقرأ الـ stream دفعةً دفعة لمراقبة الحجم في الزمن الحقيقي.
	const chunks = [];
	let received = 0;
	const reader = res.body?.getReader();
	if (!reader) {
		clearTimeout(timer);
		throw Object.assign(new Error('لا يوجد body للقراءة.'), {
			reason: 'no_body',
			status: 502
		});
	}

	try {
		// eslint-disable-next-line no-constant-condition
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			if (!value) continue;
			received += value.byteLength;
			if (received > maxBytes) {
				try {
					await reader.cancel();
				} catch {
					/* ignore */
				}
				throw Object.assign(new Error('تجاوز التنزيل الحدّ المسموح به أثناء البثّ.'), {
					reason: 'size_over_limit_streaming',
					status: 413
				});
			}
			chunks.push(value);
		}
	} finally {
		clearTimeout(timer);
	}

	const buffer = Buffer.concat(chunks.map((u) => Buffer.from(u)));

	// تحقُّق نهائي على البايتات (magic bytes + حجم + mime).
	const verify = verifyDownloadedBuffer(buffer, { contentType, declaredType });
	if (!verify.ok) {
		throw Object.assign(
			new Error(`الملفّ المنزَّل غير صالح (${verify.reason}).`),
			{ reason: `verify_${verify.reason}`, status: 422 }
		);
	}

	return { buffer, contentType, size: buffer.byteLength };
}
