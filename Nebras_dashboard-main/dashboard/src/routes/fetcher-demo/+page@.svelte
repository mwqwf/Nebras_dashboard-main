<!--
  Fetcher Demo — نسخة مستقلة من واجهة محرك الجلب لا تتطلّب مصادقة.
  يستخدم `+page@.svelte` لتجاوز سلسلة التخطيطات الأصلية (reset layout).
  تُستخدم في بيئة التطوير فقط. في الإنتاج: /moderator/fetcher (محمية).
-->

<script>
	import { onMount } from 'svelte';
	import { setLanguage, getLanguage, getDir } from '$lib/i18n/store.svelte.js';
	import { t } from '$lib/i18n/store.svelte.js';
	import '../../app.css';

	let currentDir = $derived(getDir());

	let activeTab = $state('overview');
	let providers = $state([]);
	let stats = $state({ totalAdded: 0, totalErrors: 0, activeJobs: 0, lastJobTime: null });
	let recentJobs = $state([]);
	let categories = $state([]);
	let successLogs = $state([]);
	let errorLogs = $state([]);
	let successTotal = $state(0);
	let errorTotal = $state(0);

	let selectedProvider = $state('');
	let selectedCategory = $state('');
	let fetchLimit = $state(5);
	let useGemini = $state(true);
	let isFetching = $state(false);
	let fetchResults = $state(null);
	let fetchError = $state('');
	let loading = $state(true);

	onMount(async () => {
		setLanguage(getLanguage());
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
			if (res.ok) { const data = await res.json(); successLogs = data.logs || []; successTotal = data.total || 0; }
		} catch {}
	}

	async function loadErrorLogs() {
		try {
			const res = await fetch('/api/fetcher/history?type=error&limit=50');
			if (res.ok) { const data = await res.json(); errorLogs = data.logs || []; errorTotal = data.total || 0; }
		} catch {}
	}

	async function handleProviderChange() { selectedCategory = ''; categories = []; await loadCategories(); }

	async function startFetch() {
		if (isFetching || !selectedProvider) return;
		isFetching = true; fetchResults = null; fetchError = '';
		try {
			const res = await fetch('/api/fetcher/fetch', {
				method: 'POST', headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ provider: selectedProvider, category: selectedCategory || undefined, limit: fetchLimit, useGemini })
			});
			const data = await res.json();
			if (!res.ok) fetchError = data.error || data.detail || 'Unknown error';
			else fetchResults = data;
		} catch (err) { fetchError = err?.message || 'Network error'; }
		finally { isFetching = false; await loadDashboard(); }
	}

	function formatTime(iso) {
		if (!iso) return '—';
		try { return new Date(iso).toLocaleString('ar-EG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return iso; }
	}
	function confidenceColor(c) {
		if (c >= 70) return 'var(--color-primary-400)';
		if (c >= 40) return 'var(--color-gold-400)';
		return 'var(--color-danger-400)';
	}
</script>

<svelte:head><title>{t('fetcher.title')} — Nebras Demo</title></svelte:head>

<div dir={currentDir} class="demo-root">
	<div class="demo-banner">
		⚙️ وضع العرض التوضيحي — الصفحة الفعلية: <code>/moderator/fetcher</code> (تتطلب مصادقة)
	</div>

	<div class="fetcher-page">
		<div class="page-header">
			<h1 class="page-title">{t('fetcher.title')}</h1>
			<p class="page-desc">{t('fetcher.desc')}</p>
		</div>

		{#if loading}
			<div class="loading-state"><div class="spinner"></div><span>{t('common.loading')}</span></div>
		{:else}
			<!-- Stats -->
			<div class="stats-grid">
				<div class="stat-card"><div class="stat-icon si-s"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div><div class="stat-info"><span class="stat-value">{stats.totalAdded}</span><span class="stat-label">{t('fetcher.stats_total')}</span></div></div>
				<div class="stat-card"><div class="stat-icon si-e"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div><div class="stat-info"><span class="stat-value">{stats.totalErrors}</span><span class="stat-label">{t('fetcher.stats_errors')}</span></div></div>
				<div class="stat-card"><div class="stat-icon si-a"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg></div><div class="stat-info"><span class="stat-value">{stats.activeJobs}</span><span class="stat-label">{t('fetcher.stats_active')}</span></div></div>
				<div class="stat-card"><div class="stat-icon si-i"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg></div><div class="stat-info"><span class="stat-value sv-t">{formatTime(stats.lastJobTime)}</span><span class="stat-label">{t('fetcher.stats_last')}</span></div></div>
			</div>

			<!-- Form -->
			<div class="form-card">
				<h2 class="card-title">{t('fetcher.start_fetch')}</h2>
				<div class="form-body">
					<div class="form-row">
						<div class="fg"><label>{t('fetcher.provider')}</label><select bind:value={selectedProvider} onchange={handleProviderChange}>{#each providers as p}<option value={p.id}>{p.displayName}</option>{/each}</select></div>
						<div class="fg"><label>{t('fetcher.category')}</label><select bind:value={selectedCategory}><option value="">{t('fetcher.select_category')}</option>{#each categories as cat}<option value={cat.slug}>{cat.name}</option>{/each}</select></div>
						<div class="fg fg-sm"><label>{t('fetcher.limit')}</label><input type="number" bind:value={fetchLimit} min="1" max="20" /></div>
					</div>
					<div class="form-row fr-actions">
						<label class="toggle-switch"><input type="checkbox" class="toggle-input" bind:checked={useGemini} /><span class="toggle-slider"></span><span class="toggle-label">{t('fetcher.use_gemini')}</span></label>
						<button class="btn-fetch" onclick={startFetch} disabled={isFetching || !selectedProvider}>
							{#if isFetching}<span class="btn-sp"></span>{t('fetcher.fetching')}{:else}<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-ic"><path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 3v12m0 0l-4-4m4 4l4-4"/></svg>{t('fetcher.start_fetch')}{/if}
						</button>
					</div>
				</div>
			</div>

			<!-- Error alert -->
			{#if fetchError}<div class="alert-err"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg><span>{fetchError}</span></div>{/if}

			<!-- Results -->
			{#if fetchResults}
				<div class="results-card">
					<h3 class="card-title">{t('fetcher.fetch_results')} — {fetchResults.fetched} {t('fetcher.book_title')}</h3>
					<div class="results-list">
						{#each fetchResults.results as item}
							<div class="ri" class:ri-s={item.status === 'stored'} class:ri-w={item.status === 'classified_not_stored'} class:ri-e={item.status === 'error'}>
								<div class="ri-badge">
									{#if item.status === 'stored'}<span class="badge bg-s">{t('fetcher.stored')}</span>
									{:else if item.status === 'classified_not_stored'}<span class="badge bg-w">{t('fetcher.classified')}</span>
									{:else}<span class="badge bg-e">{t('fetcher.error')}</span>{/if}
								</div>
								<div class="ri-info">
									<span class="ri-title">{item.title}</span>
									{#if item.classification}
										<span class="ri-meta">{item.classification.mainSectionName || '—'}{#if item.classification.subSectionName} → {item.classification.subSectionName}{/if}
											{#if item.classification.confidence != null}<span class="conf" style="color:{confidenceColor(item.classification.confidence)}">{item.classification.confidence}%</span>{/if}
										</span>
									{/if}
									{#if item.error || item.storeError}<span class="ri-err">{item.error || item.storeError}</span>{/if}
								</div>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Tabs -->
			<div class="tabs">
				<button class="tab" class:ta={activeTab === 'overview'} onclick={() => activeTab = 'overview'}>{t('fetcher.tab_overview')}</button>
				<button class="tab" class:ta={activeTab === 'success'} onclick={() => { activeTab = 'success'; loadSuccessLogs(); }}>{t('fetcher.tab_success')} ({successTotal})</button>
				<button class="tab" class:ta={activeTab === 'errors'} onclick={() => { activeTab = 'errors'; loadErrorLogs(); }}>{t('fetcher.tab_errors')} ({errorTotal})</button>
				<button class="tab" class:ta={activeTab === 'jobs'} onclick={() => activeTab = 'jobs'}>{t('fetcher.tab_jobs')}</button>
			</div>

			<div class="tc">
				{#if activeTab === 'overview'}
					<div class="ov">
						<h3>{t('fetcher.provider')}</h3>
						<div class="prov-cards">{#each providers as p}<div class="prov-card"><div class="prov-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg></div><div><span class="pn">{p.displayName}</span><span class="pu">{p.baseUrl}</span></div></div>{/each}</div>
						{#if recentJobs.length > 0}
							<h3 style="margin-top:1.5rem">{t('fetcher.tab_jobs')}</h3>
							<div class="tw"><table class="dt"><thead><tr><th>#</th><th>{t('fetcher.provider')}</th><th>{t('fetcher.category')}</th><th>{t('common.status')}</th><th>{t('fetcher.stored')}</th><th>{t('fetcher.stats_errors')}</th><th>{t('fetcher.time')}</th></tr></thead><tbody>{#each recentJobs as j}<tr><td>{j.id}</td><td>{j.providerId}</td><td>{j.category}</td><td><span class="badge" class:bg-s={j.status==='completed'} class:bg-e={j.status==='failed'} class:bg-w={j.status==='running'}>{j.status}</span></td><td>{j.totalStored||0}</td><td>{j.totalErrors||0}</td><td>{formatTime(j.startedAt)}</td></tr>{/each}</tbody></table></div>
						{/if}
					</div>
				{:else if activeTab === 'errors'}
					{#if errorLogs.length === 0}<div class="empty">{t('fetcher.no_logs')}</div>
					{:else}<div class="tw"><table class="dt"><thead><tr><th>{t('fetcher.book_title')}</th><th>{t('fetcher.error_reason')}</th><th>{t('fetcher.job_id')}</th><th>{t('fetcher.time')}</th></tr></thead><tbody>{#each errorLogs as l}<tr><td class="tdt">{l.title||l.externalId}</td><td class="tde">{l.error}</td><td>#{l.jobId}</td><td>{formatTime(l.timestamp)}</td></tr>{/each}</tbody></table></div>{/if}
				{:else if activeTab === 'success'}
					{#if successLogs.length === 0}<div class="empty">{t('fetcher.no_logs')}</div>
					{:else}<div class="tw"><table class="dt"><thead><tr><th>{t('fetcher.book_title')}</th><th>{t('fetcher.main_section')}</th><th>{t('fetcher.confidence')}</th><th>{t('fetcher.time')}</th></tr></thead><tbody>{#each successLogs as l}<tr><td class="tdt">{l.title}</td><td>{l.mainSection||'—'}</td><td>{#if l.confidence!=null}<span style="color:{confidenceColor(l.confidence)}">{l.confidence}%</span>{:else}—{/if}</td><td>{formatTime(l.timestamp)}</td></tr>{/each}</tbody></table></div>{/if}
				{:else}
					{#if recentJobs.length === 0}<div class="empty">{t('fetcher.no_logs')}</div>
					{:else}<div class="tw"><table class="dt"><thead><tr><th>#</th><th>{t('fetcher.provider')}</th><th>{t('fetcher.category')}</th><th>{t('common.status')}</th><th>Fetched</th><th>{t('fetcher.classified')}</th><th>{t('fetcher.stored')}</th><th>{t('fetcher.stats_errors')}</th><th>{t('fetcher.time')}</th></tr></thead><tbody>{#each recentJobs as j}<tr><td>{j.id}</td><td>{j.providerId}</td><td>{j.category}</td><td><span class="badge" class:bg-s={j.status==='completed'} class:bg-e={j.status==='failed'} class:bg-w={j.status==='running'}>{j.status}</span></td><td>{j.totalFetched||0}</td><td>{j.totalClassified||0}</td><td>{j.totalStored||0}</td><td>{j.totalErrors||0}</td><td>{formatTime(j.startedAt)}</td></tr>{/each}</tbody></table></div>{/if}
				{/if}
			</div>
		{/if}
	</div>
</div>

<style>
	.demo-root{min-height:100vh;background:var(--color-surface-900);color:var(--color-surface-100);font-family:var(--font-sans)}
	.demo-banner{background:linear-gradient(135deg,var(--color-primary-800),var(--color-primary-900));color:var(--color-primary-200);padding:.625rem 1.5rem;font-size:.8125rem;text-align:center;border-bottom:1px solid var(--color-primary-700)}
	.demo-banner code{background:rgba(255,255,255,.1);padding:.125rem .375rem;border-radius:4px}
	.fetcher-page{max-width:1200px;margin:0 auto;padding:1.5rem 2rem}
	.page-header{margin-bottom:1.5rem}
	.page-title{font-size:1.5rem;font-weight:700;color:var(--color-surface-100)}
	.page-desc{font-size:.875rem;color:var(--color-surface-400);margin-top:.25rem}
	.loading-state{display:flex;align-items:center;justify-content:center;gap:.75rem;padding:4rem 0;color:var(--color-surface-400)}
	.spinner{width:24px;height:24px;border:2px solid var(--color-surface-600);border-top-color:var(--color-primary-400);border-radius:50%;animation:spinner .8s linear infinite}
	.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin-bottom:1.5rem}
	.stat-card{display:flex;align-items:center;gap:1rem;padding:1rem 1.25rem;background:var(--color-surface-800);border:1px solid var(--color-surface-700);border-radius:12px}
	.stat-icon{width:42px;height:42px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
	.stat-icon svg{width:22px;height:22px}
	.si-s{background:rgba(16,185,129,.15);color:var(--color-primary-400)}.si-e{background:rgba(244,63,94,.15);color:var(--color-danger-400)}.si-a{background:rgba(251,191,36,.15);color:var(--color-gold-400)}.si-i{background:rgba(99,102,241,.15);color:#818cf8}
	.stat-info{display:flex;flex-direction:column}.stat-value{font-size:1.5rem;font-weight:700;color:var(--color-surface-100)}.sv-t{font-size:.875rem;font-weight:600}.stat-label{font-size:.75rem;color:var(--color-surface-400);margin-top:2px}
	.form-card{background:var(--color-surface-800);border:1px solid var(--color-surface-700);border-radius:12px;padding:1.25rem 1.5rem;margin-bottom:1.5rem}
	.card-title{font-size:1rem;font-weight:600;color:var(--color-surface-200);margin-bottom:1rem}
	.form-body{display:flex;flex-direction:column;gap:1rem}
	.form-row{display:flex;gap:1rem;flex-wrap:wrap}.fr-actions{align-items:center;justify-content:space-between}
	.fg{display:flex;flex-direction:column;gap:.375rem;flex:1;min-width:160px}.fg-sm{flex:0 0 100px;min-width:80px}
	.fg label{font-size:.75rem;font-weight:600;color:var(--color-surface-400);text-transform:uppercase;letter-spacing:.05em}
	.fg select,.fg input{padding:.5rem .75rem;background:var(--color-surface-900);border:1px solid var(--color-surface-600);border-radius:8px;color:var(--color-surface-100);font-size:.8125rem;font-family:inherit}
	.fg select:focus,.fg input:focus{outline:none;border-color:var(--color-primary-500);box-shadow:0 0 0 2px rgba(5,150,105,.15)}
	.btn-fetch{display:inline-flex;align-items:center;gap:.5rem;padding:.625rem 1.25rem;background:linear-gradient(135deg,var(--color-primary-600),var(--color-primary-700));color:#fff;border:none;border-radius:10px;font-size:.875rem;font-weight:600;cursor:pointer;transition:all .2s;font-family:inherit}
	.btn-fetch:hover:not(:disabled){background:linear-gradient(135deg,var(--color-primary-500),var(--color-primary-600));box-shadow:0 0 20px rgba(5,150,105,.25)}
	.btn-fetch:disabled{opacity:.5;cursor:not-allowed}.btn-ic{width:18px;height:18px}
	.btn-sp{width:16px;height:16px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spinner .8s linear infinite}
	.alert-err{display:flex;align-items:center;gap:.75rem;padding:.875rem 1.25rem;border-radius:10px;margin-bottom:1rem;font-size:.8125rem;background:rgba(244,63,94,.1);border:1px solid rgba(244,63,94,.25);color:var(--color-danger-400)}
	.alert-err svg{width:20px;height:20px;flex-shrink:0}
	.results-card{background:var(--color-surface-800);border:1px solid var(--color-surface-700);border-radius:12px;padding:1.25rem 1.5rem;margin-bottom:1.5rem}
	.results-list{display:flex;flex-direction:column;gap:.5rem}
	.ri{display:flex;align-items:flex-start;gap:1rem;padding:.75rem 1rem;border-radius:8px;background:var(--color-surface-900);border:1px solid var(--color-surface-700)}
	.ri-s{border-inline-start:3px solid var(--color-primary-500)}.ri-w{border-inline-start:3px solid var(--color-gold-500)}.ri-e{border-inline-start:3px solid var(--color-danger-500)}
	.ri-badge{flex-shrink:0;padding-top:2px}.ri-info{display:flex;flex-direction:column;gap:.25rem;min-width:0}
	.ri-title{font-size:.875rem;font-weight:600;color:var(--color-surface-100)}.ri-meta{font-size:.75rem;color:var(--color-surface-400);display:flex;align-items:center;gap:.5rem;flex-wrap:wrap}
	.ri-err{font-size:.75rem;color:var(--color-danger-400)}.conf{font-weight:700;font-size:.7rem}
	.badge{display:inline-block;padding:.2rem .5rem;border-radius:6px;font-size:.6875rem;font-weight:600;text-transform:uppercase;letter-spacing:.04em}
	.bg-s{background:rgba(16,185,129,.15);color:var(--color-primary-400)}.bg-e{background:rgba(244,63,94,.15);color:var(--color-danger-400)}.bg-w{background:rgba(251,191,36,.15);color:var(--color-gold-400)}
	.tabs{display:flex;gap:2px;margin-bottom:1rem;border-bottom:1px solid var(--color-surface-700)}
	.tab{padding:.625rem 1rem;background:none;border:none;color:var(--color-surface-400);font-size:.8125rem;font-weight:500;cursor:pointer;transition:all .15s;border-bottom:2px solid transparent;font-family:inherit}
	.tab:hover{color:var(--color-surface-200)}.ta{color:var(--color-primary-400);border-bottom-color:var(--color-primary-500);font-weight:600}
	.tc{min-height:200px}
	.tw{overflow-x:auto}
	.dt{width:100%;border-collapse:collapse;font-size:.8125rem}
	.dt th{text-align:start;padding:.625rem .75rem;color:var(--color-surface-400);font-weight:600;font-size:.6875rem;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid var(--color-surface-700);white-space:nowrap}
	.dt td{padding:.625rem .75rem;color:var(--color-surface-200);border-bottom:1px solid var(--color-surface-800)}
	.dt tbody tr:hover{background:var(--color-surface-800)}
	.tdt{font-weight:600;max-width:250px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
	.tde{color:var(--color-danger-400);font-size:.75rem;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
	.prov-cards{display:flex;gap:1rem;flex-wrap:wrap}
	.prov-card{display:flex;align-items:center;gap:.75rem;padding:1rem;background:var(--color-surface-800);border:1px solid var(--color-surface-700);border-radius:10px;min-width:220px}
	.prov-icon{width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,var(--color-primary-700),var(--color-primary-500));display:flex;align-items:center;justify-content:center;color:#fff;flex-shrink:0}
	.prov-icon svg{width:20px;height:20px}.pn{font-weight:600;color:var(--color-surface-100);display:block}.pu{font-size:.6875rem;color:var(--color-surface-500);display:block}
	.empty{text-align:center;padding:3rem 1rem;color:var(--color-surface-500);font-size:.875rem}
	.ov h3{font-size:.875rem;font-weight:600;color:var(--color-surface-300);margin-bottom:.75rem;text-transform:uppercase;letter-spacing:.05em}
</style>
