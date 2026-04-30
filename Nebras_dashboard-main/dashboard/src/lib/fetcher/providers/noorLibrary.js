/**
 * Noor Library Provider — مكتبة نور (noor-book.com)
 *
 * أوّل مزوّد مبنيّ على البنية المرنة. يجلب كتباً مفتوحة المصدر
 * من مكتبة نور عبر تحليل صفحات HTML (لا يوجد API رسمي).
 *
 * ملاحظة: الموقع محميّ بـ Cloudflare. في بيئة الإنتاج قد يحتاج
 * إلى headless browser أو cookies مُسبقة. هذا المزوّد يُقدّم
 * أيضاً وضع محاكاة (simulation) للتجربة والعرض التوضيحي.
 */

import { BaseProvider } from '../BaseProvider.js';

const BASE_URL = 'https://www.noor-book.com';

const KNOWN_CATEGORIES = [
	{
		slug: 'Islamic-Ethics-and-Ethics',
		name: 'الأخلاق والأدب الإسلامي',
		parent: 'islamic-religion'
	},
	{
		slug: 'Interpretation-of-the-Koran',
		name: 'تفسير القرآن الكريم',
		parent: 'islamic-religion'
	},
	{
		slug: 'The-Holy-Quran',
		name: 'القرآن الكريم',
		parent: 'islamic-religion'
	},
	{
		slug: 'Islamic-Fiqh',
		name: 'الفقه الإسلامي',
		parent: 'islamic-religion'
	},
	{
		slug: 'Hadiths-of-judgments',
		name: 'أحاديث الأحكام',
		parent: 'islamic-religion'
	},
	{
		slug: 'Islamic-culture',
		name: 'الثقافة الإسلامية',
		parent: 'islamic-religion'
	},
	{
		slug: 'Islamic-history',
		name: 'التاريخ الإسلامي',
		parent: 'history'
	},
	{
		slug: 'Arabic-grammar-and-Arabic-grammar',
		name: 'النحو العربي',
		parent: 'arabic-language'
	},
	{
		slug: 'Python-programming-language',
		name: 'لغة بايثون',
		parent: 'programming'
	},
	{
		slug: 'JavaScript-programming-language',
		name: 'لغة جافاسكربت',
		parent: 'programming'
	},
	{
		slug: 'Human-development-and-self-development',
		name: 'التنمية البشرية وتطوير الذات',
		parent: 'self-development'
	},
	{
		slug: 'Sociology',
		name: 'علم الاجتماع',
		parent: 'social-sciences'
	}
];

/**
 * يحاول جلب صفحة HTML من مكتبة نور.
 * يعالج Cloudflare بلطف ويعيد null إن فشل.
 */
async function fetchPage(url) {
	try {
		const resp = await fetch(url, {
			headers: {
				'User-Agent':
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
				Accept: 'text/html,application/xhtml+xml',
				'Accept-Language': 'ar,en;q=0.9'
			},
			signal: AbortSignal.timeout(15000)
		});
		if (!resp.ok) return null;
		const html = await resp.text();
		if (html.includes('Just a moment') || html.includes('cf_chl')) {
			return null;
		}
		return html;
	} catch {
		return null;
	}
}

/**
 * يستخرج بيانات الكتب من صفحة HTML لتصنيف معيّن.
 * يعتمد على أنماط HTML المعروفة لمكتبة نور.
 */
function parseBooksFromHtml(html, categorySlug) {
	const books = [];
	const bookPattern =
		/<a[^>]*href="[^"]*\/(?:en\/)?ebook-([^"]+)-pdf"[^>]*>([\s\S]*?)<\/a>/gi;
	let match;
	while ((match = bookPattern.exec(html)) !== null) {
		const slug = match[1];
		const innerHtml = match[2];
		const titleMatch = innerHtml.match(
			/<(?:h[2-6]|span|div)[^>]*class="[^"]*(?:title|name)[^"]*"[^>]*>([\s\S]*?)<\/(?:h[2-6]|span|div)>/i
		);
		const title = titleMatch
			? titleMatch[1].replace(/<[^>]+>/g, '').trim()
			: decodeURIComponent(slug.replace(/-/g, ' '));
		const imgMatch = innerHtml.match(
			/<img[^>]*src="([^"]+)"[^>]*>/i
		);
		const thumbnailUrl = imgMatch ? imgMatch[1] : null;

		books.push({
			externalId: `noor:${slug}`,
			title,
			author: '',
			description: '',
			category: categorySlug,
			language: 'ar',
			pageCount: '',
			thumbnailUrl,
			sourceUrl: `${BASE_URL}/en/ebook-${slug}-pdf`,
			downloadUrl: null,
			fileType: 'PDF',
			fileSize: ''
		});
	}
	return books;
}

/**
 * يولّد بيانات تجريبية واقعية عندما يكون الموقع محميّاً بـ Cloudflare.
 * هذا يسمح باختبار المحرك كاملاً دون الحاجة لتجاوز الحماية.
 */
function generateSimulatedBooks(categorySlug, page = 1, limit = 10) {
	const SAMPLE_DATA = {
		'Islamic-Ethics-and-Ethics': [
			{
				title: 'الأخلاق الإسلامية وأسسها',
				author: 'عبد الرحمن حبنكة الميداني',
				description:
					'كتاب شامل في الأخلاق الإسلامية يتناول أسسها النظرية وتطبيقاتها العملية في حياة المسلم.'
			},
			{
				title: 'خلق المسلم',
				author: 'محمد الغزالي',
				description:
					'يستعرض الكتاب أهم الأخلاق التي ينبغي أن يتحلّى بها المسلم مع الاستدلال من القرآن والسنة.'
			},
			{
				title: 'الأدب المفرد',
				author: 'الإمام البخاري',
				description:
					'مجموعة أحاديث نبوية شريفة في الآداب والأخلاق جمعها الإمام البخاري رحمه الله.'
			},
			{
				title: 'مكارم الأخلاق',
				author: 'ابن أبي الدنيا',
				description:
					'كتاب يجمع الأحاديث والآثار المتعلقة بمكارم الأخلاق ومحاسن الآداب.'
			},
			{
				title: 'إحياء علوم الدين',
				author: 'أبو حامد الغزالي',
				description:
					'موسوعة شاملة في علوم الدين والأخلاق والتربية الروحية.'
			}
		],
		'Interpretation-of-the-Koran': [
			{
				title: 'تفسير ابن كثير',
				author: 'ابن كثير',
				description: 'من أشهر كتب التفسير بالمأثور.'
			},
			{
				title: 'تفسير الجلالين',
				author: 'جلال الدين المحلي وجلال الدين السيوطي',
				description: 'تفسير مختصر وشامل للقرآن الكريم.'
			},
			{
				title: 'في ظلال القرآن',
				author: 'سيد قطب',
				description: 'تفسير أدبي حديث يربط آيات القرآن بالواقع المعاصر.'
			},
			{
				title: 'تفسير الطبري',
				author: 'الإمام الطبري',
				description: 'أقدم وأوسع كتب التفسير بالمأثور.'
			}
		],
		'Islamic-Fiqh': [
			{
				title: 'فقه السنة',
				author: 'سيد سابق',
				description: 'كتاب فقهي ميسّر يعتمد على الأحاديث الصحيحة.'
			},
			{
				title: 'المغني',
				author: 'ابن قدامة المقدسي',
				description: 'موسوعة فقهية حنبلية شاملة.'
			},
			{
				title: 'بداية المجتهد ونهاية المقتصد',
				author: 'ابن رشد',
				description: 'كتاب في الفقه المقارن يعرض آراء المذاهب الأربعة.'
			}
		],
		default: [
			{
				title: 'مقدمة ابن خلدون',
				author: 'ابن خلدون',
				description: 'أشهر كتاب في فلسفة التاريخ وعلم الاجتماع.'
			},
			{
				title: 'الأيام',
				author: 'طه حسين',
				description: 'سيرة ذاتية لعميد الأدب العربي.'
			},
			{
				title: 'رسالة في الطريق إلى ثقافتنا',
				author: 'محمود شاكر',
				description: 'دراسة عميقة في الثقافة العربية الإسلامية.'
			}
		]
	};

	const data = SAMPLE_DATA[categorySlug] || SAMPLE_DATA['default'];
	const startIdx = (page - 1) * limit;

	const books = data.slice(startIdx, startIdx + limit).map((item, idx) => ({
		externalId: `noor:sim:${categorySlug}:${startIdx + idx}`,
		title: item.title,
		author: item.author,
		description: item.description,
		category: categorySlug,
		language: 'ar',
		pageCount: String(Math.floor(Math.random() * 400) + 50),
		thumbnailUrl: null,
		sourceUrl: `${BASE_URL}/en/ebook-${encodeURIComponent(item.title.replace(/\s+/g, '-'))}-pdf`,
		downloadUrl: null,
		fileType: 'PDF',
		fileSize: `${(Math.random() * 15 + 1).toFixed(1)} MB`
	}));

	return {
		books,
		hasMore: startIdx + limit < data.length,
		totalEstimate: data.length
	};
}

export class NoorLibraryProvider extends BaseProvider {
	get id() {
		return 'noor-library';
	}
	get displayName() {
		return 'مكتبة نور';
	}
	get baseUrl() {
		return BASE_URL;
	}

	async fetchBooks({ category = '', query = '', page = 1, limit = 10 } = {}) {
		const slug = category || 'Islamic-Ethics-and-Ethics';
		const url = query
			? `${BASE_URL}/en/search?q=${encodeURIComponent(query)}&page=${page}`
			: `${BASE_URL}/en/ebooks-${slug}-pdf?page=${page}`;

		const html = await fetchPage(url);

		if (html) {
			const books = parseBooksFromHtml(html, slug);
			return {
				books: books.slice(0, limit),
				hasMore: books.length >= limit,
				totalEstimate: books.length
			};
		}

		return generateSimulatedBooks(slug, page, limit);
	}

	async fetchBookDetail(externalId) {
		const slug = String(externalId).replace(/^noor:/, '').replace(/^sim:/, '');
		const url = `${BASE_URL}/en/ebook-${slug}-pdf`;
		const html = await fetchPage(url);

		if (!html) {
			return {
				externalId,
				title: decodeURIComponent(slug.replace(/-/g, ' ')),
				author: '',
				description: 'تعذّر جلب التفاصيل — الموقع محميّ بـ Cloudflare.',
				category: '',
				language: 'ar',
				pageCount: '',
				thumbnailUrl: null,
				sourceUrl: url,
				downloadUrl: null,
				fileType: 'PDF',
				fileSize: ''
			};
		}

		const titleMatch = html.match(
			/<h1[^>]*>([\s\S]*?)<\/h1>/i
		);
		const descMatch = html.match(
			/<div[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/div>/i
		);

		return {
			externalId,
			title: titleMatch
				? titleMatch[1].replace(/<[^>]+>/g, '').trim()
				: slug.replace(/-/g, ' '),
			author: '',
			description: descMatch
				? descMatch[1].replace(/<[^>]+>/g, '').trim()
				: '',
			category: '',
			language: 'ar',
			pageCount: '',
			thumbnailUrl: null,
			sourceUrl: url,
			downloadUrl: null,
			fileType: 'PDF',
			fileSize: ''
		};
	}

	async fetchCategories() {
		return KNOWN_CATEGORIES.map((c) => ({
			slug: c.slug,
			name: c.name,
			parentSlug: c.parent || null
		}));
	}
}
