/**
 * engine.js — المحرّك الذاتيّ لمكتبة مؤسسة هنداوي.
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  🔒 Nebras Only. كتب PDF حرّة الترخيص (CC) من هنداوي حصراً.       ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * يطابق معماريّة محرّكَيْ Internet Archive / مكتبة نور:
 *   • Singleton في globalThis + علامة enabled في RTDB.
 *   • كلّ tick: يكتشف صفحة فهرسة → يجلب PDF → يصنّف → يرفع → يسجّل.
 *   • على serverless الـ cron هو المُحرّك (runCronTick).
 *
 * مسارات RTDB:
 *   hindawi_library_engine/config  — { enabled, tickIntervalMs, batchSize, maxPagesPerCall }
 *   hindawi_library_engine/cursor  — { page }
 *   hindawi_library_engine/stats   — { totalFetched, sectionsCreated, lastRunAt, lastError, runsCount }
 *   hindawi_library_engine/log/{id}— آخر 60 إدخال
 *
 * يعيد استخدام المنطق العامّ لمحرّك نور (تصنيف/شجرة/إنشاء أقسام) لأنّه
 * مستقلّ عن المصدر.
 */

import {
	getAdminDatabase,
	getNebrasFirestoreAdmin,
	isAdminConfigured,
	sendTopicMessage
} from '$lib/server/firebaseAdmin.js';
import { adminFsBulkDeleteFileMirrorIds } from '$lib/server/nebrasUnifiedFirestoreAdmin.js';
import { NEBRAS_FS_UPLOADS, NEBRAS_FS_CONTENT_FILES } from '$lib/firebase/nebrasUnifiedPaths.js';
import { buildSectionsTree } from '../noorLibrary/sectionsTree.js';
import { classifyAutonomous } from '../noorLibrary/classifier.js';
import {
	createMainSectionAdmin,
	createSubSectionAdmin,
	createSecondarySectionAdmin
} from '../noorLibrary/sectionsCreator.js';
import { fetchBookMetadata, downloadBookFile } from './fetcher.js';
import { discoverNewBooks, MAX_LISTING_PAGES } from './crawler.js';
import { isBookImported, partitionKnownBooks, recordImported, recordFailure } from './registry.js';
import { adminUploadAndRegister } from './adminUploader.js';

const ENGINE_ROOT = 'hindawi_library_engine';
const CONFIG_PATH = `${ENGINE_ROOT}/config`;
const CURSOR_PATH = `${ENGINE_ROOT}/cursor`;
const STATS_PATH = `${ENGINE_ROOT}/stats`;
const LOG_PATH = `${ENGINE_ROOT}/log`;
const LOG_MAX_ENTRIES = 60;

const FAILURES_BEFORE_BACKOFF = 5;
const BACKOFF_MULTIPLIER = 3;
const MAX_BACKOFF_MS = 5 * 60 * 1000;

const DEFAULT_CONFIG = Object.freeze({
	enabled: true,
	tickIntervalMs: 8000,
	batchSize: 4,
	maxPagesPerCall: 3
});

const GLOBAL_KEY = '__NEBRAS_HINDAWI_ENGINE__';
function getGlobalState() {
	if (!globalThis[GLOBAL_KEY]) {
		globalThis[GLOBAL_KEY] = {
			running: false,
			currentTickInFlight: false,
			timer: null,
			lastTickStartedAt: null,
			lastTickEndedAt: null,
			autoBootAttempted: false
		};
	}
	return globalThis[GLOBAL_KEY];
}

// ── RTDB helpers ─────────────────────────────────────────────────────
async function readConfig() {
	const snap = await getAdminDatabase().ref(CONFIG_PATH).get();
	if (!snap.exists()) return { ...DEFAULT_CONFIG };
	const v = snap.val() || {};
	return {
		enabled: v.enabled === undefined ? true : Boolean(v.enabled),
		tickIntervalMs: Math.max(2000, Number(v.tickIntervalMs) || DEFAULT_CONFIG.tickIntervalMs),
		batchSize: Math.max(1, Math.min(20, Number(v.batchSize) || DEFAULT_CONFIG.batchSize)),
		maxPagesPerCall: Math.max(1, Math.min(15, Number(v.maxPagesPerCall) || DEFAULT_CONFIG.maxPagesPerCall))
	};
}

async function writeConfig(patch) {
	const current = await readConfig();
	await getAdminDatabase().ref(CONFIG_PATH).set({ ...current, ...patch });
	return { ...current, ...patch };
}

async function readCursor() {
	const snap = await getAdminDatabase().ref(CURSOR_PATH).get();
	if (!snap.exists()) return { page: 1 };
	return { page: Math.max(1, Number(snap.val()?.page) || 1) };
}

async function writeCursor(cursor) {
	await getAdminDatabase().ref(CURSOR_PATH).set({
		page: Math.max(1, Number(cursor.page) || 1),
		updatedAt: { '.sv': 'timestamp' }
	});
}

async function readStats() {
	const snap = await getAdminDatabase().ref(STATS_PATH).get();
	const v = snap.exists() ? snap.val() || {} : {};
	return {
		totalFetched: Number(v.totalFetched) || 0,
		sectionsCreated: Number(v.sectionsCreated) || 0,
		lastRunAt: v.lastRunAt || null,
		lastError: v.lastError || null,
		runsCount: Number(v.runsCount) || 0,
		consecutiveEmptyRuns: Number(v.consecutiveEmptyRuns) || 0
	};
}

async function bumpStats(patch) {
	const ref = getAdminDatabase().ref(STATS_PATH);
	await ref.transaction((current) => {
		const c = current || {};
		return {
			totalFetched: Number(c.totalFetched ?? 0) + Number(patch.totalFetchedDelta ?? 0),
			sectionsCreated: Number(c.sectionsCreated ?? 0) + Number(patch.sectionsCreatedDelta ?? 0),
			runsCount: Number(c.runsCount ?? 0) + Number(patch.runsDelta ?? 0),
			lastRunAt: patch.touchLastRun ? Date.now() : (c.lastRunAt ?? null),
			lastError: patch.lastError !== undefined ? (patch.lastError ?? null) : (c.lastError ?? null),
			consecutiveEmptyRuns: Number(c.consecutiveEmptyRuns ?? 0)
		};
	});
}

async function appendLog(entry) {
	const db = getAdminDatabase();
	const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
	await db.ref(`${LOG_PATH}/${id}`).set({ ...entry, ts: Date.now() });
	const all = await db.ref(LOG_PATH).orderByChild('ts').get().catch(() => null);
	if (!all || !all.exists()) return;
	const entries = Object.entries(all.val() || {}).sort(
		(a, b) => Number(b[1]?.ts || 0) - Number(a[1]?.ts || 0)
	);
	if (entries.length > LOG_MAX_ENTRIES) {
		const updates = {};
		for (const [k] of entries.slice(LOG_MAX_ENTRIES)) updates[`${LOG_PATH}/${k}`] = null;
		await db.ref().update(updates);
	}
}

async function readLog(limit = 30) {
	const snap = await getAdminDatabase()
		.ref(LOG_PATH)
		.orderByChild('ts')
		.limitToLast(Math.max(1, Math.min(LOG_MAX_ENTRIES, Number(limit) || 30)))
		.get();
	if (!snap.exists()) return [];
	return Object.entries(snap.val() || {})
		.map(([id, v]) => ({ id, ...(v || {}) }))
		.sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
}

// ── FCM ──────────────────────────────────────────────────────────────
const FCM_DEFAULT_TOPIC = 'nebras_all_users';
function fcmTopic() {
	return String(process?.env?.FCM_BROADCAST_TOPIC || '').trim() || FCM_DEFAULT_TOPIC;
}
function idToString(value) {
	return value === null || value === undefined ? '' : String(value).trim();
}
async function notifyFcmContentAdded(info) {
	if (!isAdminConfigured()) return;
	const chain = [info?.mainSectionName, info?.subSectionName, info?.secondarySectionName]
		.map((s) => (s || '').trim())
		.filter(Boolean);
	try {
		await sendTopicMessage({
			topic: fcmTopic(),
			title: 'محتوى جديد في نبراس',
			body: `تمت إضافة "${(info?.title || '').trim()}"${chain.length ? ` في ${chain.join(' › ')}` : ''}`,
			data: {
				type: 'content_added',
				source: 'hindawi_library_engine',
				contentType: 'document',
				contentId: idToString(info?.contentId),
				mainSectionId: idToString(info?.mainSectionId),
				subSectionId: idToString(info?.subSectionId),
				secondarySectionId: idToString(info?.secondarySectionId),
				mainSectionName: info?.mainSectionName || '',
				subSectionName: info?.subSectionName || '',
				secondarySectionName: info?.secondarySectionName || '',
				sourceUrl: info?.sourceUrl || ''
			}
		});
	} catch (err) {
		await appendLog({
			level: 'warn',
			message: `إشعار FCM فشل: ${err?.message || String(err)}`,
			reason: 'fcm_send_failed'
		}).catch(() => {});
	}
}

// ── Core: process one book ───────────────────────────────────────────
async function processBook({ url, bookId, sections }) {
	// 1) metadata (PDF url مضمون البناء من المعرّف)
	const meta = await fetchBookMetadata(url);
	if (!meta.fileUrl) {
		throw Object.assign(new Error(`لا رابط PDF لـ "${meta.title || bookId}".`), {
			reason: 'no_file_url',
			status: 422
		});
	}

	// 2) تنزيل الـ PDF فعلياً قبل أيّ كتابة (مع تحقّق magic bytes داخل الجالب)
	const downloaded = await downloadBookFile(meta.fileUrl, {
		refererUrl: meta.source?.url || url
	});
	if (!downloaded?.buffer || downloaded.buffer.byteLength === 0) {
		throw Object.assign(new Error('PDF فارغ.'), { reason: 'empty_download', status: 422 });
	}

	// 3) تصنيف محليّ
	const decision = await classifyAutonomous(sections, meta);

	let mainId = decision.mainId;
	let subId = decision.subId || null;
	let secondaryId = decision.secondaryId || null;
	const createdSectionsIds = [];
	let sectionsCreatedDelta = 0;

	if (decision.kind === 'create_main') {
		const createdMain = await createMainSectionAdmin(decision.newMainName);
		mainId = String(createdMain.id);
		if (!createdMain.alreadyExisted) {
			createdSectionsIds.push(mainId);
			sectionsCreatedDelta += 1;
			await bumpStats({ sectionsCreatedDelta: 1 }).catch(() => {});
		}
		const createdSub = await createSubSectionAdmin(mainId, decision.newSubName);
		subId = String(createdSub.id);
		if (!createdSub.alreadyExisted) {
			createdSectionsIds.push(subId);
			sectionsCreatedDelta += 1;
			await bumpStats({ sectionsCreatedDelta: 1 }).catch(() => {});
		}
	} else if (decision.kind === 'create_sub') {
		const created = await createSubSectionAdmin(mainId, decision.newSubName);
		subId = String(created.id);
		if (!created.alreadyExisted) {
			createdSectionsIds.push(subId);
			sectionsCreatedDelta += 1;
			await bumpStats({ sectionsCreatedDelta: 1 }).catch(() => {});
		}
	} else if (decision.kind === 'create_secondary') {
		subId = decision.subId;
		const created = await createSecondarySectionAdmin(subId, decision.newSecondaryName);
		secondaryId = String(created.id);
		if (!created.alreadyExisted) {
			createdSectionsIds.push(secondaryId);
			sectionsCreatedDelta += 1;
			await bumpStats({ sectionsCreatedDelta: 1 }).catch(() => {});
		}
	}

	// إن لم يُرجع المصنّف قسماً فرعياً صالحاً (مثلاً القسم الرئيسيّ الأوّل بلا
	// أقسام فرعيّة)، ننشئ بنية منظّمة لهنداوي تلقائياً بدل رفض الكتاب:
	//   رئيسيّ «مؤسسة هنداوي» → فرعيّ حسب تصنيف الكتاب (categoryHints) أو «كتب عامة».
	if (!subId) {
		const createdMain = await createMainSectionAdmin('مؤسسة هنداوي');
		mainId = String(createdMain.id);
		if (!createdMain.alreadyExisted) {
			createdSectionsIds.push(mainId);
			sectionsCreatedDelta += 1;
			await bumpStats({ sectionsCreatedDelta: 1 }).catch(() => {});
		}
		const hint = Array.isArray(meta.categoryHints) ? (meta.categoryHints[0] || '') : '';
		const subName = String(hint || '').trim().slice(0, 60) || 'كتب عامة';
		const createdSub = await createSubSectionAdmin(mainId, subName);
		subId = String(createdSub.id);
		if (!createdSub.alreadyExisted) {
			createdSectionsIds.push(subId);
			sectionsCreatedDelta += 1;
			await bumpStats({ sectionsCreatedDelta: 1 }).catch(() => {});
		}
	}

	const refreshed = await buildSectionsTree();
	const main = refreshed.index.mainsById[mainId];
	const sub = refreshed.index.subsById[subId];
	const secondary = secondaryId ? refreshed.index.secondariesById[secondaryId] : null;
	if (!main || !sub) {
		throw Object.assign(new Error('main أو sub لم يُعثر عليه بعد التصنيف.'), {
			reason: 'hierarchy_resolution_failed',
			status: 500
		});
	}

	const finalMetadata = {
		title: String(meta.title || '').trim(),
		description: String(meta.description || '').trim(),
		author: String(meta.author || '').trim(),
		thumbnail: meta.thumbnail || null,
		is_listed: true,
		content_type: 'document',
		main_section: String(main.id),
		main_section_id: String(main.id),
		main_section_name: String(main.name || ''),
		subsection: String(sub.id),
		subsection_name: String(sub.name || ''),
		...(secondary
			? {
					secondary_subsection: String(secondary.id),
					secondary_subsection_name: String(secondary.name || '')
				}
			: { secondary_subsection: null })
	};

	const result = await adminUploadAndRegister({
		buffer: downloaded.buffer,
		contentType: downloaded.contentType,
		filename: downloaded.filename,
		thumbnailUrl: meta.thumbnail || null,
		metadata: finalMetadata,
		uploader: { uid: 'hindawi_library_engine', email: 'engine@nebras.local' },
		source: {
			provider: 'hindawi',
			url: meta.source?.url || url,
			bookId: meta.source?.bookId || bookId,
			license: 'creative_commons'
		}
	});

	await recordImported(bookId, {
		fileId: result.fileId,
		title: meta.title,
		url: meta.source?.url || url,
		hierarchy: {
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: secondary ? String(secondary.id) : null
		},
		createdSectionsIds
	});

	await notifyFcmContentAdded({
		title: meta.title,
		contentId: result.fileId,
		mainSectionId: main.id,
		subSectionId: sub.id,
		secondarySectionId: secondary?.id || '',
		mainSectionName: main.name,
		subSectionName: sub.name,
		secondarySectionName: secondary?.name || '',
		sourceUrl: meta.source?.url || url
	});

	return {
		fileId: result.fileId,
		title: meta.title,
		hierarchy: {
			main: { id: String(main.id), name: main.name },
			sub: { id: String(sub.id), name: sub.name },
			secondary: secondary ? { id: String(secondary.id), name: secondary.name } : null
		},
		createdSectionsIds,
		sectionsCreatedDelta
	};
}

// ── Tick ─────────────────────────────────────────────────────────────
export async function runEngineTick() {
	const cfg = await readConfig();
	let cursor = await readCursor();
	if (cursor.page > MAX_LISTING_PAGES) cursor = { page: 1 };

	let knownIds;
	try {
		knownIds = (await partitionKnownBooks([])).knownIds;
	} catch {
		knownIds = new Set();
	}

	const discovery = await discoverNewBooks({
		startPage: cursor.page,
		batchSize: cfg.batchSize,
		maxPagesPerCall: cfg.maxPagesPerCall,
		knownIds
	});

	if (discovery.newBooks.length === 0 || discovery.exhausted) {
		const nextPage = discovery.exhausted ? 1 : (discovery.nextPage || cursor.page + 1);
		await writeCursor({ page: nextPage });
		await appendLog({
			level: 'info',
			message: discovery.exhausted
				? 'استُنفدت صفحات الفهرسة — العودة إلى الصفحة 1.'
				: `لا كتب جديدة في الصفحة ${cursor.page} — التقدّم.`,
			page: nextPage
		});
		return { processed: 0, created: 0, skipped: 0, failed: 0, cursor: { page: nextPage }, sample: [] };
	}

	let sections;
	try {
		sections = await buildSectionsTree();
	} catch (err) {
		await bumpStats({ touchLastRun: true, lastError: `sections_read_failed: ${err?.message}` });
		throw err;
	}

	const sample = [];
	let processed = 0;
	let createdSectionsTotal = 0;
	let skipped = 0;
	let failed = 0;

	for (const link of discovery.newBooks) {
		if (await isBookImported(link.bookId).catch(() => false)) {
			skipped += 1;
			sample.push({ title: link.bookId, url: link.url, status: 'skip' });
			continue;
		}
		try {
			const r = await processBook({ url: link.url, bookId: link.bookId, sections });
			processed += 1;
			createdSectionsTotal += r.sectionsCreatedDelta;
			sample.push({ fileId: r.fileId, title: r.title, url: link.url, status: 'ok', hierarchy: r.hierarchy });
			await appendLog({
				level: 'success',
				message: `جُلِب: ${r.title} → ${r.hierarchy.main.name} › ${r.hierarchy.sub.name}`,
				url: link.url,
				bookId: link.bookId,
				fileId: r.fileId
			});
		} catch (err) {
			failed += 1;
			const reason = err?.reason || 'unknown';
			sample.push({ title: link.bookId, url: link.url, status: 'fail', error: err?.message || String(err) });
			await recordFailure(link.bookId, { reason, message: err?.message || String(err), url: link.url }).catch(() => {});
			await appendLog({ level: 'error', message: err?.message || String(err), url: link.url, bookId: link.bookId, reason });
		}
	}

	const nextPage = discovery.nextPage || cursor.page + 1;
	await writeCursor({ page: nextPage > MAX_LISTING_PAGES ? 1 : nextPage });

	await bumpStats({
		totalFetchedDelta: processed,
		runsDelta: 1,
		touchLastRun: true,
		lastError: failed > 0 ? `${failed} كتاب فشل في هذه الدورة.` : null
	});

	const stats = await readStats().catch(() => null);
	if (stats && processed === 0) {
		await getAdminDatabase()
			.ref(`${STATS_PATH}/consecutiveEmptyRuns`)
			.set(Number(stats.consecutiveEmptyRuns || 0) + 1)
			.catch(() => {});
	} else if (processed > 0) {
		await getAdminDatabase().ref(`${STATS_PATH}/consecutiveEmptyRuns`).set(0).catch(() => {});
	}

	return { processed, created: createdSectionsTotal, skipped, failed, cursor: { page: nextPage }, sample };
}

/** نقطة دخول Cron — تحترم إيقاف المستخدم الصريح. */
export async function runCronTick() {
	const snap = await getAdminDatabase().ref(`${CONFIG_PATH}/enabled`).get().catch(() => null);
	const explicitlyDisabled = snap && snap.exists() && snap.val() === false;
	if (explicitlyDisabled) return { ok: true, skipped: true, reason: 'engine_stopped_by_user' };
	if (!snap || !snap.exists()) await writeConfig({ enabled: true });
	try {
		const result = await runEngineTick();
		return { ok: true, cron: true, ...result };
	} catch (err) {
		await bumpStats({ lastError: err?.message || String(err), touchLastRun: true }).catch(() => {});
		await appendLog({ level: 'error', message: `cron tick فشل: ${err?.message || String(err)}`, reason: err?.reason || 'cron_tick_failed' }).catch(() => {});
		return { ok: false, error: 'tick_failed', reason: err?.reason || 'unknown', message: err?.message || String(err) };
	}
}

// ── Background loop ──────────────────────────────────────────────────
async function tickLoop() {
	const state = getGlobalState();
	if (!state.running || state.currentTickInFlight) return;
	state.currentTickInFlight = true;
	state.lastTickStartedAt = Date.now();
	try {
		const cfg = await readConfig();
		if (!cfg.enabled) {
			state.running = false;
			if (state.timer) { clearTimeout(state.timer); state.timer = null; }
			await appendLog({ level: 'info', message: 'إيقاف المحرّك (enabled=false).' });
			return;
		}
		await runEngineTick();
	} catch (err) {
		await appendLog({ level: 'error', message: `tick فشل: ${err?.message || String(err)}`, reason: err?.reason || 'tick_failed' }).catch(() => {});
		await bumpStats({ lastError: err?.message || String(err), touchLastRun: true }).catch(() => {});
	} finally {
		state.currentTickInFlight = false;
		state.lastTickEndedAt = Date.now();
		if (state.running) {
			const cfg = await readConfig().catch(() => DEFAULT_CONFIG);
			const stats = await readStats().catch(() => null);
			let nextDelay = cfg.tickIntervalMs;
			if (Number(stats?.consecutiveEmptyRuns || 0) >= FAILURES_BEFORE_BACKOFF) {
				nextDelay = Math.min(cfg.tickIntervalMs * BACKOFF_MULTIPLIER, MAX_BACKOFF_MS);
			}
			state.timer = setTimeout(() => { tickLoop().catch(() => {}); }, nextDelay);
		}
	}
}

export async function startEngine() {
	const state = getGlobalState();
	const cfg = await writeConfig({ enabled: true });
	if (state.running) {
		await appendLog({ level: 'info', message: 'المحرّك يعمل بالفعل.' });
		return { running: true, alreadyRunning: true, config: cfg };
	}
	state.running = true;
	await appendLog({ level: 'info', message: 'بدء محرّك هنداوي.' });
	state.timer = setTimeout(() => { tickLoop().catch(() => {}); }, 100);
	return { running: true, alreadyRunning: false, config: cfg };
}

export async function stopEngine() {
	const state = getGlobalState();
	state.running = false;
	if (state.timer) { clearTimeout(state.timer); state.timer = null; }
	const cfg = await writeConfig({ enabled: false });
	await appendLog({ level: 'info', message: 'إيقاف المحرّك بطلب صريح.' });
	return { running: false, config: cfg };
}

export async function autoBootIfNeeded() {
	const state = getGlobalState();
	if (state.autoBootAttempted) return;
	state.autoBootAttempted = true;
	const cfg = await readConfig();
	if (cfg.enabled && !state.running) {
		state.running = true;
		await appendLog({ level: 'info', message: 'إعادة تشغيل تلقائي بعد إقلاع الخادم.' });
		state.timer = setTimeout(() => { tickLoop().catch(() => {}); }, 500);
	}
}

export async function resetCursor() {
	await writeCursor({ page: 1 });
	await appendLog({ level: 'info', message: 'إعادة المؤشّر إلى الصفحة 1.' });
	return { page: 1 };
}

/**
 * Factory reset لمحتوى هنداوي فقط: يحذف كلّ سجلّ بعلامة __provider==='hindawi'
 * + يمسح registry/cursor. لا يلمس الأقسام (taxonomy مشتركة) ولا محتوى مصادر أخرى.
 */
export async function factoryReset() {
	const db = getAdminDatabase();
	const fs = getNebrasFirestoreAdmin();
	try { await stopEngine(); } catch { /* ignore */ }

	const [uploadsSnap, contentFilesSnap] = await Promise.all([
		fs.collection(NEBRAS_FS_UPLOADS).get(),
		fs.collection(NEBRAS_FS_CONTENT_FILES).get()
	]);

	const fileIds = new Set();
	let uploads = 0;
	let contentFiles = 0;
	if (!uploadsSnap.empty) {
		for (const d of uploadsSnap.docs) {
			if (d.data()?.__provider === 'hindawi') { fileIds.add(d.id); uploads += 1; }
		}
	}
	if (!contentFilesSnap.empty) {
		for (const d of contentFilesSnap.docs) {
			if (d.data()?.__provider === 'hindawi') { fileIds.add(d.id); contentFiles += 1; }
		}
	}

	await db.ref().update({
		hindawi_library_registry: null,
		hindawi_library_failures: null,
		[`${ENGINE_ROOT}/cursor`]: null,
		[`${ENGINE_ROOT}/stats`]: {
			totalFetched: 0,
			sectionsCreated: 0,
			runsCount: 0,
			lastRunAt: null,
			lastError: 'factory_reset',
			consecutiveEmptyRuns: 0
		}
	});
	await adminFsBulkDeleteFileMirrorIds([...fileIds]);
	await appendLog({ level: 'warn', message: `إعادة ضبط: حُذف ${uploads + contentFiles} كتاب هنداوي.`, reason: 'factory_reset' }).catch(() => {});
	return { ok: true, cleared: { uploads, content_files: contentFiles } };
}

export async function getEngineStatus({ logLimit = 30 } = {}) {
	await autoBootIfNeeded();
	const state = getGlobalState();
	const [cfg, cursor, stats, log] = await Promise.all([readConfig(), readCursor(), readStats(), readLog(logLimit)]);
	return {
		processRunning: state.running,
		currentTickInFlight: state.currentTickInFlight,
		lastTickStartedAt: state.lastTickStartedAt,
		lastTickEndedAt: state.lastTickEndedAt,
		config: cfg,
		cursor,
		stats,
		log
	};
}
