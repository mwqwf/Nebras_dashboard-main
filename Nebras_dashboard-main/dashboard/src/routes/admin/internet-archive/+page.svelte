<!--
  /admin/internet-archive — تشغيل آليّ كامل من زرّ واحد.

  ⚠️ الصفحة موجَّهة لـ owner/supervisor فقط. التطبيق (Flutter) لا يفتح
  هذه الصفحة ولا يعرف بوجودها. المستخدم العاديّ يرى المحتوى مدرجاً تحت
  أقسامه كأنّه مرفوع يدوياً.

  السلوك الافتراضي: زرّ واحد ⇒ بذور افتراضية + enable + أوّل tick فوريّ.
  الإعدادات المتقدّمة (محرّر JSON، استيراد عنصر مفرد) مخفيّة خلف زرّ
  "إعدادات متقدّمة".
-->

<script>
	import { onMount, onDestroy } from 'svelte';
	import {
		getEngineStatus,
		startEngine,
		stopEngine,
		runOneTick,
		bootstrapEngine,
		resetEngine,
		updateSeeds,
		previewItem,
		importItem,
		diagnoseEngine
	} from '$lib/api/internetArchive.js';

	let engine = $state(/** @type {any} */ (null));
	let loading = $state(false);
	let error = $state('');
	let busyAction = $state('');

	let showAdvanced = $state(false);
	let seedsDraft = $state('');
	let seedsSaving = $state(false);
	let seedsError = $state('');

	// استيراد فردي اختياري
	let manualIdentifier = $state('');
	let manualBusy = $state(false);
	let manualResult = $state('');
	let manualError = $state('');

	// تشخيص
	let diagBusy = $state(false);
	let diagReport = $state(/** @type {any} */ (null));
	let diagError = $state('');

	async function doDiagnose() {
		diagBusy = true;
		diagError = '';
		diagReport = null;
		try {
			diagReport = await diagnoseEngine();
		} catch (err) {
			diagError = err?.message || 'فشل التشخيص.';
		} finally {
			diagBusy = false;
			await loadStatus();
		}
	}

	/** auto-refresh مرّة كلّ 8 ثوانٍ ما دامت الصفحة مفتوحة. */
	let pollTimer;

	async function loadStatus() {
		loading = true;
		error = '';
		try {
			const r = await getEngineStatus();
			engine = r.status;
			if (!seedsDraft) {
				seedsDraft = JSON.stringify(engine?.config?.seeds || [], null, 2);
			}
		} catch (err) {
			error = err?.message || 'تعذّر قراءة حالة المحرّك.';
		} finally {
			loading = false;
		}
	}

	/**
	 * عند فتح الصفحة لأوّل مرّة: نقرأ الحالة، ثمّ إن لم يوجد محتوى مستورَد
	 * نُطلق tick متزامن مباشرة (لا ننتظر Cron). هذا يضمن: المستخدم يفتح
	 * الصفحة، خلال 10-30 ثانية يرى أوّل عناصر تظهر في "آخر الأحداث" ثمّ
	 * تنتقل إلى Firestore ثمّ تظهر في التطبيق.
	 */
	async function autoTriggerIfEmpty() {
		await loadStatus();
		if (engine?.config?.enabled && (engine?.stats?.totalImported ?? 0) === 0) {
			// لا تُظهر "busy" عريضاً — فقط شغّل tick في الخلفية.
			try {
				await runOneTick();
				await loadStatus();
			} catch {
				/* الأخطاء تظهر في سجلّ المحرّك */
			}
		}
	}

	onMount(() => {
		autoTriggerIfEmpty();
		pollTimer = setInterval(loadStatus, 8000);
	});
	onDestroy(() => {
		if (pollTimer) clearInterval(pollTimer);
	});

	async function doAction(action) {
		busyAction = action;
		error = '';
		try {
			if (action === 'bootstrap') await bootstrapEngine();
			else if (action === 'start') await startEngine();
			else if (action === 'stop') await stopEngine();
			else if (action === 'tick') await runOneTick();
			else if (action === 'reset-cursor') await resetEngine('cursor');
			else if (action === 'factory') {
				if (
					!confirm(
						'سيُمحى كلّ ما رفعه محرّك Internet Archive (مع الأقسام التي أنشأها). الرفع اليدوي لن يتأثّر. متابعة؟'
					)
				)
					return;
				await resetEngine('factory');
			}
			await loadStatus();
		} catch (err) {
			error = err?.message || 'فشل الإجراء.';
		} finally {
			busyAction = '';
		}
	}

	async function onSaveSeeds() {
		seedsSaving = true;
		seedsError = '';
		try {
			const parsed = JSON.parse(seedsDraft || '[]');
			if (!Array.isArray(parsed)) throw new Error('JSON ليس مصفوفة.');
			const r = await updateSeeds(parsed);
			seedsDraft = JSON.stringify(r.config.seeds || [], null, 2);
			await loadStatus();
		} catch (err) {
			seedsError = err?.message || 'JSON غير صالح.';
		} finally {
			seedsSaving = false;
		}
	}

	async function doManualImport() {
		manualBusy = true;
		manualError = '';
		manualResult = '';
		try {
			const r = await importItem({ identifier: manualIdentifier.trim() });
			manualResult = `تمّ: ${r.result?.title || manualIdentifier} → ${r.result?.hierarchy?.main?.name || ''} › ${r.result?.hierarchy?.sub?.name || ''}`;
			manualIdentifier = '';
			await loadStatus();
		} catch (err) {
			manualError = err?.message || 'فشل الاستيراد.';
		} finally {
			manualBusy = false;
		}
	}

	const isFresh = $derived(!engine || engine?.stats?.totalImported === 0);
	const isEnabled = $derived(Boolean(engine?.config?.enabled));
</script>

<div class="space-y-6 p-6" dir="rtl">
	<header class="space-y-1">
		<h1 class="text-2xl font-bold">إدارة المحرّك الآليّ</h1>
		<p class="text-sm text-gray-500">
			كلّ شيء آليّ. اضغط زرّ التشغيل التلقائي، وسيظهر محتوى في التطبيق خلال
			ثوانٍ — بدون أيّ تدخّل يدويّ. التطبيق لا يعلم بمصدر الجلب ولا توجد روابط
			خارجيّة.
		</p>
	</header>

	{#if error}
		<p class="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>
	{/if}

	<!-- ── زرّ التشغيل الرئيسي ───────────────────────────────── -->
	<section
		class="rounded-xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-6 shadow-sm"
	>
		{#if isFresh && !isEnabled}
			<div class="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h2 class="text-lg font-semibold text-emerald-900">المحرّك جاهز للتشغيل التلقائي</h2>
					<p class="mt-1 text-sm text-emerald-800">
						سنُهيّء بذوراً افتراضيّة (كتب عربية / صوتيات / فيديو من مصادر مفتوحة)،
						نُفعّل المحرّك، ونطلق أوّل دورة فوراً. التصنيف يحدث آلياً والأقسام
						تُنشأ تلقائياً.
					</p>
				</div>
				<button
					class="rounded-lg bg-emerald-600 px-5 py-3 text-base font-semibold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
					disabled={busyAction === 'bootstrap'}
					onclick={() => doAction('bootstrap')}
				>
					{busyAction === 'bootstrap' ? 'جارٍ التشغيل…' : '▶ تشغيل تلقائي كامل'}
				</button>
			</div>
		{:else}
			<div class="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
				<div>
					<div class="text-gray-500">الحالة</div>
					<div class="text-base font-semibold {isEnabled ? 'text-emerald-700' : 'text-gray-700'}">
						{isEnabled ? 'يعمل آلياً' : 'متوقّف'}
					</div>
				</div>
				<div>
					<div class="text-gray-500">مستورد</div>
					<div class="text-base font-semibold">{engine?.stats?.totalImported ?? 0}</div>
				</div>
				<div>
					<div class="text-gray-500">أقسام جديدة</div>
					<div class="text-base font-semibold">{engine?.stats?.sectionsCreated ?? 0}</div>
				</div>
				<div>
					<div class="text-gray-500">آخر دورة</div>
					<div class="text-base font-semibold">
						{engine?.stats?.lastRunAt
							? new Date(engine.stats.lastRunAt).toLocaleTimeString()
							: '—'}
					</div>
				</div>
				<div>
					<div class="text-gray-500">البذرة الحاليّة</div>
					<div class="text-sm">{engine?.currentSeed?.label || engine?.currentSeed?.id || '—'}</div>
				</div>
				<div>
					<div class="text-gray-500">قيد التنفيذ</div>
					<div class="text-sm">{engine?.currentTickInFlight ? 'نعم' : 'لا'}</div>
				</div>
				<div>
					<div class="text-gray-500">تخطّى</div>
					<div class="text-sm">{engine?.stats?.totalSkipped ?? 0}</div>
				</div>
				<div>
					<div class="text-gray-500">فشل</div>
					<div class="text-sm">{engine?.stats?.totalFailed ?? 0}</div>
				</div>
			</div>
			<div class="mt-4 flex flex-wrap gap-2">
				{#if isEnabled}
					<button
						class="rounded bg-red-600 px-3 py-1 text-sm text-white disabled:opacity-50"
						disabled={busyAction === 'stop'}
						onclick={() => doAction('stop')}
					>
						إيقاف
					</button>
				{:else}
					<button
						class="rounded bg-emerald-600 px-3 py-1 text-sm text-white disabled:opacity-50"
						disabled={busyAction === 'start'}
						onclick={() => doAction('start')}
					>
						تشغيل
					</button>
				{/if}
				<button
					class="rounded bg-blue-600 px-3 py-1 text-sm text-white disabled:opacity-50"
					disabled={busyAction === 'tick'}
					onclick={() => doAction('tick')}
				>
					جلب دفعة الآن
				</button>
				<button
					class="rounded bg-purple-600 px-3 py-1 text-sm text-white disabled:opacity-50"
					disabled={diagBusy}
					onclick={doDiagnose}
				>
					{diagBusy ? 'جارٍ الفحص…' : 'فحص النظام'}
				</button>
				<button
					class="rounded bg-gray-200 px-3 py-1 text-sm disabled:opacity-50"
					disabled={busyAction === 'reset-cursor'}
					onclick={() => doAction('reset-cursor')}
				>
					إعادة المؤشّر
				</button>
				<button
					class="rounded bg-orange-700 px-3 py-1 text-sm text-white disabled:opacity-50"
					disabled={busyAction === 'factory'}
					onclick={() => doAction('factory')}
				>
					إعادة ضبط المصنع
				</button>
			</div>
		{/if}
	</section>

	<!-- ── سجلّ المحرّك ───────────────────────────────────────── -->
	{#if engine?.log?.length}
		<section class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
			<h2 class="mb-2 text-lg font-semibold">آخر الأحداث</h2>
			<ul class="max-h-72 space-y-1 overflow-auto text-xs">
				{#each engine.log as e}
					<li
						class="rounded p-1 {e.level === 'error'
							? 'bg-red-50 text-red-800'
							: e.level === 'warn'
								? 'bg-yellow-50 text-yellow-800'
								: e.level === 'success'
									? 'bg-emerald-50 text-emerald-900'
									: 'bg-gray-50'}"
					>
						<span class="font-mono text-gray-500">{new Date(e.ts).toLocaleTimeString()}</span>
						·
						<span>{e.message}</span>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<!-- ── تقرير التشخيص ────────────────────────────────────── -->
	{#if diagError}
		<section class="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
			فشل التشخيص: {diagError}
		</section>
	{/if}
	{#if diagReport}
		<section class="rounded-lg border border-purple-200 bg-purple-50 p-4">
			<h2 class="mb-3 text-lg font-semibold text-purple-900">تقرير الفحص الفنّي</h2>
			<div class="grid gap-2 text-sm md:grid-cols-2">
				<div>
					<strong>Firebase Admin:</strong>
					{diagReport.firebase?.adminConfigured ? 'مهيَّأ' : 'غير مهيَّأ ❌'}
				</div>
				<div><strong>projectId:</strong> {diagReport.firebase?.projectId || '—'}</div>
				<div>
					<strong>Storage bucket:</strong>
					{diagReport.firebase?.storageBucket || diagReport.env?.NEBRAS_STORAGE_BUCKET || 'غير مضبوط ❌'}
				</div>
				<div>
					<strong>CRON_SECRET:</strong>
					{diagReport.env?.CRON_SECRET ? 'مضبوط ✓' : 'غير مضبوط ❌'}
				</div>
				<div>
					<strong>config في RTDB:</strong>
					{diagReport.rtdb?.ia_library_engine_config_exists ? 'موجود ✓' : 'غير موجود ❌'}
				</div>
				<div>
					<strong>enabled:</strong>
					{String(diagReport.rtdb?.ia_library_engine_enabled)}
				</div>
				<div><strong>عدد البذور:</strong> {diagReport.rtdb?.ia_library_engine_seeds_count}</div>
				<div>
					<strong>عناصر مستوردة (registry):</strong>
					{diagReport.rtdb?.ia_library_registry_count}
				</div>
				<div>
					<strong>IA reachable:</strong>
					{diagReport.ia_api?.sample_total != null
						? `نعم (${diagReport.ia_api.sample_total} نتيجة)`
						: 'لا ❌'}
				</div>
				<div>
					<strong>أوّل identifier:</strong>
					<code class="text-xs">{diagReport.ia_api?.sample_first_identifier || '—'}</code>
				</div>
			</div>
			{#if diagReport.ia_api?.error}
				<div class="mt-3 rounded bg-red-100 p-2 text-xs text-red-800">
					<strong>IA API error:</strong> {diagReport.ia_api.error.message}
				</div>
			{/if}
			{#if diagReport.tickError}
				<div class="mt-3 rounded bg-red-100 p-2 text-xs text-red-800">
					<strong>Tick error ({diagReport.tickError.reason}):</strong>
					{diagReport.tickError.message}
					<pre class="mt-1 overflow-auto whitespace-pre-wrap text-[10px]">{diagReport.tickError.stack}</pre>
				</div>
			{:else if diagReport.tickResult}
				<div class="mt-3 rounded bg-emerald-100 p-2 text-xs text-emerald-900">
					<strong>Tick نجح:</strong>
					معالَج {diagReport.tickResult.processed}، تخطّى {diagReport.tickResult.skipped}،
					فشل {diagReport.tickResult.failed}، أقسام جديدة {diagReport.tickResult.sectionsCreated}
				</div>
			{/if}
			<details class="mt-3">
				<summary class="cursor-pointer text-xs text-purple-700">JSON الكامل (للنسخ)</summary>
				<pre class="mt-2 max-h-96 overflow-auto rounded bg-white p-2 text-[10px]" dir="ltr">{JSON.stringify(
						diagReport,
						null,
						2
					)}</pre>
			</details>
		</section>
	{/if}

	<!-- ── إعدادات متقدّمة (مخفيّة افتراضياً) ────────────────── -->
	<section class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
		<button
			class="flex w-full items-center justify-between text-sm font-semibold text-gray-700"
			onclick={() => (showAdvanced = !showAdvanced)}
		>
			<span>إعدادات متقدّمة</span>
			<span>{showAdvanced ? '−' : '+'}</span>
		</button>

		{#if showAdvanced}
			<div class="mt-4 space-y-6">
				<!-- محرّر البذور (اختياري — للمستخدم المتقدّم فقط) -->
				<div>
					<h3 class="mb-2 text-sm font-semibold">البذور (JSON)</h3>
					<p class="mb-2 text-xs text-gray-500">
						يمكن إضافة بذور إضافيّة (استعلام، collections، nebrasTypes). كلّ بذرة لا
						تحتاج <code>hierarchy</code> — التصنيف آليّ.
					</p>
					<textarea
						class="h-56 w-full rounded border border-gray-300 p-2 font-mono text-xs"
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
				</div>

				<!-- استيراد فرديّ (اختياري — التصنيف آليّ أيضاً) -->
				<div>
					<h3 class="mb-2 text-sm font-semibold">استيراد عنصر بمعرّفه</h3>
					<p class="mb-2 text-xs text-gray-500">
						أدخل <code>identifier</code> من archive.org (مثل
						<code>islamicbooks_archive_abc</code>). يصنّف ويُنشئ قسماً تلقائياً إن لزم.
					</p>
					<div class="flex gap-2">
						<input
							class="flex-1 rounded border border-gray-300 p-2 text-sm"
							placeholder="archive.org identifier"
							bind:value={manualIdentifier}
							dir="ltr"
						/>
						<button
							class="rounded bg-emerald-600 px-3 py-1 text-sm text-white disabled:opacity-50"
							disabled={manualBusy || !manualIdentifier.trim()}
							onclick={doManualImport}
						>
							{manualBusy ? 'جارٍ…' : 'استيراد'}
						</button>
					</div>
					{#if manualError}
						<p class="mt-2 rounded bg-red-50 p-2 text-sm text-red-700">{manualError}</p>
					{/if}
					{#if manualResult}
						<p class="mt-2 rounded bg-emerald-50 p-2 text-sm text-emerald-800">{manualResult}</p>
					{/if}
				</div>
			</div>
		{/if}
	</section>
</div>
