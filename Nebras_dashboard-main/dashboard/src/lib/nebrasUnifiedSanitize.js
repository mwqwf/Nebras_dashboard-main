/**
 * إزالة القيم `undefined` بعمق — Firestore يرفض الحقول undefined بينما RTDB كانت تتجاهلها.
 * @param {unknown} value
 * @returns {unknown}
 */
export function stripUndefinedDeep(value) {
	if (Array.isArray(value)) {
		return value.map((item) => stripUndefinedDeep(item)).filter((item) => item !== undefined);
	}
	if (value && typeof value === 'object' && !(value instanceof Date)) {
		const out = {};
		for (const [k, v] of Object.entries(value)) {
			const cleaned = stripUndefinedDeep(v);
			if (cleaned !== undefined) out[k] = cleaned;
		}
		return out;
	}
	return value === undefined ? undefined : value;
}
