<!--
  /admin/internet-archive — صفحة إدارة محرّك Internet Archive.

  ⚠️ الصفحة موجَّهة لـ owner/supervisor فقط. التطبيق (Flutter) لا يفتح
  هذه الصفحة ولا يعرف بوجودها. كلّ ما تفعله هذه الصفحة:

    1) بحث IA + معاينة عنصر (مع كشف الترخيص والصيغة قبل الاستيراد).
    2) استيراد يدوي إلى تصنيف داخل شجرة الأقسام.
    3) إدارة محرّك آلي (seeds + start/stop + tick + factory reset).

  لا تظهر أيّ بيانات IA في التطبيق — العلامات الداخليّة (__provider...)
  محفوظة في المستندات لكنّ ContentModel في Flutter لا يقرأها.
-->

<script>
	import { onMount } from 'svelte';
	import {
		fetchSectionsTree,
		searchItems,
		previewItem,
		importItem,
		getEngineStatus,
		startEngine,
		stopEngine,
		runOneTick,
		updateSeeds,
		resetEngine
	} from '$lib/api/internetArchive.js';

	// ── الحالة العامّة ─────────────────────────────────────────────
	let sectionsTree = $state(/** @type {any[]} */ ([]));
	let sectionsLoading = $state(false);
	let sectionsError = $state('');

	let engine = $state(/** @type {any} */ (null));
	let engineLoading = $state(false);
	let engineError = $state('');

	// ── بحث ───────────────────────────────────────────────────────
	let q = $state('');
	let nebrasTypes = $state(/** @type {string[]} */ (['document']));
	let languages = $state('Arabic');
	let collections = $state('');
	let cursor = $state(/** @type {string|null} */ (null));
	let count = $state(50);
	let results = $state(/** @type {any[]} */ ([]));
	let total = $state(0);
	let exhausted = $state(false);
	let searching = $state(false);
	let searchError = $state('');

	// ── معاينة + استيراد يدوي ────────────────────────────────────
	let selectedIdentifier = $state('');
	let preview = $state(/** @type {any} */ (null));
	let previewError = $state('');
	let previewLoading = $state(false);
	let targetMain = $state('');
	let targetSub = $state('');
	let targetSecondary = $state('');
	let importing = $state(false);
	let importError = $state('');
	let importMessage = $state('');

	// ── البذور للمحرّك ────────────────────────────────────────────
	let seedsDraft = $state('');
	let seedsSaving = $state(false);
	let seedsError = $state('');

	const NEBRAS_TYPES = ['document', 'audio', 'video'];
	const NEBRAS_TYPE_LABELS = { document: 'كتب (PDF)', audio: 'صوتيات (MP3 …)', video: 'فيديو (MP4)' };

	/** قالب بذرة — عدّل mainId/subId لتطابق أقسامك الفعلية قبل التشغيل الآلي. */
	const SEED_TEMPLATE = `[
  {
    "id": "arabic_books_opensource",
    "label": "كتب عربية — مصدر مفتوح",
    "q": "language:Arabic",
    "nebrasTypes": ["document"],
    "collections": ["opensource_arabic", "community_texts"],
    "hierarchy": { "mainId": "MAIN_ID", "subId": "SUB_ID", "secondaryId": null }
  }
]`;

	function csv(s) {
		return String(s || '')
			.split(/[,،]/)
			.map((x) => x.trim())
			.filter(Boolean);
	}

	async function loadSections() {
		sectionsLoading = true;
		sectionsError = '';
		try {
			const r = await fetchSectionsTree();
			sectionsTree = r.tree || [];
		} catch (err) {
			sectionsError = err?.message || 'تعذّر قراءة الأقسام.';
		} finally {
			sectionsLoading = false;
		}
	}

	async function loadEngine() {
		engineLoading = true;
		engineError = '';
		try {
			const r = await getEngineStatus();
			engine = r.status;
			const seeds = engine?.config?.seeds || [];
			seedsDraft =
				seeds.length > 0 ? JSON.stringify(seeds, null, 2) : SEED_TEMPLATE;
		} catch (err) {
			engineError = err?.message || 'تعذّر قراءة حالة المحرّك.';
		} finally {
			engineLoading = false;
		}
	}

	onMount(() => {
		loadSections();
		loadEngine();
	});

	async function doSearch(resetCursor = true) {
		searching = true;
		searchError = '';
		if (resetCursor) {
			results = [];
			cursor = null;
		}
		try {
			const r = await searchItems({
				q,
				nebrasTypes,
				languages: csv(languages),
				collections: csv(collections),
				cursor,
				count
			});
			results = [...results, ...(r.items || [])];
			cursor = r.nextCursor || null;
			total = r.total || results.length;
			exhausted = Boolean(r.exhausted);
		} catch (err) {
			searchError = err?.message || 'فشل البحث.';
		} finally {
			searching = false;
		}
	}

	async function doPreview(identifier) {
		selectedIdentifier = identifier;
		preview = null;
		previewError = '';
		previewLoading = true;
		try {
			const r = await previewItem({ identifier });
			preview = r.preview;
		} catch (err) {
			previewError = err?.message || 'فشل المعاينة.';
		} finally {
			previewLoading = false;
		}
	}

	async function doImport() {
		if (!selectedIdentifier || !targetMain || !targetSub) {
			importError = 'اختر التصنيف أوّلاً.';
			return;
		}
		importing = true;
		importError = '';
		importMessage = '';
		try {
			const r = await importItem({
				identifier: selectedIdentifier,
				hierarchy: {
					mainId: targetMain,
					subId: targetSub,
					secondaryId: targetSecondary || null
				}
			});
			importMessage = `تمّ الاستيراد: ${r.result?.title || selectedIdentifier}`;
			// لا نمسح المعاينة فوراً حتى يرى المستخدم النتيجة
		} catch (err) {
			importError = err?.message || 'فشل الاستيراد.';
		} finally {
			importing = false;
		}
	}

	async function onSaveSeeds() {
		seedsSaving = true;
		seedsError = '';
		try {
			const parsed = JSON.parse(seedsDraft || '[]');
			if (!Array.isArray(parsed)) throw new Error('JSON ليس مصفوفة.');
			const r = await updateSeeds(parsed);
			engine = { ...engine, config: r.config };
			seedsDraft = JSON.stringify(r.config.seeds || [], null, 2);
		} catch (err) {
			seedsError = err?.message || 'JSON غير صالح.';
		} finally {
			seedsSaving = false;
		}
	}

	async function onEngineAction(action) {
		try {
			if (action === 'start') await startEngine();
			else if (action === 'stop') await stopEngine();
			else if (action === 'tick') await runOneTick();
			else if (action === 'reset-cursor') await resetEngine('cursor');
			else if (action === 'factory') {
				if (!confirm('سيُمحى كلّ ما رفعه محرّك Internet Archive (لا يمسّ الرفع اليدوي). متابعة؟')) return;
				await resetEngine('factory');
			}
			await loadEngine();
		} catch (err) {
			engineError = err?.message || 'فشل الإجراء.';
		}
	}

	// الأقسام الفرعية المرتبطة بالـ main المحدّد
	const subsForMain = $derived(
		sectionsTree.find((m) => String(m.id) === String(targetMain))?.children || []
	);
	const secondariesForSub = $derived(
		subsForMain.find((s) => String(s.id) === String(targetSub))?.children || []
	);

	function toggleType(t) {
		if (nebrasTypes.includes(t)) nebrasTypes = nebrasTypes.filter((x) => x !== t);
		else nebrasTypes = [...nebrasTypes, t];
	}
</script>

<div class="space-y-8 p-6" dir="rtl">
	<header class="space-y-1">
		<h1 class="text-2xl font-bold">إدارة محرّك Internet Archive</h1>
		<p class="text-sm text-gray-500">
			كلّ المحتوى يمرّ عبر هذه الصفحة → Firebase Storage → Firestore. التطبيق لا
			يتصل بـ archive.org؛ يظهر فقط ما اجتاز فلتر الترخيص والصيغة (PDF / MP3 /
			MP4) ويُرفع إلى Firebase.
		</p>
	</header>

	{#if engine && !engine.config?.enabled}
		<div class="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
			<strong>المحرّك متوقّف.</strong> لظهور المحتوى في التطبيق:
			<ol class="mt-2 list-decimal space-y-1 pr-5">
				<li>عدّل البذور أدناه (<code>mainId</code> / <code>subId</code> من أقسامك).</li>
				<li>احفظ البذور، ثم جرّب «استيراد» يدوياً من نتائج البحث.</li>
				<li>بعد نجاح تجريبي: «تشغيل» + نشر <code>CRON_SECRET</code> على Vercel.</li>
			</ol>
		</div>
	{/if}

	<!-- ── حالة المحرّك ───────────────────────────────────────── -->
	<section class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
		<div class="mb-3 flex items-center justify-between">
			<h2 class="text-lg font-semibold">حالة المحرّك</h2>
			<button class="text-sm text-blue-600" onclick={loadEngine}>تحديث</button>
		</div>
		{#if engineError}
			<p class="mb-2 rounded bg-red-50 p-2 text-sm text-red-700">{engineError}</p>
		{/if}
		{#if engineLoading}
			<p class="text-sm text-gray-500">جارٍ القراءة…</p>
		{:else if engine}
			<div class="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
				<div><strong>التشغيل:</strong> {engine.config?.enabled ? 'مفعّل' : 'متوقّف'}</div>
				<div><strong>قيد التنفيذ:</strong> {engine.currentTickInFlight ? 'نعم' : 'لا'}</div>
				<div><strong>إجمالي مستورد:</strong> {engine.stats?.totalImported ?? 0}</div>
				<div><strong>إجمالي تخطّى:</strong> {engine.stats?.totalSkipped ?? 0}</div>
				<div><strong>إجمالي فشل:</strong> {engine.stats?.totalFailed ?? 0}</div>
				<div><strong>عدد البذور:</strong> {engine.config?.seeds?.length ?? 0}</div>
				<div><strong>البذرة الحاليّة:</strong> {engine.currentSeed?.label || '—'}</div>
				<div><strong>مؤشّر الصفحة:</strong> {engine.cursor?.scrapeCursor ? 'في منتصف بذرة' : 'بداية بذرة'}</div>
			</div>
			<div class="mt-3 flex flex-wrap gap-2">
				<button class="rounded bg-green-600 px-3 py-1 text-sm text-white" onclick={() => onEngineAction('start')}>تشغيل</button>
				<button class="rounded bg-red-600 px-3 py-1 text-sm text-white" onclick={() => onEngineAction('stop')}>إيقاف</button>
				<button class="rounded bg-blue-600 px-3 py-1 text-sm text-white" onclick={() => onEngineAction('tick')}>دورة واحدة</button>
				<button class="rounded bg-gray-200 px-3 py-1 text-sm" onclick={() => onEngineAction('reset-cursor')}>إعادة المؤشّر</button>
				<button class="rounded bg-orange-700 px-3 py-1 text-sm text-white" onclick={() => onEngineAction('factory')}>إعادة ضبط المصنع</button>
			</div>
		{/if}
	</section>

	<!-- ── إدارة البذور ───────────────────────────────────────── -->
	<section class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
		<div class="mb-3 flex items-center justify-between">
			<h2 class="text-lg font-semibold">البذور (Seeds)</h2>
			<a class="text-xs text-blue-600" href="https://archive.org/services/search/v1/scrape" target="_blank" rel="noreferrer">مرجع Scraping API</a>
		</div>
		<p class="mb-2 text-xs text-gray-500">
			كلّ بذرة JSON: <code>id</code>، <code>label</code>،
			<code>hierarchy.{`{mainId, subId, secondaryId?}`}</code>، و حقول التضييق
			(<code>q</code>، <code>nebrasTypes</code>، <code>languages</code>،
			<code>collections</code>، <code>creators</code>). يتقدّم المحرّك على بذرة
			واحدة حتى يستنفد كلّ نتائجها قبل التحوّل للتاليّة.
		</p>
		<textarea
			class="h-56 w-full rounded border border-gray-300 p-2 font-mono text-sm"
			bind:value={seedsDraft}
			dir="ltr"
		></textarea>
		{#if seedsError}
			<p class="mt-2 rounded bg-red-50 p-2 text-sm text-red-700">{seedsError}</p>
		{/if}
		<button
			class="mt-2 rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
			disabled={seedsSaving}
			onclick={onSaveSeeds}
		>
			{seedsSaving ? 'جارٍ الحفظ…' : 'حفظ البذور'}
		</button>
	</section>

	<!-- ── بحث Internet Archive ───────────────────────────────── -->
	<section class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
		<h2 class="mb-3 text-lg font-semibold">بحث Internet Archive</h2>
		<div class="grid gap-3 md:grid-cols-2">
			<label class="text-sm">
				استعلام حرّ
				<input class="mt-1 w-full rounded border border-gray-300 p-2" bind:value={q} placeholder="مثلاً: فقه إسلامي" />
			</label>
			<label class="text-sm">
				اللغات (افصل بفواصل)
				<input class="mt-1 w-full rounded border border-gray-300 p-2" bind:value={languages} placeholder="Arabic" />
			</label>
			<label class="text-sm md:col-span-2">
				المجموعات (collections — افصل بفواصل)
				<input class="mt-1 w-full rounded border border-gray-300 p-2" bind:value={collections} placeholder="opensource_arabic, community_texts" />
			</label>
			<div class="text-sm">
				<span class="block">أنواع المحتوى</span>
				<div class="mt-1 flex gap-3">
					{#each NEBRAS_TYPES as t}
						<label class="flex items-center gap-1">
							<input type="checkbox" checked={nebrasTypes.includes(t)} onchange={() => toggleType(t)} />
							{NEBRAS_TYPE_LABELS[t]}
						</label>
					{/each}
				</div>
			</div>
			<label class="text-sm">
				عدد لكلّ صفحة
				<input class="mt-1 w-full rounded border border-gray-300 p-2" type="number" min="10" max="200" bind:value={count} />
			</label>
		</div>
		<div class="mt-3 flex gap-2">
			<button class="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50" disabled={searching} onclick={() => doSearch(true)}>
				{searching ? 'جارٍ البحث…' : 'بحث جديد'}
			</button>
			<button class="rounded bg-gray-200 px-3 py-1 text-sm disabled:opacity-50" disabled={searching || !cursor} onclick={() => doSearch(false)}>
				تحميل المزيد
			</button>
		</div>
		{#if searchError}
			<p class="mt-2 rounded bg-red-50 p-2 text-sm text-red-700">{searchError}</p>
		{/if}
		{#if results.length > 0}
			<p class="mt-3 text-xs text-gray-500">{results.length} من أصل {total} — {exhausted ? 'النتائج كاملة' : 'يوجد المزيد'}</p>
			<ul class="mt-2 divide-y rounded border border-gray-200">
				{#each results as r}
					<li class="flex items-center justify-between gap-3 p-2 text-sm">
						<div class="min-w-0">
							<div class="truncate font-medium">{r.title || r.identifier}</div>
							<div class="truncate text-xs text-gray-500">
								{r.creator || '—'} · {r.mediatype || '—'} · {r.licenseurl || r.rights || 'لا ترخيص'}
							</div>
						</div>
						<button class="shrink-0 rounded bg-blue-50 px-2 py-1 text-xs text-blue-700" onclick={() => doPreview(r.identifier)}>
							معاينة
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	<!-- ── معاينة + استيراد ───────────────────────────────────── -->
	<section class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
		<h2 class="mb-3 text-lg font-semibold">المعاينة والاستيراد اليدوي</h2>
		{#if !selectedIdentifier}
			<p class="text-sm text-gray-500">اختر عنصراً من نتائج البحث.</p>
		{:else if previewLoading}
			<p class="text-sm text-gray-500">جارٍ فحص الترخيص واختيار الملفّ…</p>
		{:else if previewError}
			<p class="rounded bg-red-50 p-2 text-sm text-red-700">{previewError}</p>
		{:else if preview}
			<div class="grid gap-3 md:grid-cols-2">
				<div>
					<img class="mb-2 max-h-48 rounded" src={preview.thumbnailUrl} alt={preview.title} />
					<div class="space-y-1 text-sm">
						<div><strong>العنوان:</strong> {preview.title}</div>
						<div><strong>المؤلّف:</strong> {preview.author || '—'}</div>
						<div><strong>النوع:</strong> {preview.nebrasContentType}</div>
						<div><strong>الملفّ:</strong> {preview.pickedFile.name} ({Math.round((preview.pickedFile.size || 0) / 1024 / 1024)} م.ب)</div>
						<div><strong>الترخيص:</strong> {preview.licenseInfo.licenseMatched || preview.licenseInfo.collection || '—'}</div>
					</div>
				</div>
				<div class="space-y-2">
					<label class="block text-sm">
						القسم الرئيسي
						<select class="mt-1 w-full rounded border border-gray-300 p-2" bind:value={targetMain}>
							<option value="">— اختر —</option>
							{#each sectionsTree as m}
								<option value={m.id}>{m.name}</option>
							{/each}
						</select>
					</label>
					<label class="block text-sm">
						القسم الفرعي
						<select class="mt-1 w-full rounded border border-gray-300 p-2" bind:value={targetSub} disabled={!targetMain}>
							<option value="">— اختر —</option>
							{#each subsForMain as s}
								<option value={s.id}>{s.name}</option>
							{/each}
						</select>
					</label>
					<label class="block text-sm">
						القسم الثانوي (اختياري)
						<select class="mt-1 w-full rounded border border-gray-300 p-2" bind:value={targetSecondary} disabled={!targetSub}>
							<option value="">— بدون —</option>
							{#each secondariesForSub as s}
								<option value={s.id}>{s.name}</option>
							{/each}
						</select>
					</label>
					<button
						class="mt-2 rounded bg-green-600 px-3 py-1 text-sm text-white disabled:opacity-50"
						disabled={importing}
						onclick={doImport}
					>
						{importing ? 'جارٍ الاستيراد…' : 'استيراد إلى نبراس'}
					</button>
					{#if importError}
						<p class="rounded bg-red-50 p-2 text-sm text-red-700">{importError}</p>
					{/if}
					{#if importMessage}
						<p class="rounded bg-green-50 p-2 text-sm text-green-700">{importMessage}</p>
					{/if}
				</div>
			</div>
		{/if}
	</section>

	<!-- ── سجلّ المحرّك ────────────────────────────────────────── -->
	{#if engine?.log?.length}
		<section class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
			<h2 class="mb-2 text-lg font-semibold">سجلّ المحرّك</h2>
			<ul class="space-y-1 text-xs">
				{#each engine.log as e}
					<li class="rounded p-1 {e.level === 'error' ? 'bg-red-50 text-red-800' : e.level === 'warn' ? 'bg-yellow-50 text-yellow-800' : 'bg-gray-50'}">
						<span class="font-mono text-gray-500">{new Date(e.ts).toLocaleTimeString()}</span>
						·
						<span>{e.message}</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>
