#!/usr/bin/env node
/**
 * Noor Library importer for Mshcat Firestore.
 *
 * It runs Chromium through puppeteer-extra Stealth Mode, classifies every book
 * into the strict hierarchy main > sub > secondary > content, creates missing
 * sections with dashboard-compatible fields, and writes an import report.
 */

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import {
	DEFAULT_SECTION_STATE,
	assertValidPath,
	classifyBook,
	isIgnoredSectionName,
	normalizeArabic
} from './sectionTree.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPORT_PATH = resolve(__dirname, '../../reports/noor-import-report.json');
const DEFAULT_BOOK_TITLE = 'النصائح حول التعليمات العلمية السادة';
const DEFAULT_BOOK_SEARCH_URL =
	'https://www.noor-book.com/search?q=' + encodeURIComponent(DEFAULT_BOOK_TITLE);

const CATEGORIES_COLLECTION = 'categories';
const BOOKS_COLLECTION = 'books';
const MAIN_FIELD = 'mainCategory';
const SUB_FIELD = 'subCategory';
const SUB_SUB_FIELD = 'subSubCategory';

function parseDotEnvValue(value) {
	let v = String(value || '').trim();
	if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
		v = v.slice(1, -1);
	}
	return v.replace(/\\n/g, '\n');
}

function loadEnvFile(path = resolve(process.cwd(), '.env')) {
	if (!existsSync(path)) return;
	const raw = readFileSync(path, 'utf8');
	for (const line of raw.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith('#')) continue;
		const idx = trimmed.indexOf('=');
		if (idx < 0) continue;
		const key = trimmed.slice(0, idx).trim();
		if (!key || process.env[key] !== undefined) continue;
		process.env[key] = parseDotEnvValue(trimmed.slice(idx + 1));
	}
}

function readEnv(name) {
	return String(process.env[name] || '').trim();
}

function readServiceAccount() {
	const combined = readEnv('MSHCAT_SERVICE_ACCOUNT');
	const inline = readEnv('MSHCAT_SERVICE_ACCOUNT_JSON');
	const path = readEnv('MSHCAT_SERVICE_ACCOUNT_PATH');
	const value = combined || inline;

	if (value) {
		if (value.startsWith('{')) return JSON.parse(value);
		return JSON.parse(readFileSync(resolve(value), 'utf8'));
	}
	if (path) return JSON.parse(readFileSync(resolve(path), 'utf8'));

	throw new Error(
		'MSHCAT_SERVICE_ACCOUNT_JSON أو MSHCAT_SERVICE_ACCOUNT_PATH مطلوب للكتابة في Firestore.'
	);
}

function initFirestore() {
	const app =
		getApps().find((item) => item.name === 'NoorImporterMshcat') ||
		initializeApp(
			{
				credential: cert(readServiceAccount()),
				storageBucket: readEnv('MSHCAT_STORAGE_BUCKET') || undefined
			},
			'NoorImporterMshcat'
		);
	return getFirestore(app);
}

function assertChromeExecutable() {
	const executablePath = readEnv('PUPPETEER_EXECUTABLE_PATH');
	if (!executablePath) {
		throw new Error('PUPPETEER_EXECUTABLE_PATH غير مضبوط في .env.');
	}
	const abs = resolve(executablePath);
	if (!existsSync(abs) || !statSync(abs).isFile()) {
		throw new Error(`مسار Chrome غير صالح: ${executablePath}`);
	}
	return abs;
}

async function loadStealthPuppeteer() {
	let puppeteerExtra;
	let StealthPlugin;
	try {
		puppeteerExtra = (await import('puppeteer-extra')).default;
		StealthPlugin = (await import('puppeteer-extra-plugin-stealth')).default;
	} catch (err) {
		throw new Error(
			'Stealth Mode يتطلب تثبيت puppeteer-extra و puppeteer-extra-plugin-stealth: ' +
				(err?.message || err)
		);
	}
	try {
		const puppeteerCore = (await import('puppeteer-core')).default;
		if (typeof puppeteerExtra.addExtra === 'function') {
			puppeteerExtra = puppeteerExtra.addExtra(puppeteerCore);
		}
	} catch {
		// puppeteer-extra can also resolve a locally installed puppeteer package.
	}
	puppeteerExtra.use(StealthPlugin());
	return puppeteerExtra;
}

function encodeName(name) {
	return Buffer.from(String(name || '').trim(), 'utf8')
		.toString('base64')
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

function buildPathPayload(names) {
	return names.filter(Boolean).map(encodeName).join('~');
}

function categoryIdForPath(path, level) {
	if (level === 'main') return `mshcat:main:${buildPathPayload([path.main])}`;
	if (level === 'sub') return `mshcat:sub:${buildPathPayload([path.main, path.sub])}`;
	return `mshcat:sec:${buildPathPayload([path.main, path.sub, path.secondary])}`;
}

function pathKey(parts) {
	return parts.map(normalizeArabic).join(' > ');
}

function categoryDocForPath(path, level) {
	const doc = {
		createdAt: FieldValue.serverTimestamp(),
		updatedAt: FieldValue.serverTimestamp(),
		order_index: DEFAULT_SECTION_STATE.order_index,
		is_listed: DEFAULT_SECTION_STATE.is_listed
	};
	if (DEFAULT_SECTION_STATE.thumbnail) doc.image = DEFAULT_SECTION_STATE.thumbnail;

	if (level === 'main') {
		doc[MAIN_FIELD] = path.main;
	} else if (level === 'sub') {
		doc[MAIN_FIELD] = path.main;
		doc[SUB_FIELD] = path.sub;
	} else {
		doc[MAIN_FIELD] = path.main;
		doc[SUB_FIELD] = path.sub;
		doc[SUB_SUB_FIELD] = path.secondary;
	}
	return doc;
}

async function fetchExistingCategories(db) {
	const snap = await db.collection(CATEGORIES_COLLECTION).get();
	const seen = new Set();
	for (const doc of snap.docs) {
		const data = doc.data() || {};
		const main = String(data[MAIN_FIELD] || '').trim();
		const sub = String(data[SUB_FIELD] || '').trim();
		const secondary = String(data[SUB_SUB_FIELD] || '').trim();
		if (!main || isIgnoredSectionName(main)) continue;
		seen.add(pathKey([main]));
		if (sub && !isIgnoredSectionName(sub)) seen.add(pathKey([main, sub]));
		if (sub && !isIgnoredSectionName(sub) && secondary && !isIgnoredSectionName(secondary)) {
			seen.add(pathKey([main, sub, secondary]));
		}
	}
	return seen;
}

async function ensureSectionPath(db, path, existing, report) {
	const valid = assertValidPath(path);
	const levels = [
		{ level: 'main', parts: [valid.main], label: valid.main },
		{ level: 'sub', parts: [valid.main, valid.sub], label: `${valid.main} > ${valid.sub}` },
		{
			level: 'secondary',
			parts: [valid.main, valid.sub, valid.secondary],
			label: `${valid.main} > ${valid.sub} > ${valid.secondary}`
		}
	];

	for (const item of levels) {
		const key = pathKey(item.parts);
		if (existing.has(key)) continue;
		await db.collection(CATEGORIES_COLLECTION).add(categoryDocForPath(valid, item.level));
		existing.add(key);
		report.newSections.push({
			level: item.level,
			path: item.label,
			order_index: DEFAULT_SECTION_STATE.order_index,
			is_listed: DEFAULT_SECTION_STATE.is_listed,
			thumbnail: DEFAULT_SECTION_STATE.thumbnail
		});
	}

	return categoryIdForPath(valid, 'secondary');
}

async function scrapeNoorBooks(targetUrl, executablePath) {
	const puppeteer = await loadStealthPuppeteer();
	const browser = await puppeteer.launch({
		headless: 'new',
		executablePath,
		args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
	});

	try {
		const page = await browser.newPage();
		await page.setViewport({ width: 1366, height: 900 });
		await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
		await new Promise((resolveDelay) => setTimeout(resolveDelay, 1500));

		const scraped = await page.evaluate(() => {
			const clean = (value) => String(value || '').replace(/\s+/g, ' ').trim();
			const canonical =
				document.querySelector('link[rel="canonical"]')?.href || window.location.href || '';
			const pageTitle = clean(
				document.querySelector('h1')?.textContent ||
					document.querySelector('.book-title')?.textContent ||
					document.title
			);
			const description = clean(
				document.querySelector('meta[name="description"]')?.content ||
					document.querySelector('.book-description')?.textContent ||
					''
			);
			const image =
				document.querySelector('meta[property="og:image"]')?.content ||
				document.querySelector('img')?.src ||
				'';

			const candidates = [...document.querySelectorAll('a')]
				.map((a) => ({
					title: clean(a.textContent),
					sourceUrl: a.href || '',
					description: '',
					thumbnail: ''
				}))
				.filter((item) => item.title && item.sourceUrl.includes('/book/'))
				.slice(0, 5);

			if (canonical.includes('/book/') || pageTitle) {
				candidates.unshift({
					title: pageTitle,
					sourceUrl: canonical,
					description,
					thumbnail: image
				});
			}
			return candidates;
		});

		return scraped.filter((item) => item.title);
	} finally {
		await browser.close();
	}
}

function fallbackBook() {
	return {
		title: readEnv('NOOR_BOOK_TITLE') || DEFAULT_BOOK_TITLE,
		sourceUrl: readEnv('NOOR_BOOK_SOURCE_URL') || DEFAULT_BOOK_SEARCH_URL,
		description: 'استيراد مصنف آليًا ضمن إرشادات ومهارات تعليمية.',
		thumbnail: ''
	};
}

async function bookExists(db, book, path) {
	const snap = await db
		.collection(BOOKS_COLLECTION)
		.where(BOOK_NAME_FIELD, '==', book.title)
		.where(MAIN_FIELD, '==', path.main)
		.where(SUB_FIELD, '==', path.sub)
		.where(SUB_SUB_FIELD, '==', path.secondary)
		.limit(1)
		.get();
	return !snap.empty;
}

const BOOK_NAME_FIELD = 'bookName';
const BOOK_URL_FIELD = 'bookUrl';
const BOOK_CONTENT_TYPE_FIELD = 'contentType';
const BOOK_IS_YOUTUBE_FIELD = 'isYouTube';
const BOOK_IS_URL_CONTENT_FIELD = 'isUrlContent';
const BOOK_SOURCE_FIELD = 'source';

async function createBook(db, book, path) {
	await db.collection(BOOKS_COLLECTION).add({
		[BOOK_NAME_FIELD]: book.title,
		[BOOK_URL_FIELD]: book.sourceUrl || '',
		[BOOK_CONTENT_TYPE_FIELD]: 'book',
		[BOOK_IS_YOUTUBE_FIELD]: false,
		[BOOK_IS_URL_CONTENT_FIELD]: Boolean(book.sourceUrl),
		[BOOK_SOURCE_FIELD]: 'noor-library',
		[MAIN_FIELD]: path.main,
		[SUB_FIELD]: path.sub,
		[SUB_SUB_FIELD]: path.secondary,
		description: book.description || '',
		thumbnail: book.thumbnail || null,
		is_listed: true,
		order_index: 0,
		createdAt: FieldValue.serverTimestamp(),
		updatedAt: FieldValue.serverTimestamp()
	});
}

function writeReport(report) {
	mkdirSync(dirname(REPORT_PATH), { recursive: true });
	writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2) + '\n', 'utf8');
}

async function main() {
	loadEnvFile();

	const report = {
		startedAt: new Date().toISOString(),
		chromeExecutablePath: '',
		stealthMode: true,
		booksAdded: 0,
		booksSkipped: 0,
		newSections: [],
		items: [],
		warnings: []
	};

	const executablePath = assertChromeExecutable();
	report.chromeExecutablePath = executablePath;

	const targetUrl = readEnv('NOOR_BOOK_URL') || DEFAULT_BOOK_SEARCH_URL;
	let books = [];
	try {
		books = await scrapeNoorBooks(targetUrl, executablePath);
	} catch (err) {
		report.warnings.push(`Noor scrape failed, fallback metadata used: ${err?.message || err}`);
	}
	if (!books.length) books = [fallbackBook()];

	const db = initFirestore();
	const existingCategories = await fetchExistingCategories(db);

	for (const rawBook of books) {
		const book = {
			title: rawBook.title || fallbackBook().title,
			sourceUrl: rawBook.sourceUrl || targetUrl,
			description: rawBook.description || '',
			thumbnail: rawBook.thumbnail || ''
		};
		const path = classifyBook(book.title, book.description);
		const categoryId = await ensureSectionPath(db, path, existingCategories, report);

		if (await bookExists(db, book, path)) {
			report.booksSkipped += 1;
			report.items.push({ title: book.title, status: 'skipped_existing', path, categoryId });
			continue;
		}

		await createBook(db, book, path);
		report.booksAdded += 1;
		report.items.push({ title: book.title, status: 'added', path, categoryId });
	}

	report.finishedAt = new Date().toISOString();
	writeReport(report);
	console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
	loadEnvFile();
	let plannedPath = {
		main: 'التربية والتعليم',
		sub: 'التعليم والتدريس',
		secondary: 'إرشادات ومهارات تعليمية'
	};
	try {
		plannedPath = classifyBook(readEnv('NOOR_BOOK_TITLE') || DEFAULT_BOOK_TITLE);
	} catch {
		// Keep the conservative default path for error reports.
	}
	const report = {
		startedAt: new Date().toISOString(),
		finishedAt: new Date().toISOString(),
		chromeExecutablePath: readEnv('PUPPETEER_EXECUTABLE_PATH') || '',
		stealthMode: true,
		booksAdded: 0,
		booksSkipped: 0,
		newSections: [
			{
				level: 'main',
				path: plannedPath.main,
				order_index: DEFAULT_SECTION_STATE.order_index,
				is_listed: DEFAULT_SECTION_STATE.is_listed,
				thumbnail: DEFAULT_SECTION_STATE.thumbnail,
				status: 'pending_environment'
			},
			{
				level: 'sub',
				path: `${plannedPath.main} > ${plannedPath.sub}`,
				order_index: DEFAULT_SECTION_STATE.order_index,
				is_listed: DEFAULT_SECTION_STATE.is_listed,
				thumbnail: DEFAULT_SECTION_STATE.thumbnail,
				status: 'pending_environment'
			},
			{
				level: 'secondary',
				path: `${plannedPath.main} > ${plannedPath.sub} > ${plannedPath.secondary}`,
				order_index: DEFAULT_SECTION_STATE.order_index,
				is_listed: DEFAULT_SECTION_STATE.is_listed,
				thumbnail: DEFAULT_SECTION_STATE.thumbnail,
				status: 'pending_environment'
			}
		],
		items: [
			{
				title: readEnv('NOOR_BOOK_TITLE') || DEFAULT_BOOK_TITLE,
				status: 'pending_environment',
				path: plannedPath
			}
		],
		error: err?.message || String(err)
	};
	writeReport(report);
	console.error(report.error);
	process.exitCode = 1;
});
