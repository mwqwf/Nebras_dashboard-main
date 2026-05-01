<!--
  Import Noor — واجهة محرك جلب المحتوى من مكتبة نور.
  تشغيل محلّي: يجلب كتب حقيقية عبر Puppeteer ← يصنّف بـ Gemini ← ينشئ أقسام ← يخزّن.
-->

<script>
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n/store.svelte.js';

	let status = $state(null);
	let isRunning = $state(false);
	let progressLog = $state([]);
	let results = $state(null);
	let error = $state('');

	let category = $state('Islamic-Fiqh');
	let limit = $state(5);
	let fetchDetails = $state(true);

	let showResetConfirm = $state(false);
	let resetResult = $state(null);
	let isResetting = $state(false);

	let loading = $state(true);

	const CATEGORIES = [
		{ slug: 'Islamic-Fiqh', name: 'الفقه الإسلامي' },
		{ slug: 'Interpretation-of-the-Koran', name: 'تفسير القرآن الكريم' },
		{ slug: 'The-Holy-Quran', name: 'القرآن الكريم' },
		{ slug: 'Islamic-Ethics-and-Ethics', name: 'الأخلاق والآداب الإسلامية' },
		{ slug: 'Islamic-culture', name: 'الثقافة الإسلامية' },
		{ slug: 'Islamic-faith', name: 'العقيدة الإسلامية' },
		{ slug: 'Islamic-history', name: 'التاريخ الإسلامي' },
		{ slug: 'Monotheism', name: 'التوحيد' },
		{ slug: 'Hadiths-of-judgments', name: 'أحاديث الأحكام' },
		{ slug: 'Islamic-philosophy', name: 'الفلسفة الإسلامية' },
		{ slug: 'Arabic-grammar-and-Arabic-grammar', name: 'النحو العربي' },
		{ slug: 'Arabic-rhetoric', name: 'البلاغة العربية' },
		{ slug: 'Human-development-and-self-development', name: 'تطوير الذات' },
		{ slug: 'Sociology', name: 'علم الاجتماع' },
		{ slug: 'Psychology', name: 'علم النفس' },
		{ slug: 'Islamic-Sharia-provisions', name: 'أحكام الشريعة الإسلامية' },
		{ slug: 'Tajweed-and-readings', name: 'التجويد والقراءات' },
		{ slug: 'Sciences-of-the-Holy-Quran', name: 'علوم القرآن الكريم' },
		{ slug: 'Explanation-of-hadiths', name: 'شرح الأحاديث' },
		{ slug: 'Islamic-call', name: 'الدعوة الإسلامية' },
	];

	onMount(async () => {
		await loadStatus();
		loading = false;
	});

	async function loadStatus() {
		try {
			const res = await fetch('/api/noor-engine');
			if (res.ok) {
				const data = await res.json();
				status = data;
				if (data.isRunning) isRunning = true;
				if (data.progressLog) progressLog = data.progressLog;
			}
		} catch {}
	}

	async function startEngine() {
		if (isRunning) return;
		isRunning = true;
		error = '';
		results = null;
		progressLog = [];

		try {
			const res = await fetch('/api/noor-engine', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ category, limit, fetchDetails })
			});
			const data = await res.json();
			if (!res.ok) {
				error = data.error || 'فشل تشغيل المحرك';
			} else {
				results = data;
			}
		} catch (err) {
			error = err?.message || 'خطأ في الشبكة';
		} finally {
			isRunning = false;
			await loadStatus();
		}
	}

	async function executeReset() {
		isResetting = true;
		resetResult = null;
		try {
			const res = await fetch('/api/noor-engine/reset', { method: 'DELETE' });
			const data = await res.json();
			resetResult = data;
		} catch (err) {
			resetResult = { error: err?.message };
		} finally {
			isResetting = false;
			showResetConfirm = false;
		}
	}

	function formatTime(iso) {
		if (!iso) return '—';
		try { return new Date(iso).toLocaleString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch { return iso; }
	}
</script>

<svelte:head><title>استيراد مكتبة نور — Nebras</title></svelte:head>

<div class="noor-page">
	<div class="page-header">
		<div>
			<h1 class="page-title">📚 محرك جلب المحتوى — مكتبة نور</h1>
			<p class="page-desc">جلب كتب حقيقية من noor-book.com ← تصنيف ذكي بـ Gemini ← إنشاء أقسام تلقائياً ← تخزين في قاعدة البيانات</p>
		</div>
		<button class="btn-reset" onclick={() => showResetConfirm = true} disabled={isResetting}>
			🗑️ إعادة ضبط المصنع (مسح الفوضى)
		</button>
	</div>

	{#if loading}
		<div class="loading"><div class="spinner"></div>جاري التحميل...</div>
	{:else}
		<!-- Engine Control -->
		<div class="control-card">
			<h2>⚙️ تشغيل المحرك</h2>
			<div class="form">
				<div class="form-row">
					<div class="fg">
						<label>التصنيف (من مكتبة نور)</label>
						<select bind:value={category}>
							{#each CATEGORIES as c}
								<option value={c.slug}>{c.name}</option>
							{/each}
						</select>
					</div>
					<div class="fg fg-sm">
						<label>عدد الكتب</label>
						<input type="number" bind:value={limit} min="1" max="50" />
					</div>
					<div class="fg fg-check">
						<label class="toggle-switch">
							<input type="checkbox" class="toggle-input" bind:checked={fetchDetails} />
							<span class="toggle-slider"></span>
							<span class="toggle-label">جلب التفاصيل الكاملة</span>
						</label>
					</div>
				</div>
				<button class="btn-start" onclick={startEngine} disabled={isRunning}>
					{#if isRunning}
						<span class="btn-sp"></span>جاري التنفيذ...
					{:else}
						🚀 بدء الجلب والتخزين
					{/if}
				</button>
			</div>
		</div>

		<!-- Error -->
		{#if error}
			<div class="alert-err">❌ {error}</div>
		{/if}

		<!-- Results -->
		{#if results}
			<div class="results-card">
				<h3>📊 النتائج</h3>
				<div class="results-summary">
					<div class="rs rs-ok"><span class="rs-num">{results.stored}</span><span class="rs-label">مُخزّن</span></div>
					<div class="rs rs-err"><span class="rs-num">{results.errors}</span><span class="rs-label">أخطاء</span></div>
					<div class="rs rs-sec"><span class="rs-num">{results.sectionsCreated}</span><span class="rs-label">أقسام جديدة</span></div>
				</div>

				{#if results.results?.stored?.length > 0}
					<h4>الكتب المُخزّنة:</h4>
					<div class="tw">
						<table class="dt">
							<thead><tr><th>العنوان</th><th>القسم الرئيسي</th><th>القسم الفرعي</th><th>القرار</th><th>الثقة</th></tr></thead>
							<tbody>
								{#each results.results.stored as b}
									<tr>
										<td class="tdt">{b.title}</td>
										<td>{b.mainSection || '—'}</td>
										<td>{b.subSection || '—'}</td>
										<td><span class="badge">{b.decision}</span></td>
										<td style="color: {b.confidence >= 70 ? 'var(--color-primary-400)' : b.confidence >= 40 ? 'var(--color-gold-400)' : 'var(--color-danger-400)'}">{b.confidence}%</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}

				{#if results.results?.errors?.length > 0}
					<h4 style="margin-top:1rem">الأخطاء:</h4>
					{#each results.results.errors as e}
						<div class="err-item">❌ <strong>{e.title}</strong>: {e.error}</div>
					{/each}
				{/if}
			</div>
		{/if}

		<!-- Progress Log -->
		{#if progressLog.length > 0}
			<div class="log-card">
				<h3>📋 سجلّ التنفيذ ({progressLog.length})</h3>
				<div class="log-list">
					{#each progressLog as entry}
						<div class="log-item" class:log-ok={entry.type === 'stored' || entry.type === 'complete'} class:log-err={entry.type === 'error'} class:log-warn={entry.type === 'warn'} class:log-sec={entry.type === 'created' || entry.type === 'sections'}>
							<span class="log-time">{formatTime(entry.time)}</span>
							<span class="log-msg">{entry.message}</span>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Reset Result -->
		{#if resetResult}
			<div class="reset-result" class:reset-ok={resetResult.success} class:reset-fail={resetResult.error}>
				{#if resetResult.success}
					✅ {resetResult.message}
					<div class="reset-details">
						حُذف: {resetResult.report.deletedSections.main} رئيسي، {resetResult.report.deletedSections.sub} فرعي، {resetResult.report.deletedSections.secondary} ثانوي، {resetResult.report.deletedFiles} ملف
					</div>
				{:else}
					❌ {resetResult.error}
				{/if}
			</div>
		{/if}
	{/if}

	<!-- Reset Confirmation Dialog -->
	{#if showResetConfirm}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="modal-overlay" onclick={() => showResetConfirm = false}>
			<div class="modal" onclick={(e) => e.stopPropagation()}>
				<h3>⚠️ تأكيد إعادة الضبط</h3>
				<p>سيتمّ مسح <strong>كلّ</strong> ما أنشأه محرك مكتبة نور:</p>
				<ul>
					<li>جميع الأقسام المُنشأة تلقائياً (رئيسية + فرعية + ثانوية)</li>
					<li>جميع الكتب/الملفات المجلوبة</li>
					<li>سجلّات noor_library_registry و cursor</li>
				</ul>
				<p class="warn-text">⛔ هذا الإجراء لا يمكن التراجع عنه!</p>
				<div class="modal-actions">
					<button class="btn-cancel" onclick={() => showResetConfirm = false}>إلغاء</button>
					<button class="btn-danger" onclick={executeReset} disabled={isResetting}>
						{isResetting ? '⏳ جاري المسح...' : '🗑️ نعم، امسح كلّ شيء'}
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.noor-page { max-width: 1100px; }
	.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; gap: 1rem; flex-wrap: wrap; }
	.page-title { font-size: 1.375rem; font-weight: 700; color: var(--color-surface-100); }
	.page-desc { font-size: .8125rem; color: var(--color-surface-400); margin-top: .25rem; }

	.btn-reset { padding: .5rem 1rem; background: rgba(220, 38, 38, .15); border: 1px solid rgba(220, 38, 38, .4); color: #fca5a5; border-radius: 8px; font-size: .8125rem; font-weight: 600; cursor: pointer; font-family: inherit; transition: all .15s; }
	.btn-reset:hover:not(:disabled) { background: rgba(220, 38, 38, .25); color: #fecaca; }
	.btn-reset:disabled { opacity: .5; cursor: not-allowed; }

	.loading { display: flex; align-items: center; justify-content: center; gap: .75rem; padding: 4rem 0; color: var(--color-surface-400); }
	.spinner { width: 22px; height: 22px; border: 2px solid var(--color-surface-600); border-top-color: var(--color-primary-400); border-radius: 50%; animation: spinner .8s linear infinite; }

	.control-card { background: var(--color-surface-800); border: 1px solid var(--color-surface-700); border-radius: 12px; padding: 1.25rem 1.5rem; margin-bottom: 1.5rem; }
	.control-card h2 { font-size: 1rem; font-weight: 600; color: var(--color-surface-200); margin-bottom: 1rem; }
	.form { display: flex; flex-direction: column; gap: 1rem; }
	.form-row { display: flex; gap: 1rem; flex-wrap: wrap; align-items: flex-end; }
	.fg { display: flex; flex-direction: column; gap: .375rem; flex: 1; min-width: 180px; }
	.fg-sm { flex: 0 0 100px; min-width: 80px; }
	.fg-check { flex: 0 0 auto; justify-content: flex-end; }
	.fg label { font-size: .75rem; font-weight: 600; color: var(--color-surface-400); }
	.fg select, .fg input { padding: .5rem .75rem; background: var(--color-surface-900); border: 1px solid var(--color-surface-600); border-radius: 8px; color: var(--color-surface-100); font-size: .8125rem; font-family: inherit; }

	.btn-start { align-self: flex-start; padding: .75rem 2rem; background: linear-gradient(135deg, var(--color-primary-600), var(--color-primary-700)); color: #fff; border: none; border-radius: 10px; font-size: .9375rem; font-weight: 700; cursor: pointer; font-family: inherit; transition: all .2s; }
	.btn-start:hover:not(:disabled) { box-shadow: 0 0 24px rgba(5, 150, 105, .3); }
	.btn-start:disabled { opacity: .5; cursor: not-allowed; }
	.btn-sp { display: inline-block; width: 16px; height: 16px; border: 2px solid rgba(255,255,255,.3); border-top-color: #fff; border-radius: 50%; animation: spinner .8s linear infinite; margin-inline-end: .5rem; vertical-align: middle; }

	.alert-err { background: rgba(244, 63, 94, .1); border: 1px solid rgba(244, 63, 94, .25); color: var(--color-danger-400); padding: .75rem 1rem; border-radius: 10px; margin-bottom: 1rem; font-size: .8125rem; }

	.results-card { background: var(--color-surface-800); border: 1px solid var(--color-surface-700); border-radius: 12px; padding: 1.25rem 1.5rem; margin-bottom: 1.5rem; }
	.results-card h3 { font-size: 1rem; font-weight: 600; color: var(--color-surface-200); margin-bottom: 1rem; }
	.results-card h4 { font-size: .8125rem; font-weight: 600; color: var(--color-surface-300); margin-bottom: .5rem; }
	.results-summary { display: flex; gap: 1.5rem; margin-bottom: 1.25rem; flex-wrap: wrap; }
	.rs { display: flex; flex-direction: column; align-items: center; padding: .75rem 1.5rem; border-radius: 10px; min-width: 90px; }
	.rs-ok { background: rgba(16, 185, 129, .1); border: 1px solid rgba(16, 185, 129, .25); }
	.rs-err { background: rgba(244, 63, 94, .1); border: 1px solid rgba(244, 63, 94, .25); }
	.rs-sec { background: rgba(251, 191, 36, .1); border: 1px solid rgba(251, 191, 36, .25); }
	.rs-num { font-size: 1.5rem; font-weight: 800; }
	.rs-ok .rs-num { color: var(--color-primary-400); } .rs-err .rs-num { color: var(--color-danger-400); } .rs-sec .rs-num { color: var(--color-gold-400); }
	.rs-label { font-size: .6875rem; color: var(--color-surface-400); margin-top: 4px; }

	.tw { overflow-x: auto; } .dt { width: 100%; border-collapse: collapse; font-size: .8125rem; }
	.dt th { text-align: start; padding: .5rem .75rem; color: var(--color-surface-400); font-weight: 600; font-size: .6875rem; text-transform: uppercase; border-bottom: 1px solid var(--color-surface-700); }
	.dt td { padding: .5rem .75rem; color: var(--color-surface-200); border-bottom: 1px solid var(--color-surface-800); }
	.dt tbody tr:hover { background: var(--color-surface-800); }
	.tdt { font-weight: 600; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.badge { display: inline-block; padding: .15rem .4rem; border-radius: 4px; font-size: .625rem; font-weight: 600; background: rgba(99, 102, 241, .15); color: #a5b4fc; }

	.err-item { font-size: .8125rem; color: var(--color-danger-400); padding: .375rem 0; }

	.log-card { background: var(--color-surface-800); border: 1px solid var(--color-surface-700); border-radius: 12px; padding: 1.25rem 1.5rem; margin-bottom: 1.5rem; }
	.log-card h3 { font-size: .875rem; font-weight: 600; color: var(--color-surface-300); margin-bottom: .75rem; }
	.log-list { max-height: 350px; overflow-y: auto; display: flex; flex-direction: column; gap: 3px; }
	.log-item { display: flex; gap: .75rem; padding: .375rem .5rem; border-radius: 6px; font-size: .75rem; background: var(--color-surface-900); }
	.log-ok { border-inline-start: 3px solid var(--color-primary-500); }
	.log-err { border-inline-start: 3px solid var(--color-danger-500); }
	.log-warn { border-inline-start: 3px solid var(--color-gold-500); }
	.log-sec { border-inline-start: 3px solid #818cf8; }
	.log-time { color: var(--color-surface-500); flex-shrink: 0; font-size: .6875rem; min-width: 60px; }
	.log-msg { color: var(--color-surface-200); }

	.reset-result { padding: .75rem 1rem; border-radius: 10px; margin-bottom: 1rem; font-size: .8125rem; }
	.reset-ok { background: rgba(16, 185, 129, .1); border: 1px solid rgba(16, 185, 129, .25); color: var(--color-primary-300); }
	.reset-fail { background: rgba(244, 63, 94, .1); border: 1px solid rgba(244, 63, 94, .25); color: var(--color-danger-400); }
	.reset-details { font-size: .75rem; color: var(--color-surface-400); margin-top: .375rem; }

	/* Modal */
	.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.7); z-index: 100; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); }
	.modal { background: var(--color-surface-800); border: 1px solid var(--color-surface-600); border-radius: 16px; padding: 1.5rem 2rem; max-width: 480px; width: 90%; }
	.modal h3 { font-size: 1.125rem; font-weight: 700; color: var(--color-surface-100); margin-bottom: .75rem; }
	.modal p { font-size: .875rem; color: var(--color-surface-300); margin-bottom: .5rem; }
	.modal ul { padding-inline-start: 1.25rem; margin-bottom: .75rem; font-size: .8125rem; color: var(--color-surface-400); }
	.modal li { margin-bottom: .25rem; }
	.warn-text { color: var(--color-danger-400); font-weight: 600; }
	.modal-actions { display: flex; gap: .75rem; justify-content: flex-end; margin-top: 1.25rem; }
	.btn-cancel { padding: .5rem 1.25rem; background: var(--color-surface-700); border: 1px solid var(--color-surface-600); color: var(--color-surface-200); border-radius: 8px; cursor: pointer; font-family: inherit; font-weight: 500; }
	.btn-danger { padding: .5rem 1.25rem; background: rgba(220, 38, 38, .8); border: none; color: #fff; border-radius: 8px; cursor: pointer; font-family: inherit; font-weight: 600; }
	.btn-danger:hover { background: rgba(220, 38, 38, 1); }
	.btn-danger:disabled { opacity: .5; }
</style>
