/**
 * engine.js — محرّك Internet Archive لنبراس.
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  المبدأ الذهبي:                                                  ║
 * ║    • لا اتصال مباشر من التطبيق بـ archive.org.                    ║
 * ║    • لا أزرار ولا تبويبات تفصح عن المصدر.                          ║
 * ║    • لا يدخل أيّ ملفّ التطبيق ما لم يكن:                          ║
 * ║        (1) مرخّصاً للنشر (licenseFilter).                          ║
 * ║        (2) قابلاً للتشغيل فعلاً (playabilityFilter).                ║
 * ║        (3) منزَّلاً بالكامل ومُتحقَّقاً من سلامة بايتاته.            ║
 * ║    • كلّ تصنيف/بذرة (seed) يجلب نتائجه **كاملةً** عبر cursor       ║
 * ║      Scraping API حتى نفاد النتائج، ثم ينتقل إلى البذرة التالية.   ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * مسارات RTDB:
 *   ia_library_engine/config    — { enabled, seeds[], tickIntervalMs,
 *                                   batchSize, defaultHierarchy{},
 *                                   trustedCollections[],
 *                                   allowMissingLicenseInTrustedCollections }
 *   ia_library_engine/cursor    — { seedIndex, scrapeCursor }
 *   ia_library_engine/stats     — { totalImported, totalSkipped, totalFailed,
 *                                   lastRunAt, lastError, runsCount,
 *                                   consecutiveEmptyRuns }
 *   ia_library_engine/log/{ts}  — آخر 60 إدخال
 *
 * ملاحظة Vercel: الحلقة الداخليّة لا تستمرّ على serverless — Cron خارجي
 * يستدعي POST /api/admin/internet-archive/engine/tick كلّ X دقيقة.
 */

import {
	getAdminDatabase,
	getNebrasFirestoreAdmin,
	isAdminConfigured,
	sendTopicMessage
} from '$lib/server/firebaseAdmin.js';
import {
	adminFsBulkDeleteFileMirrorIds
} from '$lib/server/nebrasUnifiedFirestoreAdmin.js';
import {
	NEBRAS_FS_UPLOADS,
	NEBRAS_FS_CONTENT_FILES
} from '$lib/firebase/nebrasUnifiedPaths.js';
import {
	buildSectionsTree,
	validateHierarchyPath
} from '$lib/server/noorLibrary/sectionsTree.js';

import { scrapeOnePage, buildLuceneQuery } from './search.js';
import { previewItem } from './fetcher.js';
import { downloadIaFile } from './downloader.js';
import { adminUploadAndRegister } from './adminUploader.js';
import {
	isItemImported,
	partitionKnownItems,
	recordImported,
	recordFailure
} from './registry.js';

const ENGINE_ROOT = 'ia_library_engine';
const CONFIG_PATH = `${ENGINE_ROOT}/config`;
const CURSOR_PATH = `${ENGINE_ROOT}/cursor`;
const STATS_PATH = `${ENGINE_ROOT}/stats`;
const LOG_PATH = `${ENGINE_ROOT}/log`;
const LOG_MAX_ENTRIES = 60;

/**
 * @typedef {Object} IaSeed
 * @property {string} id  معرّف ثابت للبذرة (للـ cursor)
 * @property {string} label  اسم عربي للعرض
 * @property {string} [q]  استعلام حرّ
 * @property {Array<'document'|'audio'|'video'>} [nebrasTypes]
 * @property {string[]} [languages]
 * @property {string[]} [collections]
 * @property {string[]} [creators]
 * @property {{
 *   mainId: string,
 *   mainName?: string,
 *   subId: string,
 *   subName?: string,
 *   secondaryId?: string|null,
 *   secondaryName?: string|null
 * }} hierarchy  هدف التصنيف الإجباري (يدوي — لا تصنيف آلي في النسخة الأولى)
 */

/**
 * @typedef {Object} IaEngineConfig
 * @property {boolean} enabled
 * @property {IaSeed[]} seeds
 * @property {number} tickIntervalMs
 * @property {number} batchSize  عدد العناصر المعالَجة في كلّ tick
 * @property {number} scrapeCount  عدد العناصر المطلوبة من Scraping API لكلّ نداء
 * @property {string[]} trustedCollections
 * @property {boolean} allowMissingLicenseInTrustedCollections
 */

const DEFAULT_CONFIG = Object.freeze({
	enabled: false,
	seeds: [],
	tickIntervalMs: 12000,
	batchSize: 2,
	scrapeCount: 100,
	trustedCollections: [],
	allowMissingLicenseInTrustedCollections: false
});

// ── State (singleton in Node process, تجاوز HMR في dev) ─────────────
const GLOBAL_KEY = '__NEBRAS_IA_ENGINE__';
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

// ── RTDB helpers ────────────────────────────────────────────────────
function isValidSeed(seed) {
	if (!seed || typeof seed !== 'object') return false;
	if (!String(seed.id || '').trim()) return false;
	if (!seed.hierarchy?.mainId || !seed.hierarchy?.subId) return false;
	const types = Array.isArray(seed.nebrasTypes) ? seed.nebrasTypes : [];
	for (const t of types) {
		if (t !== 'document' && t !== 'audio' && t !== 'video') return false;
	}
	if (!String(seed.q || '').trim() && types.length === 0 && (!seed.collections || seed.collections.length === 0)) {
		return false; // بذرة بلا أي تضييق = خطر
	}
	return true;
}

async function readConfig() {
	const snap = await getAdminDatabase().ref(CONFIG_PATH).get();
	if (!snap.exists()) return { ...DEFAULT_CONFIG };
	const v = snap.val() || {};
	const seeds = Array.isArray(v.seeds) ? v.seeds.filter(isValidSeed) : [];
	return {
		enabled: Boolean(v.enabled),
		seeds,
		tickIntervalMs: Math.max(3000, Number(v.tickIntervalMs) || DEFAULT_CONFIG.tickIntervalMs),
		batchSize: Math.max(1, Math.min(10, Number(v.batchSize) || DEFAULT_CONFIG.batchSize)),
		scrapeCount: Math.max(10, Math.min(1000, Number(v.scrapeCount) || DEFAULT_CONFIG.scrapeCount)),
		trustedCollections: Array.isArray(v.trustedCollections) ? v.trustedCollections : [],
		allowMissingLicenseInTrustedCollections: Boolean(
			v.allowMissingLicenseInTrustedCollections
		)
	};
}

async function writeConfig(patch) {
	const current = await readConfig();
	const next = { ...current, ...patch };
	if (Array.isArray(patch.seeds)) {
		next.seeds = patch.seeds.filter(isValidSeed);
	}
	await getAdminDatabase().ref(CONFIG_PATH).set(next);
	return next;
}

async function readCursor() {
	const snap = await getAdminDatabase().ref(CURSOR_PATH).get();
	if (!snap.exists()) return { seedIndex: 0, scrapeCursor: null };
	const v = snap.val() || {};
	return {
		seedIndex: Math.max(0, Number(v.seedIndex) || 0),
		scrapeCursor: typeof v.scrapeCursor === 'string' && v.scrapeCursor ? v.scrapeCursor : null
	};
}

async function writeCursor(cursor) {
	await getAdminDatabase()
		.ref(CURSOR_PATH)
		.set({
			seedIndex: cursor.seedIndex,
			scrapeCursor: cursor.scrapeCursor || null,
			updatedAt: { '.sv': 'timestamp' }
		});
}

async function readStats() {
	const snap = await getAdminDatabase().ref(STATS_PATH).get();
	if (!snap.exists()) {
		return {
			totalImported: 0,
			totalSkipped: 0,
			totalFailed: 0,
			lastRunAt: null,
			lastError: null,
			runsCount: 0,
			consecutiveEmptyRuns: 0
		};
	}
	const v = snap.val() || {};
	return {
		totalImported: Number(v.totalImported) || 0,
		totalSkipped: Number(v.totalSkipped) || 0,
		totalFailed: Number(v.totalFailed) || 0,
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
			totalImported: Number(c.totalImported ?? 0) + Number(patch.importedDelta ?? 0),
			totalSkipped: Number(c.totalSkipped ?? 0) + Number(patch.skippedDelta ?? 0),
			totalFailed: Number(c.totalFailed ?? 0) + Number(patch.failedDelta ?? 0),
			runsCount: Number(c.runsCount ?? 0) + Number(patch.runsDelta ?? 0),
			lastRunAt: patch.touchLastRun ? Date.now() : (c.lastRunAt ?? null),
			lastError:
				patch.lastError !== undefined ? (patch.lastError ?? null) : (c.lastError ?? null),
			consecutiveEmptyRuns: Number(c.consecutiveEmptyRuns ?? 0)
		};
	});
}

async function appendLog(entry) {
	const db = getAdminDatabase();
	const id = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
	await db.ref(`${LOG_PATH}/${id}`).set({ ...entry, ts: Date.now() });
	// تنظيف ذاتي
	const all = await db
		.ref(LOG_PATH)
		.orderByChild('ts')
		.get()
		.catch(() => null);
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

// ── FCM ─────────────────────────────────────────────────────────────
const FCM_DEFAULT_TOPIC = 'nebras_all_users';
function fcmTopic() {
	return String(process?.env?.FCM_BROADCAST_TOPIC || '').trim() || FCM_DEFAULT_TOPIC;
}
function idToString(value) {
	return value === null || value === undefined ? '' : String(value).trim();
}

async function notifyFcmContentAdded(info) {
	if (!isAdminConfigured()) return;
	const title = 'محتوى جديد في نبراس';
	const chain = [info?.mainSectionName, info?.subSectionName, info?.secondarySectionName]
		.map((s) => (s || '').trim())
		.filter(Boolean);
	const body = `تمت إضافة "${(info?.title || '').trim()}"${chain.length ? ` في ${chain.join(' › ')}` : ''}`;
	try {
		await sendTopicMessage({
			topic: fcmTopic(),
			title,
			body,
			data: {
				type: 'content_added',
				// نُبقي source محايداً — لا تذكر "internet archive" حتى في الـ FCM payload
				// كي لا يظهر للمستخدم أيّ أثر على المصدر.
				source: 'nebras_dashboard',
				contentType: info?.contentType || 'document',
				contentId: idToString(info?.contentId),
				mainSectionId: idToString(info?.mainSectionId),
				subSectionId: idToString(info?.subSectionId),
				secondarySectionId: idToString(info?.secondarySectionId),
				mainSectionName: info?.mainSectionName || '',
				subSectionName: info?.subSectionName || '',
				secondarySectionName: info?.secondarySectionName || '',
				sourceUrl: ''
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

// ── Core: import one IA item end-to-end ─────────────────────────────

/**
 * يُنفّذ الدورة الكاملة لعنصر IA واحد. الترتيب صارم — لا كتابة في DB
 * إلا بعد التحقّق من كلّ شيء ونجاح التنزيل.
 *
 * @param {string} identifier
 * @param {IaSeed} seed
 * @param {IaEngineConfig} cfg
 * @returns {Promise<{
 *   fileId: string,
 *   title: string,
 *   nebrasContentType: 'document'|'audio'|'video',
 *   hierarchy: { main:{id:string,name:string}, sub:{id:string,name:string}, secondary:{id:string,name:string}|null }
 * }>}
 */
export async function importItem(identifier, seed, cfg) {
	if (!seed || !seed.hierarchy?.mainId || !seed.hierarchy?.subId) {
		throw Object.assign(new Error('seed.hierarchy غير صالح.'), {
			reason: 'invalid_hierarchy',
			status: 400
		});
	}

	// 1) قراءة شجرة الأقسام والتحقّق من الهيكلية. نستخدم نفس validator
	//    الذي تستعمله noorLibrary لضمان توافق الكتابة.
	const sections = await buildSectionsTree();
	const validated = validateHierarchyPath(
		{
			mainId: seed.hierarchy.mainId,
			subId: seed.hierarchy.subId,
			secondaryId: seed.hierarchy.secondaryId || null
		},
		sections.index
	);
	if (!validated.valid) {
		throw Object.assign(new Error(`hierarchy غير صالحة: ${validated.reason}`), {
			reason: validated.reason,
			status: 400
		});
	}
	const main = validated.resolved.main;
	const sub = validated.resolved.sub;
	const secondary = validated.resolved.secondary;

	// 2) preview — يفحص الترخيص ويختار أفضل ملف قابل للتشغيل.
	const preview = await previewItem(identifier, {
		trustedCollections: cfg.trustedCollections,
		allowMissingLicenseInTrustedCollections: cfg.allowMissingLicenseInTrustedCollections
	});

	// 3) تنزيل الملفّ كـ Buffer مع تحقّق magic bytes ومقاس.
	const downloaded = await downloadIaFile(preview.pickedFile.downloadUrl, {
		declaredType: preview.nebrasContentType
	});

	// 4) رفع وكتابة Firestore (مرآة مزدوجة).
	const result = await adminUploadAndRegister({
		buffer: downloaded.buffer,
		contentType: downloaded.contentType,
		filename: preview.pickedFile.name,
		nebrasContentType: preview.nebrasContentType,
		thumbnailUrl: preview.thumbnailUrl,
		metadata: {
			title: preview.title,
			description: preview.description,
			author: preview.author,
			is_listed: true,
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
		},
		uploader: { uid: 'ia_library_engine', email: 'engine@nebras.local' },
		iaInfo: {
			identifier: preview.identifier,
			iaSourceUrl: preview.iaSourceUrl,
			license: preview.licenseInfo.licenseMatched || '',
			collection: preview.licenseInfo.collection || ''
		}
	});

	// 5) سجّل في registry لمنع التكرار.
	await recordImported(identifier, {
		fileId: result.fileId,
		title: preview.title,
		iaSourceUrl: preview.iaSourceUrl,
		licenseMatched: preview.licenseInfo.licenseMatched || '',
		collection: preview.licenseInfo.collection || '',
		hierarchy: {
			mainId: String(main.id),
			subId: String(sub.id),
			secondaryId: secondary ? String(secondary.id) : null
		},
		pickedFileName: preview.pickedFile.name,
		pickedFileSize: preview.pickedFile.size,
		nebrasContentType: preview.nebrasContentType
	});

	// 6) إشعار FCM (محايد المصدر — تماماً كاليدوي).
	await notifyFcmContentAdded({
		title: preview.title,
		contentType: preview.nebrasContentType,
		contentId: result.fileId,
		mainSectionId: main.id,
		subSectionId: sub.id,
		secondarySectionId: secondary?.id || '',
		mainSectionName: main.name,
		subSectionName: sub.name,
		secondarySectionName: secondary?.name || ''
	});

	return {
		fileId: result.fileId,
		title: preview.title,
		nebrasContentType: preview.nebrasContentType,
		hierarchy: {
			main: { id: String(main.id), name: String(main.name) },
			sub: { id: String(sub.id), name: String(sub.name) },
			secondary: secondary
				? { id: String(secondary.id), name: String(secondary.name) }
				: null
		}
	};
}

// ── Tick: one batch on the current seed ─────────────────────────────

/**
 * يُنفّذ دورة واحدة. يضمن "كلّ تصنيف يجلب محتواه بالكامل" بأنّه:
 *   - يستمرّ على نفس البذرة حتى يستنفد كلّ نتائج Scraping API (scrapeCursor = null)
 *   - لا ينتقل للبذرة التاليّة قبل ذلك
 *
 * @returns {Promise<{
 *   processed:number, skipped:number, failed:number,
 *   advancedToNextSeed:boolean,
 *   cursor:{seedIndex:number,scrapeCursor:string|null},
 *   currentSeedId:string|null
 * }>}
 */
export async function runEngineTick() {
	const cfg = await readConfig();
	if (!cfg.seeds.length) {
		throw Object.assign(new Error('لا توجد بذور (seeds) مهيَّأة في الإعدادات.'), {
			reason: 'no_seeds',
			status: 400
		});
	}

	let cursor = await readCursor();
	if (cursor.seedIndex >= cfg.seeds.length) {
		cursor = { seedIndex: 0, scrapeCursor: null };
	}
	const seed = cfg.seeds[cursor.seedIndex];

	// 1) بناء الاستعلام + استرجاع صفحة من Scraping API.
	const query = buildLuceneQuery({
		q: seed.q,
		nebrasTypes: seed.nebrasTypes,
		languages: seed.languages,
		collections: seed.collections,
		creators: seed.creators
	});
	const page = await scrapeOnePage({
		query,
		count: cfg.scrapeCount,
		cursor: cursor.scrapeCursor
	});

	// 2) إن لم تأتِ نتائج، أو وصلنا للنهاية مع 0 جديد، نتقدّم للبذرة التاليّة.
	if (page.items.length === 0) {
		const nextIndex = (cursor.seedIndex + 1) % cfg.seeds.length;
		const nextCursor = { seedIndex: nextIndex, scrapeCursor: null };
		await writeCursor(nextCursor);
		await appendLog({
			level: 'info',
			message: `استُنفدت البذرة "${seed.label || seed.id}" — التحوّل للبذرة التاليّة.`,
			seedId: seed.id
		});
		return {
			processed: 0,
			skipped: 0,
			failed: 0,
			advancedToNextSeed: true,
			cursor: nextCursor,
			currentSeedId: seed.id
		};
	}

	// 3) فلترة العناصر المعروفة (مستوردة أو blacklisted).
	const identifiers = page.items.map((it) => String(it?.identifier || '')).filter(Boolean);
	const { newIds } = await partitionKnownItems(identifiers);
	const newSet = new Set(newIds);
	const toProcess = page.items.filter((it) => newSet.has(String(it?.identifier || '')));

	// 4) معالجة batch محدود (يحترم batchSize). الباقي يبقى متاحاً عبر الـ cursor.
	const batch = toProcess.slice(0, cfg.batchSize);
	let processed = 0;
	let skipped = identifiers.length - toProcess.length;
	let failed = 0;

	for (const item of batch) {
		const id = String(item?.identifier || '');
		if (!id) continue;

		// race-condition guard
		if (await isItemImported(id).catch(() => false)) {
			skipped += 1;
			continue;
		}

		try {
			const r = await importItem(id, seed, cfg);
			processed += 1;
			await appendLog({
				level: 'success',
				message: `استورد "${r.title}" (${r.nebrasContentType})`,
				identifier: id,
				fileId: r.fileId,
				seedId: seed.id,
				hierarchy: r.hierarchy
			});
		} catch (err) {
			failed += 1;
			const reason = err?.reason || 'unknown';
			await recordFailure(id, {
				reason,
				message: err?.message || String(err),
				iaSourceUrl: `https://archive.org/details/${id}`
			}).catch(() => {});
			await appendLog({
				level: 'error',
				message: `فشل "${id}": ${err?.message || err}`,
				identifier: id,
				seedId: seed.id,
				reason
			});
		}
	}

	// 5) تحديد cursor التالي:
	//    - إن لم نُعالج كلّ النتائج في هذه الصفحة (بسبب batchSize) → نُبقي الـ
	//      scrapeCursor الحالي ونعالج الباقي في tick التالي.
	//    - وإلا نقفز إلى scrapeCursor الذي أعطاه IA؛ إن كان null فقد استنفدنا
	//      البذرة → ننتقل للتاليّة.
	let advancedToNextSeed = false;
	let nextCursor;
	if (batch.length < toProcess.length) {
		nextCursor = { seedIndex: cursor.seedIndex, scrapeCursor: cursor.scrapeCursor };
	} else if (page.nextCursor) {
		nextCursor = { seedIndex: cursor.seedIndex, scrapeCursor: page.nextCursor };
	} else {
		const ni = (cursor.seedIndex + 1) % cfg.seeds.length;
		nextCursor = { seedIndex: ni, scrapeCursor: null };
		advancedToNextSeed = true;
	}
	await writeCursor(nextCursor);

	// 6) تحديث الإحصائيات + back-off counter
	await bumpStats({
		importedDelta: processed,
		skippedDelta: skipped,
		failedDelta: failed,
		runsDelta: 1,
		touchLastRun: true,
		lastError: failed > 0 ? `${failed} فشلت في الدورة الأخيرة` : null
	});
	if (processed === 0) {
		const cur = await readStats().catch(() => null);
		const next = Number(cur?.consecutiveEmptyRuns || 0) + 1;
		await getAdminDatabase()
			.ref(`${STATS_PATH}/consecutiveEmptyRuns`)
			.set(next)
			.catch(() => {});
	} else {
		await getAdminDatabase()
			.ref(`${STATS_PATH}/consecutiveEmptyRuns`)
			.set(0)
			.catch(() => {});
	}

	return {
		processed,
		skipped,
		failed,
		advancedToNextSeed,
		cursor: nextCursor,
		currentSeedId: seed.id
	};
}

// ── Public control surface ─────────────────────────────────────────

export async function startEngine() {
	const cfg = await writeConfig({ enabled: true });
	const state = getGlobalState();
	if (state.running) {
		await appendLog({ level: 'info', message: 'المحرّك يعمل بالفعل.' });
		return { running: true, alreadyRunning: true, config: cfg };
	}
	state.running = true;
	await appendLog({ level: 'info', message: 'بدء المحرّك الآلي.' });
	state.timer = setTimeout(() => tickLoop().catch(() => {}), 100);
	return { running: true, alreadyRunning: false, config: cfg };
}

export async function stopEngine() {
	const state = getGlobalState();
	state.running = false;
	if (state.timer) {
		clearTimeout(state.timer);
		state.timer = null;
	}
	const cfg = await writeConfig({ enabled: false });
	await appendLog({ level: 'info', message: 'إيقاف المحرّك بطلب صريح.' });
	return { running: false, config: cfg };
}

async function tickLoop() {
	const state = getGlobalState();
	if (!state.running || state.currentTickInFlight) return;
	state.currentTickInFlight = true;
	state.lastTickStartedAt = Date.now();

	try {
		const cfg = await readConfig();
		if (!cfg.enabled) {
			state.running = false;
			if (state.timer) clearTimeout(state.timer);
			state.timer = null;
			await appendLog({ level: 'info', message: 'إيقاف المحرّك (enabled=false).' });
			return;
		}
		await runEngineTick();
	} catch (err) {
		await appendLog({
			level: 'error',
			message: `tick فشل: ${err?.message || err}`,
			reason: err?.reason || 'tick_failed'
		}).catch(() => {});
		await bumpStats({ lastError: err?.message || String(err), touchLastRun: true }).catch(() => {});
	} finally {
		state.currentTickInFlight = false;
		state.lastTickEndedAt = Date.now();
		if (state.running) {
			const cfg = await readConfig().catch(() => DEFAULT_CONFIG);
			state.timer = setTimeout(() => tickLoop().catch(() => {}), cfg.tickIntervalMs);
		}
	}
}

export async function autoBootIfNeeded() {
	const state = getGlobalState();
	if (state.autoBootAttempted) return;
	state.autoBootAttempted = true;
	const cfg = await readConfig();
	if (cfg.enabled && !state.running) {
		state.running = true;
		await appendLog({ level: 'info', message: 'إعادة تشغيل تلقائي بعد إقلاع الخادم.' });
		state.timer = setTimeout(() => tickLoop().catch(() => {}), 500);
	}
}

export async function getEngineStatus({ logLimit = 30 } = {}) {
	await autoBootIfNeeded();
	const state = getGlobalState();
	const [cfg, cursor, stats, log] = await Promise.all([
		readConfig(),
		readCursor(),
		readStats(),
		readLog(logLimit)
	]);
	return {
		processRunning: state.running,
		currentTickInFlight: state.currentTickInFlight,
		lastTickStartedAt: state.lastTickStartedAt,
		lastTickEndedAt: state.lastTickEndedAt,
		config: cfg,
		cursor,
		stats,
		currentSeed: cfg.seeds[cursor.seedIndex] || null,
		log
	};
}

/**
 * تحديث البذور بكاملها. يُعيد المؤشّر إلى البداية.
 */
export async function updateSeeds(seeds) {
	const filtered = (seeds || []).filter(isValidSeed);
	const cfg = await writeConfig({ seeds: filtered });
	await writeCursor({ seedIndex: 0, scrapeCursor: null });
	await appendLog({
		level: 'info',
		message: `تمّ تحديث البذور (${cfg.seeds.length} بذرة) — إعادة المؤشّر.`
	});
	return cfg;
}

/**
 * إعادة تعيين المؤشّر فقط (يبدأ المحرّك من أوّل بذرة).
 */
export async function resetCursor() {
	await writeCursor({ seedIndex: 0, scrapeCursor: null });
	await appendLog({ level: 'info', message: 'إعادة تعيين المؤشّر.' });
	return { seedIndex: 0, scrapeCursor: null };
}

/**
 * "إعادة ضبط المصنع": يمسح كلّ ما رفعه محرّك IA من السجلات (uploads
 * + content_files) + registry + failures + cursor. لا يمسّ:
 *   - أيّ محتوى رفعه إنسان (يُحدَّد بـ __provider !== 'internet_archive')
 *   - الأقسام (لا ننشئ أقساماً تلقائياً في هذه النسخة).
 *
 * @returns {Promise<{ ok:true, cleared:{ uploads:number, content_files:number, registry:number, failures:number } }>}
 */
export async function factoryReset() {
	const db = getAdminDatabase();
	const fs = getNebrasFirestoreAdmin();

	try {
		await stopEngine();
	} catch {
		// ignore
	}

	const [registrySnap, failuresSnap, uploadsSnap, contentFilesSnap] = await Promise.all([
		db.ref('ia_library_registry').get(),
		db.ref('ia_library_failures').get(),
		fs.collection(NEBRAS_FS_UPLOADS).get(),
		fs.collection(NEBRAS_FS_CONTENT_FILES).get()
	]);

	const cleared = { uploads: 0, content_files: 0, registry: 0, failures: 0 };
	const updates = {};

	if (registrySnap.exists()) {
		cleared.registry = Object.keys(registrySnap.val() || {}).length;
		updates['ia_library_registry'] = null;
	}
	if (failuresSnap.exists()) {
		cleared.failures = Object.keys(failuresSnap.val() || {}).length;
		updates['ia_library_failures'] = null;
	}
	updates['ia_library_engine/cursor'] = null;
	updates['ia_library_engine/stats'] = {
		totalImported: 0,
		totalSkipped: 0,
		totalFailed: 0,
		runsCount: 0,
		lastRunAt: null,
		lastError: 'factory_reset',
		consecutiveEmptyRuns: 0
	};

	const fileIdsToDelete = new Set();
	if (!uploadsSnap.empty) {
		for (const d of uploadsSnap.docs) {
			if (d.data()?.__provider === 'internet_archive') {
				fileIdsToDelete.add(d.id);
				cleared.uploads += 1;
			}
		}
	}
	if (!contentFilesSnap.empty) {
		for (const d of contentFilesSnap.docs) {
			if (d.data()?.__provider === 'internet_archive') {
				fileIdsToDelete.add(d.id);
				cleared.content_files += 1;
			}
		}
	}

	if (Object.keys(updates).length > 0) await db.ref().update(updates);
	await adminFsBulkDeleteFileMirrorIds([...fileIdsToDelete]);

	await appendLog({
		level: 'warn',
		message:
			`إعادة ضبط المصنع — حُذف ${cleared.uploads + cleared.content_files} عنصر، ` +
			`${cleared.registry} سجلّ في registry.`,
		reason: 'factory_reset'
	}).catch(() => {});

	return { ok: true, cleared };
}
