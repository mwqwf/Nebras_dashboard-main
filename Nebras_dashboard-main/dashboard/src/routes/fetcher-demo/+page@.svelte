<!--
  Fetcher Demo — عرض كامل لمحرك الجلب: جلب → تصنيف → إنشاء أقسام → تخزين.
  يستخدم +page@.svelte لتجاوز سلسلة التخطيطات (reset layout).
-->

<script>
	import { onMount } from 'svelte';
	import { setLanguage, getLanguage, getDir } from '$lib/i18n/store.svelte.js';
	import { t } from '$lib/i18n/store.svelte.js';
	import { initFirebase } from '$lib/firebase/client.js';
	import { runFullPipeline, listLocalMainSections, listLocalSubSections, listLocalFiles, getLocalStats } from '$lib/fetcher/fetcherEngine.js';
	import '../../app.css';

	let currentDir = $derived(getDir());
	let localSections = $state({ main: [], sub: [] });
	let localFiles = $state([]);
	let localStats = $state({ mainSections: 0, subSections: 0, files: 0 });

	let providers = $state([]);
	let categories = $state([]);
	let stats = $state({ totalAdded: 0, totalErrors: 0, activeJobs: 0, lastJobTime: null });
	let recentJobs = $state([]);
	let successLogs = $state([]);
	let errorLogs = $state([]);
	let successTotal = $state(0);
	let errorTotal = $state(0);

	let selectedProvider = $state('');
	let selectedCategory = $state('');
	let fetchLimit = $state(3);
	let isFetching = $state(false);
	let loading = $state(true);

	let pipelineResults = $state(null);
	let pipelineProgress = $state([]);
	let activeTab = $state('overview');

	onMount(async () => {
		setLanguage(getLanguage());
		await initFirebase();
		await loadDashboard();
		loading = false;
	});

	async function loadDashboard() {
		try {
			const res = await fetch('/api/fetcher');
			if (res.ok) {
				const data = await res.json();
				providers = data.providers || [];
				stats = data.stats || stats;
				recentJobs = data.recentJobs || [];
				if (providers.length > 0 && !selectedProvider) {
					selectedProvider = providers[0].id;
					await loadCategories();
				}
			}
		} catch {}
		await Promise.all([loadSuccessLogs(), loadErrorLogs()]);
	}

	async function loadCategories() {
		if (!selectedProvider) return;
		try {
			const res = await fetch(`/api/fetcher/categories?provider=${encodeURIComponent(selectedProvider)}`);
			if (res.ok) {
				const data = await res.json();
				categories = data.categories || [];
				if (categories.length > 0 && !selectedCategory) selectedCategory = categories[0].slug;
			}
		} catch {}
	}

	async function loadSuccessLogs() {
		try {
			const res = await fetch('/api/fetcher/history?type=success&limit=50');
			if (res.ok) { const d = await res.json(); successLogs = d.logs || []; successTotal = d.total || 0; }
		} catch {}
	}
	async function loadErrorLogs() {
		try {
			const res = await fetch('/api/fetcher/history?type=error&limit=50');
			if (res.ok) { const d = await res.json(); errorLogs = d.logs || []; errorTotal = d.total || 0; }
		} catch {}
	}

	function refreshLocalData() {
		localSections = { main: listLocalMainSections(), sub: listLocalSubSections() };
		localFiles = listLocalFiles();
		localStats = getLocalStats();
	}

	async function handleProviderChange() { selectedCategory = ''; categories = []; await loadCategories(); }

	async function startFullPipeline() {
		if (isFetching || !selectedProvider) return;
		isFetching = true;
		pipelineResults = null;
		pipelineProgress = [];

		try {
			const result = await runFullPipeline({
				providerId: selectedProvider,
				category: selectedCategory || undefined,
				limit: fetchLimit,
				onProgress(step, detail) {
					pipelineProgress = [...pipelineProgress, { step, ...detail, time: new Date().toLocaleTimeString('ar-EG') }];
				}
			});
			pipelineResults = result;
		} catch (err) {
			pipelineProgress = [...pipelineProgress, { step: 'error', message: err?.message || 'خطأ غير متوقع', time: new Date().toLocaleTimeString('ar-EG') }];
		} finally {
			isFetching = false;
			refreshLocalData();
			await loadDashboard();
		}
	}

	function formatTime(iso) {
		if (!iso) return '—';
		try { return new Date(iso).toLocaleString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return iso; }
	}

	function stepIcon(step) {
		if (step === 'stored' || step === 'complete') return '✅';
		if (step === 'error') return '❌';
		if (step === 'creating_sections') return '📂';
		if (step === 'storing') return '💾';
		if (step === 'fetching' || step === 'fetched') return '📥';
		return '⏳';
	}
</script>

<svelte:head><title>{t('fetcher.title')} — Nebras</title></svelte:head>

<div dir={currentDir} class="demo-root">
	<div class="demo-banner">⚙️ محرك جلب المحتوى — جلب ← تصنيف ← إنشاء أقسام ← تخزين</div>

	<div class="page">
		<div class="hdr">
			<h1>{t('fetcher.title')}</h1>
			<p>{t('fetcher.desc')}</p>
		</div>

		{#if loading}
			<div class="ld"><div class="spinner"></div><span>جاري التحميل...</span></div>
		{:else}
			<!-- Stats -->
			<div class="sg">
				<div class="sc"><div class="si si-s"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div><div class="sf"><span class="sv">{stats.totalAdded}</span><span class="sl">{t('fetcher.stats_total')}</span></div></div>
				<div class="sc"><div class="si si-e"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div><div class="sf"><span class="sv">{stats.totalErrors}</span><span class="sl">{t('fetcher.stats_errors')}</span></div></div>
				<div class="sc"><div class="si si-a"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg></div><div class="sf"><span class="sv">{stats.activeJobs}</span><span class="sl">{t('fetcher.stats_active')}</span></div></div>
				<div class="sc"><div class="si si-i"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div><div class="sf"><span class="sv svt">{formatTime(stats.lastJobTime)}</span><span class="sl">{t('fetcher.stats_last')}</span></div></div>
			</div>

			<!-- Form -->
			<div class="fc">
				<h2 class="ct">بدء عمليّة الجلب الكاملة</h2>
				<p class="ct-desc">سيتمّ جلب الكتب → تصنيفها بالذكاء الاصطناعي → إنشاء الأقسام تلقائيًّا → تخزينها في قاعدة البيانات</p>
				<div class="fb">
					<div class="fr">
						<div class="fg"><label>{t('fetcher.provider')}</label><select bind:value={selectedProvider} onchange={handleProviderChange}>{#each providers as p}<option value={p.id}>{p.displayName}</option>{/each}</select></div>
						<div class="fg"><label>{t('fetcher.category')}</label><select bind:value={selectedCategory}><option value="">اختر تصنيفاً...</option>{#each categories as c}<option value={c.slug}>{c.name}</option>{/each}</select></div>
						<div class="fg fgs"><label>{t('fetcher.limit')}</label><input type="number" bind:value={fetchLimit} min="1" max="10" /></div>
					</div>
					<div class="fr fra">
						<button class="btn" onclick={startFullPipeline} disabled={isFetching || !selectedProvider}>
							{#if isFetching}<span class="bsp"></span>جاري التنفيذ...{:else}
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="bic"><path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 3v12m0 0l-4-4m4 4l4-4"/></svg>
							بدء الجلب والتخزين{/if}
						</button>
					</div>
				</div>
			</div>

			<!-- Live Progress -->
			{#if pipelineProgress.length > 0}
				<div class="prog-card">
					<h3 class="ct">سجلّ التنفيذ المباشر</h3>
					<div class="prog-list">
						{#each pipelineProgress as p}
							<div class="prog-item" class:prog-ok={p.step === 'stored' || p.step === 'complete'} class:prog-err={p.step === 'error'} class:prog-sec={p.step === 'creating_sections'}>
								<span class="prog-icon">{stepIcon(p.step)}</span>
								<span class="prog-msg">{p.message}</span>
								<span class="prog-time">{p.time}</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Pipeline Results -->
			{#if pipelineResults}
				<div class="res-card">
					<h3 class="ct">النتائج النهائيّة</h3>
					<div class="res-summary">
						<div class="rs-item rs-ok"><span class="rs-num">{pipelineResults.summary.stored}</span><span class="rs-label">تمّ تخزينه</span></div>
						<div class="rs-item rs-err"><span class="rs-num">{pipelineResults.summary.errors}</span><span class="rs-label">أخطاء</span></div>
						<div class="rs-item rs-sec"><span class="rs-num">{pipelineResults.summary.sectionsCreated}</span><span class="rs-label">أقسام أُنشئت</span></div>
					</div>

					{#if pipelineResults.createdSections.main.length > 0 || pipelineResults.createdSections.sub.length > 0}
						<div class="created-sections">
							<h4>الأقسام التي تمّ إنشاؤها:</h4>
							{#each pipelineResults.createdSections.main as s}
								<span class="sec-badge sec-main">📁 رئيسي: {s.name}</span>
							{/each}
							{#each pipelineResults.createdSections.sub as s}
								<span class="sec-badge sec-sub">📂 فرعي: {s.name}</span>
							{/each}
							{#each pipelineResults.createdSections.secondary as s}
								<span class="sec-badge sec-sec">📄 ثانوي: {s.name}</span>
							{/each}
						</div>
					{/if}

					<div class="res-list">
						{#each pipelineResults.results as r}
							<div class="ri" class:ri-ok={r.status === 'stored'} class:ri-err={r.status === 'error'}>
								<div class="ri-head">
									{#if r.status === 'stored'}
										<span class="badge bg-s">✅ تمّ التخزين</span>
									{:else}
										<span class="badge bg-e">❌ خطأ</span>
									{/if}
									<span class="ri-title">{r.book}</span>
								</div>
								{#if r.sections}
									<div class="ri-secs">
										{#if r.sections.mainName}<span class="sec-tag">📁 {r.sections.mainName}</span>{/if}
										{#if r.sections.subName}<span class="sec-tag">📂 {r.sections.subName}</span>{/if}
									</div>
								{/if}
								{#if r.storedId}<span class="ri-id">ID: {r.storedId}</span>{/if}
								{#if r.error}<span class="ri-err">{r.error}</span>{/if}
								{#if r.sectionsCreated}
									<div class="ri-created">
										{#if r.sectionsCreated.main}<span class="new-tag">+ قسم رئيسي جديد</span>{/if}
										{#if r.sectionsCreated.sub}<span class="new-tag">+ قسم فرعي جديد</span>{/if}
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Stored Data -->
			{#if localFiles.length > 0}
				<div class="stored-card">
					<h3 class="ct">📚 المحتوى المُخزّن ({localStats.files} كتاب، {localStats.mainSections} قسم رئيسي، {localStats.subSections} قسم فرعي)</h3>

					{#if localSections.main.length > 0}
						<div class="stored-sections">
							<h4>الأقسام في قاعدة البيانات:</h4>
							{#each localSections.main as main}
								<div class="tree-main">
									<span class="tree-icon">📁</span>
									<span class="tree-name">{main.name}</span>
									<span class="tree-id">#{main.id}</span>
									{#each localSections.sub.filter(s => String(s.main_section) === String(main.id)) as sub}
										<div class="tree-sub">
											<span class="tree-icon">📂</span>
											<span class="tree-name">{sub.name}</span>
											<span class="tree-id">#{sub.id}</span>
										</div>
									{/each}
								</div>
							{/each}
						</div>
					{/if}

					<div class="stored-files">
						<h4>الكتب المُخزّنة:</h4>
						<div class="tw">
							<table class="dt">
								<thead><tr><th>العنوان</th><th>المؤلف</th><th>القسم الرئيسي</th><th>القسم الفرعي</th><th>المصدر</th><th>ID</th></tr></thead>
								<tbody>
									{#each localFiles as f}
										<tr>
											<td class="tdt">{f.metadata?.title || f.title || '—'}</td>
											<td>{f.metadata?.author || f.author || '—'}</td>
											<td>{f.metadata?.main_section_name || f.main_section_name || '—'}</td>
											<td>{f.metadata?.subsection_name || f.subsection_name || '—'}</td>
											<td><span class="badge bg-w">{f.metadata?.source_provider || 'noor-library'}</span></td>
											<td class="tdt">{f.id}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					</div>
				</div>
			{/if}

			<!-- Tabs -->
			<div class="tabs">
				<button class="tab" class:ta={activeTab === 'overview'} onclick={() => activeTab = 'overview'}>نظرة عامة</button>
				<button class="tab" class:ta={activeTab === 'success'} onclick={() => { activeTab = 'success'; loadSuccessLogs(); }}>سجل النجاح ({successTotal})</button>
				<button class="tab" class:ta={activeTab === 'errors'} onclick={() => { activeTab = 'errors'; loadErrorLogs(); }}>سجل الأخطاء ({errorTotal})</button>
				<button class="tab" class:ta={activeTab === 'jobs'} onclick={() => activeTab = 'jobs'}>العمليات</button>
			</div>
			<div class="tc">
				{#if activeTab === 'overview'}
					<div class="ov">
						<h3>المصادر المتاحة</h3>
						<div class="prov-cards">{#each providers as p}<div class="prov-card"><div class="prov-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg></div><div><span class="pn">{p.displayName}</span><span class="pu">{p.baseUrl}</span></div></div>{/each}</div>
						{#if recentJobs.length > 0}
							<h3 style="margin-top:1.5rem">آخر العمليات</h3>
							<div class="tw"><table class="dt"><thead><tr><th>#</th><th>المصدر</th><th>التصنيف</th><th>الحالة</th><th>مُخزّن</th><th>أخطاء</th><th>الوقت</th></tr></thead><tbody>{#each recentJobs as j}<tr><td>{j.id}</td><td>{j.providerId}</td><td>{j.category}</td><td><span class="badge" class:bg-s={j.status==='completed'} class:bg-e={j.status==='failed'} class:bg-w={j.status==='running'}>{j.status}</span></td><td>{j.totalStored||0}</td><td>{j.totalErrors||0}</td><td>{formatTime(j.startedAt)}</td></tr>{/each}</tbody></table></div>
						{/if}
					</div>
				{:else if activeTab === 'errors'}
					{#if errorLogs.length === 0}<div class="empty">لا توجد سجلات بعد</div>
					{:else}<div class="tw"><table class="dt"><thead><tr><th>العنوان</th><th>سبب الخطأ</th><th>العمليّة</th><th>الوقت</th></tr></thead><tbody>{#each errorLogs as l}<tr><td class="tdt">{l.title||l.externalId}</td><td class="tde">{l.error}</td><td>#{l.jobId}</td><td>{formatTime(l.timestamp)}</td></tr>{/each}</tbody></table></div>{/if}
				{:else if activeTab === 'success'}
					{#if successLogs.length === 0}<div class="empty">لا توجد سجلات بعد</div>
					{:else}<div class="tw"><table class="dt"><thead><tr><th>العنوان</th><th>القسم الرئيسي</th><th>الثقة</th><th>الوقت</th></tr></thead><tbody>{#each successLogs as l}<tr><td class="tdt">{l.title}</td><td>{l.mainSection||'—'}</td><td>{l.confidence != null ? l.confidence+'%' : '—'}</td><td>{formatTime(l.timestamp)}</td></tr>{/each}</tbody></table></div>{/if}
				{:else}
					{#if recentJobs.length === 0}<div class="empty">لا توجد سجلات بعد</div>
					{:else}<div class="tw"><table class="dt"><thead><tr><th>#</th><th>المصدر</th><th>التصنيف</th><th>الحالة</th><th>جلب</th><th>صنّف</th><th>خزّن</th><th>أخطاء</th><th>الوقت</th></tr></thead><tbody>{#each recentJobs as j}<tr><td>{j.id}</td><td>{j.providerId}</td><td>{j.category}</td><td><span class="badge" class:bg-s={j.status==='completed'} class:bg-e={j.status==='failed'} class:bg-w={j.status==='running'}>{j.status}</span></td><td>{j.totalFetched||0}</td><td>{j.totalClassified||0}</td><td>{j.totalStored||0}</td><td>{j.totalErrors||0}</td><td>{formatTime(j.startedAt)}</td></tr>{/each}</tbody></table></div>{/if}
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.demo-root{min-height:100vh;background:var(--color-surface-900);color:var(--color-surface-100);font-family:var(--font-sans)}
	.demo-banner{background:linear-gradient(135deg,var(--color-primary-800),var(--color-primary-900));color:var(--color-primary-200);padding:.75rem 1.5rem;font-size:.875rem;text-align:center;border-bottom:1px solid var(--color-primary-700);font-weight:600}
	.page{max-width:1200px;margin:0 auto;padding:1.5rem 2rem}
	.hdr{margin-bottom:1.5rem}.hdr h1{font-size:1.5rem;font-weight:700}.hdr p{font-size:.875rem;color:var(--color-surface-400);margin-top:.25rem}
	.ld{display:flex;align-items:center;justify-content:center;gap:.75rem;padding:4rem 0;color:var(--color-surface-400)}
	.spinner{width:24px;height:24px;border:2px solid var(--color-surface-600);border-top-color:var(--color-primary-400);border-radius:50%;animation:spinner .8s linear infinite}
	.sg{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin-bottom:1.5rem}
	.sc{display:flex;align-items:center;gap:1rem;padding:1rem 1.25rem;background:var(--color-surface-800);border:1px solid var(--color-surface-700);border-radius:12px}
	.si{width:42px;height:42px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0}.si svg{width:22px;height:22px}
	.si-s{background:rgba(16,185,129,.15);color:var(--color-primary-400)}.si-e{background:rgba(244,63,94,.15);color:var(--color-danger-400)}.si-a{background:rgba(251,191,36,.15);color:var(--color-gold-400)}.si-i{background:rgba(99,102,241,.15);color:#818cf8}
	.sf{display:flex;flex-direction:column}.sv{font-size:1.5rem;font-weight:700}.svt{font-size:.875rem;font-weight:600}.sl{font-size:.75rem;color:var(--color-surface-400);margin-top:2px}
	.fc{background:var(--color-surface-800);border:1px solid var(--color-surface-700);border-radius:12px;padding:1.25rem 1.5rem;margin-bottom:1.5rem}
	.ct{font-size:1rem;font-weight:600;color:var(--color-surface-200);margin-bottom:.5rem}
	.ct-desc{font-size:.8125rem;color:var(--color-surface-400);margin-bottom:1rem}
	.fb{display:flex;flex-direction:column;gap:1rem}
	.fr{display:flex;gap:1rem;flex-wrap:wrap}.fra{align-items:center;justify-content:flex-end}
	.fg{display:flex;flex-direction:column;gap:.375rem;flex:1;min-width:160px}.fgs{flex:0 0 100px;min-width:80px}
	.fg label{font-size:.75rem;font-weight:600;color:var(--color-surface-400);text-transform:uppercase;letter-spacing:.05em}
	.fg select,.fg input{padding:.5rem .75rem;background:var(--color-surface-900);border:1px solid var(--color-surface-600);border-radius:8px;color:var(--color-surface-100);font-size:.8125rem;font-family:inherit}
	.fg select:focus,.fg input:focus{outline:none;border-color:var(--color-primary-500);box-shadow:0 0 0 2px rgba(5,150,105,.15)}
	.btn{display:inline-flex;align-items:center;gap:.5rem;padding:.75rem 1.75rem;background:linear-gradient(135deg,var(--color-primary-600),var(--color-primary-700));color:#fff;border:none;border-radius:10px;font-size:.9375rem;font-weight:700;cursor:pointer;transition:all .2s;font-family:inherit}
	.btn:hover:not(:disabled){background:linear-gradient(135deg,var(--color-primary-500),var(--color-primary-600));box-shadow:0 0 20px rgba(5,150,105,.3)}
	.btn:disabled{opacity:.5;cursor:not-allowed}.bic{width:20px;height:20px}
	.bsp{width:18px;height:18px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spinner .8s linear infinite}

	/* Progress */
	.prog-card{background:var(--color-surface-800);border:1px solid var(--color-surface-700);border-radius:12px;padding:1.25rem 1.5rem;margin-bottom:1.5rem}
	.prog-list{display:flex;flex-direction:column;gap:.375rem;max-height:300px;overflow-y:auto}
	.prog-item{display:flex;align-items:center;gap:.75rem;padding:.5rem .75rem;border-radius:8px;background:var(--color-surface-900);font-size:.8125rem}
	.prog-ok{border-inline-start:3px solid var(--color-primary-500)}.prog-err{border-inline-start:3px solid var(--color-danger-500)}.prog-sec{border-inline-start:3px solid var(--color-gold-500)}
	.prog-icon{font-size:1rem;flex-shrink:0}.prog-msg{flex:1;color:var(--color-surface-200)}.prog-time{font-size:.6875rem;color:var(--color-surface-500);flex-shrink:0}

	/* Results */
	.res-card{background:var(--color-surface-800);border:1px solid var(--color-surface-700);border-radius:12px;padding:1.25rem 1.5rem;margin-bottom:1.5rem}
	.res-summary{display:flex;gap:1.5rem;margin-bottom:1.25rem;flex-wrap:wrap}
	.rs-item{display:flex;flex-direction:column;align-items:center;padding:.75rem 1.5rem;border-radius:10px;min-width:100px}
	.rs-ok{background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.25)}.rs-err{background:rgba(244,63,94,.1);border:1px solid rgba(244,63,94,.25)}.rs-sec{background:rgba(251,191,36,.1);border:1px solid rgba(251,191,36,.25)}
	.rs-num{font-size:1.75rem;font-weight:800}.rs-ok .rs-num{color:var(--color-primary-400)}.rs-err .rs-num{color:var(--color-danger-400)}.rs-sec .rs-num{color:var(--color-gold-400)}
	.rs-label{font-size:.75rem;color:var(--color-surface-400);margin-top:4px}

	.created-sections{margin-bottom:1rem;display:flex;flex-wrap:wrap;gap:.5rem}
	.created-sections h4{width:100%;font-size:.8125rem;font-weight:600;color:var(--color-surface-300);margin-bottom:.25rem}
	.sec-badge{padding:.375rem .75rem;border-radius:8px;font-size:.75rem;font-weight:600}
	.sec-main{background:rgba(16,185,129,.12);color:var(--color-primary-300);border:1px solid rgba(16,185,129,.25)}
	.sec-sub{background:rgba(99,102,241,.12);color:#a5b4fc;border:1px solid rgba(99,102,241,.25)}
	.sec-sec{background:rgba(251,191,36,.12);color:var(--color-gold-300);border:1px solid rgba(251,191,36,.25)}

	.res-list{display:flex;flex-direction:column;gap:.5rem}
	.ri{padding:.875rem 1rem;border-radius:8px;background:var(--color-surface-900);border:1px solid var(--color-surface-700)}
	.ri-ok{border-inline-start:3px solid var(--color-primary-500)}.ri-err{border-inline-start:3px solid var(--color-danger-500)}
	.ri-head{display:flex;align-items:center;gap:.75rem;margin-bottom:.375rem}
	.ri-title{font-weight:600;color:var(--color-surface-100);font-size:.875rem}
	.ri-secs{display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.25rem}
	.sec-tag{font-size:.6875rem;color:var(--color-surface-400);padding:.2rem .5rem;background:var(--color-surface-800);border-radius:6px}
	.ri-id{font-size:.6875rem;color:var(--color-surface-500)}.ri-err{font-size:.75rem;color:var(--color-danger-400)}
	.ri-created{display:flex;gap:.5rem;margin-top:.25rem}
	.new-tag{font-size:.6875rem;padding:.2rem .5rem;background:rgba(16,185,129,.1);color:var(--color-primary-400);border-radius:6px;font-weight:600}

	.badge{display:inline-block;padding:.2rem .5rem;border-radius:6px;font-size:.6875rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em}
	.bg-s{background:rgba(16,185,129,.15);color:var(--color-primary-400)}.bg-e{background:rgba(244,63,94,.15);color:var(--color-danger-400)}.bg-w{background:rgba(251,191,36,.15);color:var(--color-gold-400)}

	.tabs{display:flex;gap:2px;margin-bottom:1rem;border-bottom:1px solid var(--color-surface-700)}
	.tab{padding:.625rem 1rem;background:none;border:none;color:var(--color-surface-400);font-size:.8125rem;font-weight:500;cursor:pointer;border-bottom:2px solid transparent;font-family:inherit}.tab:hover{color:var(--color-surface-200)}.ta{color:var(--color-primary-400);border-bottom-color:var(--color-primary-500);font-weight:600}
	.tc{min-height:200px}
	.tw{overflow-x:auto}.dt{width:100%;border-collapse:collapse;font-size:.8125rem}
	.dt th{text-align:start;padding:.625rem .75rem;color:var(--color-surface-400);font-weight:600;font-size:.6875rem;text-transform:uppercase;border-bottom:1px solid var(--color-surface-700);white-space:nowrap}
	.dt td{padding:.625rem .75rem;color:var(--color-surface-200);border-bottom:1px solid var(--color-surface-800)}.dt tbody tr:hover{background:var(--color-surface-800)}
	.tdt{font-weight:600;max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
	.tde{color:var(--color-danger-400);font-size:.75rem;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
	.prov-cards{display:flex;gap:1rem;flex-wrap:wrap}.prov-card{display:flex;align-items:center;gap:.75rem;padding:1rem;background:var(--color-surface-800);border:1px solid var(--color-surface-700);border-radius:10px;min-width:220px}
	.prov-icon{width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,var(--color-primary-700),var(--color-primary-500));display:flex;align-items:center;justify-content:center;color:#fff;flex-shrink:0}.prov-icon svg{width:20px;height:20px}
	.pn{font-weight:600;color:var(--color-surface-100);display:block}.pu{font-size:.6875rem;color:var(--color-surface-500);display:block}
	.empty{text-align:center;padding:3rem 1rem;color:var(--color-surface-500);font-size:.875rem}
	.ov h3{font-size:.875rem;font-weight:600;color:var(--color-surface-300);margin-bottom:.75rem;text-transform:uppercase}

	.stored-card{background:var(--color-surface-800);border:1px solid var(--color-primary-700);border-radius:12px;padding:1.25rem 1.5rem;margin-bottom:1.5rem;box-shadow:0 0 20px rgba(5,150,105,.08)}
	.stored-sections{margin-bottom:1.25rem}
	.stored-sections h4,.stored-files h4{font-size:.8125rem;font-weight:600;color:var(--color-surface-300);margin-bottom:.75rem}
	.tree-main{padding:.625rem .75rem;background:var(--color-surface-900);border-radius:8px;margin-bottom:.375rem;border:1px solid var(--color-surface-700)}
	.tree-sub{padding:.375rem .75rem .375rem 2rem;font-size:.8125rem;color:var(--color-surface-300)}
	.tree-icon{margin-inline-end:.375rem}.tree-name{font-weight:600;color:var(--color-surface-100)}.tree-id{font-size:.6875rem;color:var(--color-surface-500);margin-inline-start:.5rem}
</style>
