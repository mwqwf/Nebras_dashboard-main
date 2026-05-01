/**
 * BaseProvider — واجهة أساسية لمصادر جلب المحتوى.
 *
 * كل مزوّد (Noor Library, Archive.org, …) يمتدّ من هذا الصنف ويُنفّذ
 * الدوالّ المجرّدة. هذا يضمن بنية موحّدة قابلة للتوسّع.
 */
export class BaseProvider {
	/** @returns {string} معرّف فريد للمزوّد (مثال: 'noor-library') */
	get id() {
		throw new Error('Provider must implement get id()');
	}

	/** @returns {string} اسم معروض في الواجهة (مثال: 'مكتبة نور') */
	get displayName() {
		throw new Error('Provider must implement get displayName()');
	}

	/** @returns {string} رابط الموقع الأساسي */
	get baseUrl() {
		throw new Error('Provider must implement get baseUrl()');
	}

	/**
	 * جلب قائمة الكتب من تصنيف/صفحة محدّدة.
	 *
	 * @param {object} opts
	 * @param {string} [opts.category] — تصنيف محدّد (slug أو معرّف)
	 * @param {string} [opts.query] — نصّ بحث
	 * @param {number} [opts.page] — رقم الصفحة
	 * @param {number} [opts.limit] — عدد النتائج
	 * @returns {Promise<FetchResult>}
	 *
	 * @typedef {object} FetchResult
	 * @property {RawBook[]} books
	 * @property {boolean} hasMore
	 * @property {number} totalEstimate
	 *
	 * @typedef {object} RawBook
	 * @property {string} externalId — معرّف فريد من المصدر
	 * @property {string} title
	 * @property {string} [author]
	 * @property {string} [description]
	 * @property {string} [category] — تصنيف المصدر الأصلي
	 * @property {string} [language]
	 * @property {string} [pageCount]
	 * @property {string} [thumbnailUrl]
	 * @property {string} sourceUrl — رابط الكتاب على المصدر
	 * @property {string} [downloadUrl] — رابط تحميل مباشر (إن وُجد)
	 * @property {string} [fileType]
	 * @property {string} [fileSize]
	 */
	async fetchBooks(_opts) {
		throw new Error('Provider must implement fetchBooks()');
	}

	/**
	 * جلب تفاصيل كتاب واحد من المصدر.
	 * @param {string} _externalId
	 * @returns {Promise<RawBook|null>}
	 */
	async fetchBookDetail(_externalId) {
		throw new Error('Provider must implement fetchBookDetail()');
	}

	/**
	 * جلب قائمة التصنيفات المتاحة من المصدر.
	 * @returns {Promise<ProviderCategory[]>}
	 *
	 * @typedef {object} ProviderCategory
	 * @property {string} slug
	 * @property {string} name
	 * @property {string} [parentSlug]
	 */
	async fetchCategories() {
		throw new Error('Provider must implement fetchCategories()');
	}
}
