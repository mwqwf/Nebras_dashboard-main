/**
 * engine.js — محرّك Internet Archive لنبراس (مستقلّ تماماً عن noorLibrary).
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  المبدأ الذهبي — كلّ شيء آليّ، لا تدخّل بشريّ:                     ║
 * ║                                                                  ║
 * ║   1) لا اتصال مباشر من التطبيق بـ archive.org.                    ║
 * ║   2) لا حقول ولا أزرار تفصح عن المصدر داخل التطبيق.                ║
 * ║   3) لا يدخل أيّ ملفّ التطبيق ما لم يكن:                          ║
 * ║        مرخّصاً (licenseFilter) + قابلاً للتشغيل (playabilityFilter)║
 * ║        + مُتحقَّقاً من سلامة بايتاته (verifyDownloadedBuffer).      ║
 * ║   4) كلّ بذرة تستنفد نتائجها كاملةً قبل التحوّل للتاليّة.            ║
 * ║   5) التصنيف **آليّ بالكامل** — إن لم يوجد قسم مناسب يُنشئ المحرّك  ║
 * ║      قسماً جديداً تحت main افتراضي ويكتب فيه. لا hierarchy يدويّة. ║
 * ║   6) Bootstrap واحد (`bootstrap()`) يضع بذوراً افتراضيّة + يُفعّل   ║
 * ║      enabled + يطلق أوّل tick فوراً.                               ║
 * ╚══════════════════════════════════════════════════════════════════╝
 *
 * مسارات RTDB:
 *   ia_library_engine/config   — { enabled, seeds[], tickIntervalMs, batchSize, scrapeCount, trustedCollections[], allowMissingLicenseInTrustedCollections }
 *   ia_library_engine/cursor   — { seedIndex, scrapeCursor }
 *   ia_library_engine/stats    — إحصائيات + consecutiveEmptyRuns
 *   ia_library_engine/log/{ts} — آخر 60 إدخال
 */

import {
	getAdminDatabase,
	getNebrasFirestoreAdmin,
	isAdminConfigured,
	sendTopicMessage
} from '$lib/server/firebaseAdmin.js';
import { adminFsBulkDeleteFileMirrorIds } from '$lib/server/nebrasUnifiedFirestoreAdmin.js';
import {
	NEBRAS_FS_UPLOADS,
	NEBRAS_FS_CONTENT_FILES
} from '$lib/firebase/nebrasUnifiedPaths.js';

// كلّ الاستيرادات من داخل مجلّد internetArchive فقط — لا noorLibrary.
import { buildSectionsTree, validateHierarchyPath } from './sectionsTree.js';
import {
	createMainSectionAdmin,
	createSubSectionAdmin,
	createSecondarySectionAdmin
} from './sectionsCreator.js';
import { classifyItem } from './classifier.js';
import { scrapeOnePage, buildLuceneQuery } from './search.js';
import { previewItem } from './fetcher.js';
import { downloadIaFile } from './downloader.js';
import { adminUploadAndRegister } from './adminUploader.js';
import { filterScrapeItemsByLicense } from './licenseFilter.js';
import {
	isItemImported,
	partitionKnownItems,
	recordImported,
	recordFailure
} from './registry.js';

/** محاولات استيراد لكل tick (فشل سريع بالترخيص/الصيغة ثم عنصر تالي). */
const MAX_IMPORT_ATTEMPTS_PER_TICK = 12;
/** مهلة تنزيل ضمن نافذة Cron (~30–60 ثانية على Vercel). */
const CRON_DOWNLOAD_TIMEOUT_MS = 45_000;

const ENGINE_ROOT = 'ia_library_engine';
const CONFIG_PATH = `${ENGINE_ROOT}/config`;
const CURSOR_PATH = `${ENGINE_ROOT}/cursor`;
const STATS_PATH = `${ENGINE_ROOT}/stats`;
const LOG_PATH = `${ENGINE_ROOT}/log`;
const LOG_MAX_ENTRIES = 60;

/**
 * بذور افتراضيّة جاهزة — تكفي لبدء الجلب الآليّ فوراً بدون أيّ JSON يدوي.
 * كلّ بذرة بلا hierarchy ثابتة — التصنيف الآليّ يقرّر مكان كلّ عنصر.
 *
 * يمكن للمسؤول إضافة بذوره عبر updateSeeds؛ لكنّ هذه القائمة وحدها كافية
 * لرؤية محتوى في التطبيق فور التشغيل.
 */
export const DEFAULT_SEEDS = Object.freeze([
	{
		id: 'arabic_texts_opensource',
		label: 'كتب عربية — مصدر مفتوح',
		q: '(islam OR إسلام OR قرآن OR حديث OR فقه OR تفسير OR سيرة)',
		languages: ['Arabic', 'ara'],
		nebrasTypes: ['document'],
		collections: ['opensource_arabic', 'community_texts', 'arabicliterature']
	},
	{
		id: 'arabic_audio_opensource',
		label: 'صوتيّات عربيّة — مصدر مفتوح',
		q: '(قرآن OR تلاوة OR محاضرة OR درس)',
		languages: ['Arabic', 'ara'],
		nebrasTypes: ['audio'],
		collections: ['opensource_audio', 'opensource']
	},
	{
		id: 'islamic_video_opensource',
		label: 'فيديو إسلامي — مصدر مفتوح',
		q: '(islamic OR إسلامي OR محاضرة OR خطبة)',
		languages: ['Arabic', 'ara'],
		nebrasTypes: ['video'],
		collections: ['opensource_movies']
	}
]);

/**
 * عبارات بحث دوّارة — تُغذّي فهرس Firestore بعناوين يبحث عنها المستخدمون في التطبيق
 * (التطبيق يقرأ Firestore فقط؛ الجلب من IA يحدث هنا خلفياً).
 */
export const SEARCH_QUERY_ROTATION = Object.freeze([
	'تفسير القرآن',
	'سيرة النبي',
	'الفقه الإسلامي',
	'حديث نبوي',
	'العقيدة الإسلامية',
	'تربية إسلامية',
	'اللغة العربية',
	'تاريخ إسلامي',
	'ابن كثير',
	'النووي',
	'ابن تيمية',
	'الغزالي',
	'ابن القيم',
	'محمد بن عبد الوهاب',
	'كتاب التوحيد',
	'رياض الصالحين',
	'صحيح البخاري',
	'صحيح مسلم',
	'تفسير ابن كثير',
	'الأذكار',
	'فقه السنة',
	'السيرة النبوية',
	'علوم القرآن',
	'أصول الفقه',
	'الحديث الشريف',
	'الزهد',
	'الرقائق',
	'الفتاوى',
	'المنهاج',
	'شرح العقيدة',
	'التفسير',
	'القرآن الكريم',
	'محاضرة إسلامية',
	'درس ديني',
	'خطبة جمعة'
]);

/**
 * ⚠️ enabled=true بالافتراض. النظام يقلع آلياً بدون أي تدخّل بشريّ.
 * البذور الافتراضية (DEFAULT_SEEDS) تُحقن في readConfig إن غابت لكي
 * يضمن المحرّك أنّ لديه دائماً ما يجلبه.
 */
/**
 * إعدادات الإنتاج — مضبوطة للعمل على GitHub Action (60s timeout) + Vercel Pro/Hobby:
 *  - batchSize=5  → 5 عناصر بحدّ أقصى لكل tick (نجاحات؛ فشل سريع لا يُحتسب).
 *  - scrapeCount=200 → نطاق أوسع للمرشّحين قبل تطبيق الفلاتر.
 *  - allowMissingLicenseInTrustedCollections=true لتمرير عناصر opensource.
 *  - trustedCollections موسَّعة لتشمل المجموعات الإسلاميّة/العربيّة الرئيسيّة.
 */
const DEFAULT_CONFIG = Object.freeze({
	enabled: true,
	seeds: [...DEFAULT_SEEDS],
	tickIntervalMs: 12000,
	batchSize: 5,
	scrapeCount: 200,
	trustedCollections: [
		'opensource_arabic',
		'community_texts',
		'arabicliterature',
		'arabicliteratureandlinguistics',
		'islamicbooks_archive',
		'islamic-books',
		'islamicpdfbooks',
		'shamela',
		'opensource',
		'opensource_audio',
		'opensource_movies',
		'audio_religion',
		'lecturesandtalks'
	],
	allowMissingLicenseInTrustedCollections: true
});

// ── State singleton ─────────────────────────────────────────────────
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

// ── Seed validation ─────────────────────────────────────────────────
function isValidSeed(seed) {
	if (!seed || typeof seed !== 'object') return false;
	if (!String(seed.id || '').trim()) return false;
	const types = Array.isArray(seed.nebrasTypes) ? seed.nebrasTypes : [];
	for (const t of types) {
		if (t !== 'document' && t !== 'audio' && t !== 'video') return false;
	}
	if (
		!String(seed.q || '').trim() &&
		types.length === 0 &&
		(!seed.collections || seed.collections.length === 0)
	) {
		return false; // بذرة بلا أيّ تضييق = خطر
	}
	return true;
}

// ── RTDB helpers ────────────────────────────────────────────────────
/**
 * يقرأ الإعدادات من RTDB مع دمج DEFAULT_CONFIG بحيث:
 *  - لو لا يوجد config أصلاً → نُعيد DEFAULT_CONFIG (enabled=true + بذور).
 *  - لو يوجد config لكنّ seeds فارغة → نحقن DEFAULT_SEEDS تلقائياً.
 *  - لو enabled غير محدّد في RTDB → نعتبره true (للإقلاع التلقائي الأوّل).
 *
 * النتيجة: لا توجد حالة يبدأ فيها المحرّك بلا بذور أو بـ enabled=false
 * من تلقاء نفسه. التعطيل يحتاج أمراً صريحاً (stopEngine).
 */
async function readConfig() {
	const snap = await getAdminDatabase().ref(CONFIG_PATH).get();
	if (!snap.exists()) return { ...DEFAULT_CONFIG, seeds: [...DEFAULT_SEEDS] };
	const v = snap.val() || {};
	const validSeeds = Array.isArray(v.seeds) ? v.seeds.filter(isValidSeed) : [];
	const seeds = validSeeds.length > 0 ? validSeeds : [...DEFAULT_SEEDS];
	return {
		enabled: v.enabled === undefined ? true : Boolean(v.enabled),
		seeds,
		tickIntervalMs: Math.max(3000, Number(v.tickIntervalMs) || DEFAULT_CONFIG.tickIntervalMs),
		batchSize: Math.max(1, Math.min(10, Number(v.batchSize) || DEFAULT_CONFIG.batchSize)),
		scrapeCount: Math.max(100, Math.min(1000, Number(v.scrapeCount) || DEFAULT_CONFIG.scrapeCount)),
		trustedCollections: Array.isArray(v.trustedCollections)
			? v.trustedCollections
			: DEFAULT_CONFIG.trustedCollections,
		allowMissingLicenseInTrustedCollections:
			v.allowMissingLicenseInTrustedCollections === undefined
				? DEFAULT_CONFIG.allowMissingLicenseInTrustedCollections
				: Boolean(v.allowMissingLicenseInTrustedCollections)
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
	if (!snap.exists()) {
		return { seedIndex: 0, scrapeCursor: null, queryIndex: 0, tickMode: 'catalog' };
	}
	const v = snap.val() || {};
	const tickMode = v.tickMode === 'search' ? 'search' : 'catalog';
	return {
		seedIndex: Math.max(0, Number(v.seedIndex) || 0),
		scrapeCursor: typeof v.scrapeCursor === 'string' && v.scrapeCursor ? v.scrapeCursor : null,
		queryIndex: Math.max(0, Number(v.queryIndex) || 0),
		tickMode
	};
}

async function writeCursor(cursor) {
	await getAdminDatabase()
		.ref(CURSOR_PATH)
		.set({
			seedIndex: cursor.seedIndex,
			scrapeCursor: cursor.scrapeCursor || null,
			queryIndex: Math.max(0, Number(cursor.queryIndex) || 0),
			tickMode: cursor.tickMode === 'search' ? 'search' : 'catalog',
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
			sectionsCreated: 0,
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
			totalImported: Number(c.totalImported ?? 0) + Number(patch.importedDelta ?? 0),
			totalSkipped: Number(c.totalSkipped ?? 0) + Number(patch.skippedDelta ?? 0),
			totalFailed: Number(c.totalFailed ?? 0) + Number(patch.failedDelta ?? 0),
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

// ── FCM (إشعار حياديّ المصدر) ──────────────────────────────────────
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

// ── Core: import one item ──────────────────────────────────────────

/**
 * يستورد عنصر IA واحد. الـ hierarchy:
 *   - إن وُجدت hierarchy صريحة (يدوي/طارئ) — يُعتمد ما فيها بعد التحقّق.
 *   - وإلا → classifier تلقائي + إنشاء أقسام عند الحاجة.
 *
 * @param {string} identifier
 * @param {{
 *   trustedCollections?: string[],
 *   allowMissingLicenseInTrustedCollections?: boolean,
 *   forcedHierarchy?: { mainId:string, subId:string, secondaryId?:string|null }
 * }} opts
 */
export async function importItem(identifier, opts = {}) {
	// 1) preview — يفحص الترخيص + يختار أفضل ملف قابل للتشغيل.
	const preview = await previewItem(identifier, {
		trustedCollections: opts.trustedCollections,
		allowMissingLicenseInTrustedCollections: opts.allowMissingLicenseInTrustedCollections,
		preferSmallestFile: Boolean(opts.preferSmallestFile)
	});

	// 2) قراءة شجرة الأقسام الحاليّة (مرّة واحدة).
	let sections = await buildSectionsTree();

	// 3) إمّا hierarchy مفروضة، أو classifier تلقائي مع إنشاء أقسام.
	let main = null;
	let sub = null;
	let secondary = null;
	const createdSectionsIds = [];
	let sectionsCreatedDelta = 0;
	let decisionReasoning = 'forced_hierarchy';
	let decisionConfidence = 1.0;

	if (opts.forcedHierarchy?.mainId && opts.forcedHierarchy?.subId) {
		const v = validateHierarchyPath(
			{
				mainId: opts.forcedHierarchy.mainId,
				subId: opts.forcedHierarchy.subId,
				secondaryId: opts.forcedHierarchy.secondaryId || null
			},
			sections.index
		);
		if (!v.valid) {
			throw Object.assign(new Error(`hierarchy غير صالحة: ${v.reason}`), {
				reason: v.reason,
				status: 400
			});
		}
		main = v.resolved.main;
		sub = v.resolved.sub;
		secondary = v.resolved.secondary;
	} else {
		// التصنيف التلقائي الكامل — لا تدخّل بشريّ.
		const decision = classifyItem(sections, {
			title: preview.title,
			author: preview.author,
			description: preview.description,
			subjects: preview.subjects,
			collections: preview.collections,
			nebrasContentType: preview.nebrasContentType
		});
		decisionReasoning = decision.reasoning;
		decisionConfidence = decision.confidence;

		// 3.a) إنشاء main إن لزم
		let mainId = decision.mainId;
		if (decision.kind === 'create_main') {
			const created = await createMainSectionAdmin(decision.newMainName);
			mainId = String(created.id);
			if (!created.alreadyExisted) {
				createdSectionsIds.push(mainId);
				sectionsCreatedDelta += 1;
				await appendLog({
					level: 'success',
					message: `قسم رئيسي جديد: "${created.name}"`,
					sectionId: mainId,
					kind: 'main_section_created'
				}).catch(() => {});
			}
			// إنشاء sub أوّل تحته مباشرةً
			const subCreated = await createSubSectionAdmin(mainId, decision.newSubName);
			const subId = String(subCreated.id);
			if (!subCreated.alreadyExisted) {
				createdSectionsIds.push(subId);
				sectionsCreatedDelta += 1;
				await appendLog({
					level: 'success',
					message: `قسم فرعي جديد: "${subCreated.name}" تحت "${created.name}"`,
					sectionId: subId,
					kind: 'sub_section_created'
				}).catch(() => {});
			}
			// أعد القراءة لتلتقط main+sub الجديدين
			sections = await buildSectionsTree();
			main = sections.index.mainsById[mainId];
			sub = sections.index.subsById[subId];
		} else if (decision.kind === 'create_sub') {
			const subCreated = await createSubSectionAdmin(mainId, decision.newSubName);
			const subId = String(subCreated.id);
			if (!subCreated.alreadyExisted) {
				createdSectionsIds.push(subId);
				sectionsCreatedDelta += 1;
				await appendLog({
					level: 'success',
					message: `قسم فرعي جديد: "${subCreated.name}"`,
					sectionId: subId,
					kind: 'sub_section_created'
				}).catch(() => {});
			}
			sections = await buildSectionsTree();
			main = sections.index.mainsById[String(mainId)];
			sub = sections.index.subsById[subId];
		} else {
			// existing — فقط استعمل ما اقترحه classifier
			main = sections.index.mainsById[String(decision.mainId)];
			sub = sections.index.subsById[String(decision.subId)];
			secondary = decision.secondaryId
				? sections.index.secondariesById[String(decision.secondaryId)]
				: null;
		}
	}

	if (!main || !sub) {
		throw Object.assign(new Error('فشل تحديد main/sub بعد التصنيف.'), {
			reason: 'classification_failed',
			status: 500
		});
	}

	// 4) تنزيل الملفّ كـ Buffer مع تحقّق magic bytes + حدّ الحجم.
	const downloaded = await downloadIaFile(preview.pickedFile.downloadUrl, {
		declaredType: preview.nebrasContentType,
		...(opts.downloadTimeoutMs ? { timeoutMs: opts.downloadTimeoutMs } : {})
	});

	// 5) رفع + كتابة مرآة Firestore (نفس schema الرفع اليدوي).
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

	// 6) سجّل في registry لمنع التكرار.
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
		createdSectionsIds,
		pickedFileName: preview.pickedFile.name,
		pickedFileSize: preview.pickedFile.size,
		nebrasContentType: preview.nebrasContentType
	});

	if (sectionsCreatedDelta > 0) {
		await bumpStats({ sectionsCreatedDelta }).catch(() => {});
	}

	// 7) إشعار FCM (محايد المصدر).
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
			secondary: secondary ? { id: String(secondary.id), name: String(secondary.name) } : null
		},
		createdSectionsIds,
		decisionReasoning,
		decisionConfidence
	};
}

// ── Tick ────────────────────────────────────────────────────────────

/**
 * يجرّب استيراد عدّة عناصر حتّى:
 *   • تحقيق batchSize نجاحاً، أو
 *   • استنفاد MAX_IMPORT_ATTEMPTS_PER_TICK محاولة (نجاحاً أو فشلاً).
 *
 * هذا يجعل batchSize يتحكّم فعلياً بعدد العناصر التي تصل التطبيق في كلّ tick.
 */
async function tryImportsFromPage(page, cfg, logCtx = {}) {
	const licenseOpts = {
		trustedCollections: cfg.trustedCollections,
		allowMissingLicenseInTrustedCollections: cfg.allowMissingLicenseInTrustedCollections
	};
	const beforeFilterCount = page.items.length;
	const licensed = filterScrapeItemsByLicense(page.items, licenseOpts);
	const licenseRejected = beforeFilterCount - licensed.length;
	const identifiers = licensed.map((it) => String(it?.identifier || '')).filter(Boolean);
	const { newIds } = await partitionKnownItems(identifiers);
	const newSet = new Set(newIds);
	const candidates = licensed.filter((it) => newSet.has(String(it?.identifier || '')));

	// لوغ تشخيصي: لماذا تخلّى المحرّك عن أوّل 3 عناصر فشلت بالفلتر — يكشف
	// الأسباب الفعليّة (license_missing, license_not_allowed, …) بدون
	// الحاجة لقراءة الـ failures registry يدوياً.
	if (licenseRejected > 0 && licensed.length === 0) {
		const samples = page.items.slice(0, 3).map((it) => ({
			id: String(it?.identifier || '?'),
			license: String(it?.licenseurl || it?.license || '—').slice(0, 80),
			collection: Array.isArray(it?.collection)
				? it.collection.slice(0, 3).join(',')
				: String(it?.collection || '—')
		}));
		await appendLog({
			level: 'warn',
			message: `الفلتر رفض ${licenseRejected}/${beforeFilterCount}: ${JSON.stringify(samples)}`,
			reason: 'license_filter_rejected_all',
			seedId: logCtx.seedId,
			mode: logCtx.mode
		}).catch(() => {});
	}

	let processed = 0;
	let skipped = licenseRejected + (identifiers.length - newIds.length);
	let failed = 0;
	let totalSectionsCreated = 0;

	const targetSuccess = Math.max(1, Number(cfg.batchSize) || 1);
	let attempts = 0;

	for (const item of candidates) {
		if (processed >= targetSuccess) break;
		if (attempts >= MAX_IMPORT_ATTEMPTS_PER_TICK) break;
		attempts += 1;

		const id = String(item?.identifier || '');
		if (!id) continue;
		if (await isItemImported(id).catch(() => false)) {
			skipped += 1;
			continue;
		}
		try {
			const r = await importItem(id, {
				...licenseOpts,
				preferSmallestFile: true,
				downloadTimeoutMs: CRON_DOWNLOAD_TIMEOUT_MS
			});
			processed += 1;
			totalSectionsCreated += r.createdSectionsIds?.length || 0;
			await appendLog({
				level: 'success',
				message: logCtx.successMessage
					? logCtx.successMessage(r, id)
					: `استورد "${r.title}"`,
				identifier: id,
				fileId: r.fileId,
				seedId: logCtx.seedId,
				mode: logCtx.mode
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
				seedId: logCtx.seedId,
				reason,
				mode: logCtx.mode
			});
		}
	}

	return {
		processed,
		skipped,
		failed,
		totalSectionsCreated,
		candidateCount: candidates.length
	};
}

/**
 * دورة بحث بعنوان/موضوع — تملأ Firestore بما يطابق بحث التطبيق لاحقاً.
 */
async function runSearchQueryTick(cfg, cursor) {
	const queries = SEARCH_QUERY_ROTATION;
	if (!queries.length) {
		return { processed: 0, skipped: 0, failed: 0, mode: 'search' };
	}

	const idx = cursor.queryIndex % queries.length;
	const q = queries[idx];
	const lucene = buildLuceneQuery({ q, nebrasTypes: ['document'], languages: ['Arabic'] });
	const page = await scrapeOnePage({ query: lucene, count: cfg.scrapeCount });
	const { processed, skipped, failed, totalSectionsCreated } = await tryImportsFromPage(page, cfg, {
		mode: 'search',
		successMessage: (r) => `بحث "${q}" → استورد "${r.title}"`
	});

	const nextCursor = {
		seedIndex: cursor.seedIndex,
		scrapeCursor: cursor.scrapeCursor,
		queryIndex: (idx + 1) % queries.length,
		tickMode: 'catalog'
	};
	await writeCursor(nextCursor);

	await bumpStats({
		importedDelta: processed,
		skippedDelta: skipped,
		failedDelta: failed,
		runsDelta: 1,
		touchLastRun: true,
		lastError: failed > 0 && !processed ? `بحث "${q}": لا تطابق قابل للاستيراد` : null
	});

	return {
		processed,
		skipped,
		failed,
		sectionsCreated: totalSectionsCreated,
		mode: 'search',
		searchQuery: q,
		cursor: nextCursor
	};
}

export async function runEngineTick() {
	const cfg = await readConfig();
	if (!cfg.seeds.length) {
		throw Object.assign(new Error('لا توجد بذور (seeds) مهيَّأة.'), {
			reason: 'no_seeds',
			status: 400
		});
	}

	let cursor = await readCursor();
	if (cursor.seedIndex >= cfg.seeds.length) {
		cursor = { ...cursor, seedIndex: 0, scrapeCursor: null };
	}

	// بالتناوب: دورة فهرسة كتالوجية + دورة بعبارة بحث (لتغطية ما يكتبه المستخدم في التطبيق).
	if (cursor.tickMode === 'search') {
		return runSearchQueryTick(cfg, cursor);
	}

	const seed = cfg.seeds[cursor.seedIndex];

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

	if (page.items.length === 0) {
		const nextIndex = (cursor.seedIndex + 1) % cfg.seeds.length;
		const nextCursor = {
			seedIndex: nextIndex,
			scrapeCursor: null,
			queryIndex: cursor.queryIndex,
			tickMode: 'search'
		};
		await writeCursor(nextCursor);
		await appendLog({
			level: 'info',
			message: `استُنفدت "${seed.label || seed.id}" — التحوّل للبذرة التاليّة.`,
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

	const { processed, skipped, failed, totalSectionsCreated, candidateCount } =
		await tryImportsFromPage(page, cfg, {
			seedId: seed.id,
			mode: 'catalog',
			successMessage: (r, id) =>
				`استورد "${r.title}" → ${r.hierarchy.main.name} › ${r.hierarchy.sub.name}${r.hierarchy.secondary ? ' › ' + r.hierarchy.secondary.name : ''}`
		});

	// تحديد cursor التالي — البذرة تستنفد كاملةً قبل الانتقال.
	let advancedToNextSeed = false;
	let nextCursor;
	const moreCandidatesOnPage = candidateCount > MAX_IMPORT_ATTEMPTS_PER_TICK;
	if (processed === 0 && moreCandidatesOnPage) {
		nextCursor = {
			seedIndex: cursor.seedIndex,
			scrapeCursor: cursor.scrapeCursor,
			queryIndex: cursor.queryIndex,
			tickMode: 'catalog'
		};
	} else if (page.nextCursor) {
		nextCursor = {
			seedIndex: cursor.seedIndex,
			scrapeCursor: page.nextCursor,
			queryIndex: cursor.queryIndex,
			tickMode: 'catalog'
		};
	} else {
		const ni = (cursor.seedIndex + 1) % cfg.seeds.length;
		nextCursor = {
			seedIndex: ni,
			scrapeCursor: null,
			queryIndex: cursor.queryIndex,
			tickMode: 'search'
		};
		advancedToNextSeed = true;
	}
	await writeCursor(nextCursor);

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
		sectionsCreated: totalSectionsCreated,
		advancedToNextSeed,
		cursor: nextCursor,
		currentSeedId: seed.id
	};
}

// ── Control ────────────────────────────────────────────────────────

export async function startEngine() {
	const cfg = await writeConfig({ enabled: true });
	const state = getGlobalState();
	if (state.running) {
		await appendLog({ level: 'info', message: 'المحرّك يعمل بالفعل.' });
		return { running: true, alreadyRunning: true, config: cfg };
	}
	state.running = true;
	await appendLog({ level: 'info', message: 'بدء المحرّك الآليّ.' });
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

/**
 * Bootstrap — زرّ واحد يفعّل كلّ شيء آليّاً:
 *   1) لو seeds فارغة → ضع DEFAULT_SEEDS
 *   2) فعّل enabled
 *   3) أعد المؤشّر إلى البداية (cursor=0, scrapeCursor=null)
 *   4) أطلق أوّل tick فوراً
 *
 * بعد هذا الاستدعاء يبدأ المحتوى يظهر في التطبيق خلال ثوانٍ — بدون أيّ
 * تدخّل بشري آخر، وبدون JSON يدوي.
 */
export async function bootstrap() {
	const current = await readConfig();
	const seeds = current.seeds.length > 0 ? current.seeds : [...DEFAULT_SEEDS];
	const cfg = await writeConfig({ seeds, enabled: true });
	await writeCursor({ seedIndex: 0, scrapeCursor: null, queryIndex: 0, tickMode: 'catalog' });
	await appendLog({
		level: 'info',
		message: `Bootstrap: ${cfg.seeds.length} بذور مُفعَّلة — بدء الجلب الآليّ الكامل.`
	});

	// شغّل أوّل tick في الخلفية (لا ننتظر اكتماله).
	let firstTickResult = null;
	try {
		firstTickResult = await runEngineTick();
	} catch (err) {
		await appendLog({
			level: 'warn',
			message: `أوّل tick فشل بعد bootstrap: ${err?.message || err}`,
			reason: err?.reason || 'bootstrap_first_tick_failed'
		});
	}

	// كذلك أبدِ الحلقة الداخليّة (تعمل على Node adapter؛ Cron الخارجي يكفي على Vercel).
	const state = getGlobalState();
	if (!state.running) {
		state.running = true;
		state.timer = setTimeout(() => tickLoop().catch(() => {}), 100);
	}

	return { ok: true, config: cfg, firstTickResult };
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

/**
 * الإقلاع التلقائي الكامل — يُستدعى من hooks.server.js على أوّل طلب،
 * ومن /engine/status. مرّة واحدة فقط لكلّ Node process.
 *
 * ⚠️ على Vercel serverless: `setTimeout` لا يصمد بعد إرجاع الـ response،
 * لذا الحلّ الوحيد لإجراء tick حقيقي هو **تنفيذه متزامناً** قبل الـ return.
 *
 * المعاملات:
 *   - opts.runInlineTick (افتراضي true): إذا كان true ينفّذ tick واحد
 *     متزامناً (await) في نفس الطلب. هذا يضمن أنّ محتوى يصل Firestore
 *     قبل أن ينتهي الطلب — حتى على serverless.
 *
 * السلوك:
 *   1) إن لم يوجد config → يكتب DEFAULT_CONFIG (enabled=true + بذور).
 *   2) إن كان enabled=false (المستخدم أوقفه) → يخرج (يحترم القرار).
 *   3) إن كان enabled=true:
 *      أ) يطلق tickLoop داخلياً (يعمل على Node long-running adapter).
 *      ب) إذا runInlineTick=true ينفّذ runEngineTick متزامناً أيضاً.
 */
export async function autoBootIfNeeded(opts = {}) {
	const state = getGlobalState();
	const runInline = opts.runInlineTick !== false;
	const forceTick = opts.forceTick === true;
	const firstTime = !state.autoBootAttempted;
	state.autoBootAttempted = true;

	const db = getAdminDatabase();
	const cfgSnap = await db.ref(CONFIG_PATH).get();
	if (!cfgSnap.exists()) {
		await db.ref(CONFIG_PATH).set({
			...DEFAULT_CONFIG,
			seeds: [...DEFAULT_SEEDS],
			scrapeCount: 100
		});
		await db.ref(CURSOR_PATH).set({
			seedIndex: 0,
			scrapeCursor: null,
			queryIndex: 0,
			tickMode: 'catalog'
		});
		await appendLog({
			level: 'info',
			message: 'إقلاع أوّليّ: محرّك الجلب الآليّ مُفعَّل (كتالوج + بحث دوّار).'
		}).catch(() => {});
	}

	let cfg = await readConfig();
	// ترقية إعدادات RTDB القديمة:
	//   - scrapeCount < 200  (القديم كان 20 أو 100، الجديد 200)
	//   - batchSize < 3      (القديم كان 1، الجديد 5)
	//   - seeds معطوبة بـ q:language:Arabic بدون languages[]
	//   - trustedCollections لا تحوي المجموعات الجديدة
	const rawCfg = cfgSnap.exists() ? cfgSnap.val() || {} : {};
	const seedsStale =
		!Array.isArray(rawCfg.seeds) ||
		rawCfg.seeds.length === 0 ||
		rawCfg.seeds.some(
			(s) =>
				String(s?.q || '').trim() === 'language:Arabic' &&
				(!Array.isArray(s.languages) || s.languages.length === 0)
		);
	const collectionsStale =
		!Array.isArray(rawCfg.trustedCollections) ||
		rawCfg.trustedCollections.length < DEFAULT_CONFIG.trustedCollections.length;
	if (
		Number(rawCfg.scrapeCount) < 200 ||
		Number(rawCfg.batchSize) < 3 ||
		seedsStale ||
		collectionsStale
	) {
		cfg = await writeConfig({
			scrapeCount: 200,
			batchSize: 5,
			seeds: [...DEFAULT_SEEDS],
			trustedCollections: DEFAULT_CONFIG.trustedCollections
		});
	}

	if (!cfg.enabled) {
		if (forceTick) {
			cfg = await writeConfig({ enabled: true });
		} else {
			return { booted: false, reason: 'engine_disabled_by_user' };
		}
	}

	let inlineTickResult = null;
	/** @type {{ reason?: string, message?: string } | null} */
	let tickError = null;

	if (runInline) {
		if (state.currentTickInFlight && !forceTick) {
			return { booted: true, inlineTickResult: null, skippedInlineTick: true, reason: 'tick_in_flight' };
		}
		if (!forceTick) {
			const stats = await readStats().catch(() => null);
			const lastRun = Number(stats?.lastRunAt) || 0;
			const sinceLastMs = lastRun ? Date.now() - lastRun : Infinity;
			if (sinceLastMs < 90_000) {
				return { booted: true, inlineTickResult: null, skippedInlineTick: true, sinceLastMs };
			}
		}

		state.currentTickInFlight = true;
		state.lastTickStartedAt = Date.now();
		try {
			inlineTickResult = await runEngineTick();
		} catch (err) {
			tickError = {
				reason: err?.reason || 'inline_tick_failed',
				message: err?.message || String(err)
			};
			await appendLog({
				level: 'error',
				message: `inline tick فشل: ${tickError.message}`,
				reason: tickError.reason
			}).catch(() => {});
		} finally {
			state.currentTickInFlight = false;
			state.lastTickEndedAt = Date.now();
		}
	}

	return { booted: true, inlineTickResult, tickError };
}

export async function getEngineStatus({ logLimit = 30 } = {}) {
	// لا نشغّل tick متزامناً عند قراءة الحالة فقط (لكي لا تبطئ Polling
	// كل 8 ثوانٍ من الواجهة). نُكتفي بكتابة DEFAULT_CONFIG لو لم يوجد.
	await autoBootIfNeeded({ runInlineTick: false });
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

export async function updateSeeds(seeds) {
	const filtered = (seeds || []).filter(isValidSeed);
	const cfg = await writeConfig({ seeds: filtered });
	await writeCursor({ seedIndex: 0, scrapeCursor: null, queryIndex: 0, tickMode: 'catalog' });
	await appendLog({
		level: 'info',
		message: `تمّ تحديث البذور (${cfg.seeds.length} بذرة).`
	});
	return cfg;
}

export async function resetCursor() {
	await writeCursor({ seedIndex: 0, scrapeCursor: null, queryIndex: 0, tickMode: 'catalog' });
	await appendLog({ level: 'info', message: 'إعادة تعيين المؤشّر.' });
	return { seedIndex: 0, scrapeCursor: null };
}

/**
 * Factory reset — يمسح كلّ ما رفعه/أنشأه محرّك IA. لا يلمس أيّ شيء بشريّ.
 *
 * يمسح:
 *   - sections بعلامة __createdBy='ia_library_engine'
 *   - files/uploads بعلامة __provider='internet_archive'
 *   - registry + failures + cursor
 *   - يصفّر stats
 */
export async function factoryReset() {
	const db = getAdminDatabase();
	const fs = getNebrasFirestoreAdmin();

	try {
		await stopEngine();
	} catch {
		/* ignore */
	}

	// نقرأ كلّ المستويات والوثائق المعنيّة بالتوازي
	const [registrySnap, failuresSnap, uploadsSnap, contentFilesSnap, mainSnap, subSnap, secSnap] =
		await Promise.all([
			db.ref('ia_library_registry').get(),
			db.ref('ia_library_failures').get(),
			fs.collection(NEBRAS_FS_UPLOADS).get(),
			fs.collection(NEBRAS_FS_CONTENT_FILES).get(),
			fs.collection('sections_unified').doc('main').get(),
			fs.collection('sections_unified').doc('sub').get(),
			fs.collection('sections_unified').doc('secondary').get()
		]);

	const cleared = {
		uploads: 0,
		content_files: 0,
		registry: 0,
		failures: 0,
		mains: 0,
		subs: 0,
		secondaries: 0
	};
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
		sectionsCreated: 0,
		runsCount: 0,
		lastRunAt: null,
		lastError: 'factory_reset',
		consecutiveEmptyRuns: 0
	};

	// ملفات الـ IA — نحدّدها بـ __provider
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

	// أقسام المحرّك — نحدّدها بـ __createdBy
	const iaMainIds = new Set();
	const iaSubIds = new Set();
	const iaSecIds = new Set();
	if (mainSnap.exists) {
		for (const [id, val] of Object.entries(mainSnap.data() || {})) {
			if (val?.__createdBy === 'ia_library_engine') {
				iaMainIds.add(String(id));
				cleared.mains += 1;
			}
		}
	}
	if (subSnap.exists) {
		for (const [id, val] of Object.entries(subSnap.data() || {})) {
			const parent = String(val?.main_section ?? '');
			if (val?.__createdBy === 'ia_library_engine' || iaMainIds.has(parent)) {
				iaSubIds.add(String(id));
				cleared.subs += 1;
			}
		}
	}
	if (secSnap.exists) {
		for (const [id, val] of Object.entries(secSnap.data() || {})) {
			const parent = String(val?.sub_section ?? '');
			if (val?.__createdBy === 'ia_library_engine' || iaSubIds.has(parent)) {
				iaSecIds.add(String(id));
				cleared.secondaries += 1;
			}
		}
	}

	if (Object.keys(updates).length > 0) await db.ref().update(updates);
	await adminFsBulkDeleteFileMirrorIds([...fileIdsToDelete]);

	// حذف الأقسام: نُفرّغ الحقول واحدة واحدة عبر update مع FieldValue.delete()
	if (iaMainIds.size + iaSubIds.size + iaSecIds.size > 0) {
		const { FieldValue } = await import('firebase-admin/firestore');
		const buildDelete = (ids) => {
			const obj = {};
			for (const id of ids) obj[String(id)] = FieldValue.delete();
			return obj;
		};
		const batch = fs.batch();
		if (iaMainIds.size > 0) batch.update(fs.collection('sections_unified').doc('main'), buildDelete(iaMainIds));
		if (iaSubIds.size > 0) batch.update(fs.collection('sections_unified').doc('sub'), buildDelete(iaSubIds));
		if (iaSecIds.size > 0) batch.update(fs.collection('sections_unified').doc('secondary'), buildDelete(iaSecIds));
		await batch.commit().catch(() => {});
	}

	await appendLog({
		level: 'warn',
		message:
			`Factory reset — حُذف ${cleared.uploads + cleared.content_files} عنصر، ` +
			`${cleared.mains + cleared.subs + cleared.secondaries} قسم، ` +
			`${cleared.registry} سجلّ.`,
		reason: 'factory_reset'
	}).catch(() => {});

	return { ok: true, cleared };
}
