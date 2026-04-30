/**
 * Provider Registry — سجلّ المزوّدين المتاح.
 *
 * نقطة واحدة للوصول إلى جميع مزوّدي جلب المحتوى.
 * لإضافة مزوّد جديد: أنشئ صنفاً يمتدّ من BaseProvider،
 * ثمّ سجّله هنا بـ registerProvider().
 */

import { NoorLibraryProvider } from './providers/noorLibrary.js';

/** @type {Map<string, import('./BaseProvider.js').BaseProvider>} */
const providers = new Map();

export function registerProvider(provider) {
	providers.set(provider.id, provider);
}

/** @returns {import('./BaseProvider.js').BaseProvider|undefined} */
export function getProvider(id) {
	return providers.get(id);
}

/** @returns {Array<{id: string, displayName: string, baseUrl: string}>} */
export function listProviders() {
	return [...providers.values()].map((p) => ({
		id: p.id,
		displayName: p.displayName,
		baseUrl: p.baseUrl
	}));
}

registerProvider(new NoorLibraryProvider());
