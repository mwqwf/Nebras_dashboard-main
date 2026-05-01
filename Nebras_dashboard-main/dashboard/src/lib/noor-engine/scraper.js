/**
 * Noor Library Scraper — جلب حقيقي من noor-book.com باستخدام Puppeteer + Stealth.
 *
 * يتجاوز حماية Cloudflare عبر puppeteer-extra-plugin-stealth.
 * مُصمَّم للتشغيل المحلّي (localhost) فقط — لا يعمل على Vercel.
 *
 * يدير instance واحد من المتصفّح لتقليل استهلاك الموارد.
 */

let puppeteer;
let StealthPlugin;
let browser = null;

async function ensureDeps() {
	if (!puppeteer) {
		puppeteer = (await import('puppeteer-extra')).default;
		StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default;
		puppeteer.use(StealthPlugin());
	}
}

async function getBrowser() {
	await ensureDeps();
	if (browser && browser.isConnected()) return browser;
	browser = await puppeteer.launch({
		headless: 'new',
		args: [
			'--no-sandbox',
			'--disable-setuid-sandbox',
			'--disable-dev-shm-usage',
			'--disable-gpu'
		]
	});
	return browser;
}

export async function closeBrowser() {
	if (browser) {
		await browser.close().catch(() => {});
		browser = null;
	}
}

const BASE = 'https://www.noor-book.com';

/**
 * جلب قائمة كتب من صفحة تصنيف.
 * @param {string} categorySlug — slug التصنيف (مثال: 'Islamic-Fiqh')
 * @param {number} page — رقم الصفحة (1-based)
 * @returns {Promise<ScrapedBook[]>}
 */
export async function scrapeCategory(categorySlug, page = 1) {
	const b = await getBrowser();
	const tab = await b.newPage();
	await tab.setViewport({ width: 1280, height: 800 });

	const url = `${BASE}/en/ebooks-${categorySlug}-pdf${page > 1 ? `?page=${page}` : ''}`;

	try {
		await tab.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

		const books = await tab.evaluate((baseUrl) => {
			const anchors = [...document.querySelectorAll('a[href*="ebook"]')];
			const unique = new Map();

			for (const a of anchors) {
				const href = a.getAttribute('href');
				if (!href || !href.includes('ebook-') || !href.includes('-pdf')) continue;
				if (unique.has(href)) continue;

				const card = a.closest('.col-md-2, .col-md-3, .col-lg-2, .col-lg-3') || a.parentElement;
				const img = card?.querySelector('img');
				const text = card?.textContent?.replace(/\s+/g, ' ')?.trim() || '';

				const downloadsMatch = text.match(/^\((\d+)\)\s*/);
				const downloads = downloadsMatch ? parseInt(downloadsMatch[1]) : 0;
				const textAfterDownloads = downloadsMatch
					? text.slice(downloadsMatch[0].length).trim()
					: text;

				const imgSrc = img?.src || img?.getAttribute('data-src') || null;
				const isCopyright = imgSrc?.includes('copyright') || text.includes('Unavailable');

				if (isCopyright) continue;

				const fullUrl = href.startsWith('http') ? href : baseUrl + href;

				unique.set(href, {
					sourceUrl: fullUrl,
					title: textAfterDownloads || '',
					thumbnail: imgSrc,
					downloads
				});
			}

			return [...unique.values()];
		}, BASE);

		await tab.close();
		return books.filter((b) => b.sourceUrl.includes('ebook-'));
	} catch (err) {
		await tab.close().catch(() => {});
		throw new Error(`Scrape failed for ${categorySlug}: ${err.message}`);
	}
}

/**
 * جلب تفاصيل كتاب واحد من صفحته.
 * @param {string} bookUrl — الرابط الكامل لصفحة الكتاب
 * @returns {Promise<BookDetail>}
 */
export async function scrapeBookDetail(bookUrl) {
	const b = await getBrowser();
	const tab = await b.newPage();

	try {
		await tab.goto(bookUrl, { waitUntil: 'networkidle2', timeout: 25000 });

		const detail = await tab.evaluate(() => {
			const title = (document.querySelector('h1')?.textContent || '')
				.replace(/^Download\s+Book\s+/i, '')
				.replace(/\s+Pdf$/i, '')
				.trim();

			const meta = {};
			const tables = document.querySelectorAll('table');
			for (const table of tables) {
				for (const row of table.querySelectorAll('tr')) {
					const cells = row.querySelectorAll('td, th');
					if (cells.length >= 2) {
						const key = cells[0]?.textContent?.trim()?.replace(/:$/, '');
						const val = cells[1]?.textContent?.trim()?.split('\n')[0]?.trim();
						if (key && val) meta[key] = val;
					}
				}
			}

			const descEl = document.querySelector(
				'.book-description, [class*="description"], .card-body > p, .content-text'
			);
			const description = descEl?.textContent?.trim() || '';

			const img = document.querySelector('img[src*="covers"]');
			const thumbnail = img?.src || null;

			return {
				title,
				author: meta['Author'] || meta['المؤلف'] || '',
				category: (meta['Category'] || meta['التصنيف'] || '').replace(/\[Edit\]/i, '').trim(),
				language: meta['Language'] || meta['اللغة'] || 'Arabic',
				pages: meta['Pages'] || meta['الصفحات'] || '',
				fileSize: meta['File Size'] || meta['حجم الملف'] || '',
				extension: meta['Extension'] || meta['الامتداد'] || 'PDF',
				description: description.slice(0, 1000),
				thumbnail
			};
		});

		await tab.close();
		return detail;
	} catch (err) {
		await tab.close().catch(() => {});
		return { title: '', author: '', category: '', language: 'Arabic', pages: '', fileSize: '', extension: 'PDF', description: '', thumbnail: null };
	}
}

/**
 * جلب قائمة التصنيفات الكاملة من صفحة book-categories.
 * @returns {Promise<{slug: string, name: string}[]>}
 */
export async function scrapeAllCategories() {
	const b = await getBrowser();
	const tab = await b.newPage();

	try {
		await tab.goto(`${BASE}/en/book-categories`, { waitUntil: 'networkidle2', timeout: 30000 });

		const categories = await tab.evaluate((baseUrl) => {
			const links = [...document.querySelectorAll('a[href*="ebooks-"][href*="-pdf"]')];
			const results = [];
			const seen = new Set();

			for (const a of links) {
				const href = a.getAttribute('href') || '';
				const match = href.match(/ebooks-(.+)-pdf/);
				if (!match) continue;
				const slug = match[1];
				if (seen.has(slug)) continue;
				seen.add(slug);

				const name = a.textContent?.trim() || slug.replace(/-/g, ' ');
				results.push({ slug, name });
			}
			return results;
		}, BASE);

		await tab.close();
		return categories;
	} catch (err) {
		await tab.close().catch(() => {});
		throw new Error(`Failed to scrape categories: ${err.message}`);
	}
}
