<!--
  Content Fetcher Dashboard — واجهة إدارة محرك جلب المحتوى.
  تعرض: إحصائيات، نموذج جلب، سجل نجاح، سجل أخطاء، قائمة العمليات.
-->

<script>
	import { onMount } from 'svelte';
	import { t } from '$lib/i18n/store.svelte.js';

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
			const res = await fetch(
				`/api/fetcher/categories?provider=${encodeURIComponent(selectedProvider)}`
			);
			if (res.ok) {
				const data = await res.json();
				categories = data.categories || [];
				if (categories.length > 0 && !selectedCategory) {
					selectedCategory = categories[0].slug;
				}
			}
		} catch {}
	}

	async function loadSuccessLogs() {
		try {
			const res = await fetch('/api/fetcher/history?type=success&limit=50');
			if (res.ok) {
				const data = await res.json();
				successLogs = data.logs || [];
				successTotal = data.total || 0;
			}
		} catch {}
	}

	async function loadErrorLogs() {
		try {
			const res = await fetch('/api/fetcher/history?type=error&limit=50');
			if (res.ok) {
				const data = await res.json();
				errorLogs = data.logs || [];
				errorTotal = data.total || 0;
			}
		} catch {}
	}

	async function handleProviderChange() {
		selectedCategory = '';
		categories = [];
		await loadCategories();
	}

	async function startFetch() {
		if (isFetching || !selectedProvider) return;
		isFetching = true;
		fetchResults = null;
		fetchError = '';

		try {
			const res = await fetch('/api/fetcher/fetch', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					provider: selectedProvider,
					category: selectedCategory || undefined,
					limit: fetchLimit,
					useGemini
				})
			});
			const data = await res.json();
			if (!res.ok) {
				fetchError = data.error || data.detail || 'Unknown error';
			} else {
				fetchResults = data;
			}
		} catch (err) {
			fetchError = err?.message || 'Network error';
		} finally {
			isFetching = false;
			await loadDashboard();
		}
	}

	function formatTime(iso) {
		if (!iso) return '—';
		try {
			const d = new Date(iso);
			return d.toLocaleString('ar-EG', {
				month: 'short',
				day: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return iso;
		}
	}

	function confidenceColor(c) {
		if (c >= 70) return 'var(--color-primary-400)';
		if (c >= 40) return 'var(--color-gold-400)';
		return 'var(--color-danger-400)';
	}
</script>

<svelte:head>
	<title>{t('fetcher.title')} — Nebras</title>
</svelte:head>

<div class="fetcher-page">
	<!-- Header -->
	<div class="page-header">
		<div>
			<h1 class="page-title">{t('fetcher.title')}</h1>
			<p class="page-desc">{t('fetcher.desc')}</p>
		</div>
	</div>

	{#if loading}
		<div class="loading-state">
			<div class="spinner"></div>
			<span>{t('common.loading')}</span>
		</div>
	{:else}
		<!-- Stats Cards -->
		<div class="stats-grid">
			<div class="stat-card">
				<div class="stat-icon stat-icon--success">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
				</div>
				<div class="stat-info">
					<span class="stat-value">{stats.totalAdded}</span>
					<span class="stat-label">{t('fetcher.stats_total')}</span>
				</div>
			</div>
			<div class="stat-card">
				<div class="stat-icon stat-icon--error">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
				</div>
				<div class="stat-info">
					<span class="stat-value">{stats.totalErrors}</span>
					<span class="stat-label">{t('fetcher.stats_errors')}</span>
				</div>
			</div>
			<div class="stat-card">
				<div class="stat-icon stat-icon--active">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
				</div>
				<div class="stat-info">
					<span class="stat-value">{stats.activeJobs}</span>
					<span class="stat-label">{t('fetcher.stats_active')}</span>
				</div>
			</div>
			<div class="stat-card">
				<div class="stat-icon stat-icon--info">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
				</div>
				<div class="stat-info">
					<span class="stat-value stat-value--time">{formatTime(stats.lastJobTime)}</span>
					<span class="stat-label">{t('fetcher.stats_last')}</span>
				</div>
			</div>
		</div>

		<!-- Fetch Form -->
		<div class="fetch-form-card">
			<h2 class="card-title">{t('fetcher.start_fetch')}</h2>
			<div class="fetch-form">
				<div class="form-row">
					<div class="form-group">
						<label for="provider-select">{t('fetcher.provider')}</label>
						<select
							id="provider-select"
							bind:value={selectedProvider}
							onchange={handleProviderChange}
						>
							{#each providers as p}
								<option value={p.id}>{p.displayName}</option>
							{/each}
						</select>
					</div>
					<div class="form-group">
						<label for="category-select">{t('fetcher.category')}</label>
						<select id="category-select" bind:value={selectedCategory}>
							<option value="">{t('fetcher.select_category')}</option>
							{#each categories as cat}
								<option value={cat.slug}>{cat.name}</option>
							{/each}
						</select>
					</div>
					<div class="form-group form-group--small">
						<label for="limit-input">{t('fetcher.limit')}</label>
						<input
							id="limit-input"
							type="number"
							bind:value={fetchLimit}
							min="1"
							max="20"
						/>
					</div>
				</div>
				<div class="form-row form-row--actions">
					<label class="toggle-switch">
						<input
							type="checkbox"
							class="toggle-input"
							bind:checked={useGemini}
						/>
						<span class="toggle-slider"></span>
						<span class="toggle-label">{t('fetcher.use_gemini')}</span>
					</label>
					<button
						class="btn-fetch"
						onclick={startFetch}
						disabled={isFetching || !selectedProvider}
					>
						{#if isFetching}
							<span class="btn-spinner"></span>
							{t('fetcher.fetching')}
						{:else}
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon"><path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 3v12m0 0l-4-4m4 4l4-4"/></svg>
							{t('fetcher.start_fetch')}
						{/if}
					</button>
				</div>
			</div>
		</div>

		<!-- Fetch Results (after a fetch) -->
		{#if fetchError}
			<div class="alert alert--error">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
				<span>{fetchError}</span>
			</div>
		{/if}

		{#if fetchResults}
			<div class="results-card">
				<h3 class="card-title">{t('fetcher.fetch_results')} — {fetchResults.fetched} {t('fetcher.book_title')}</h3>
				<div class="results-list">
					{#each fetchResults.results as item}
						<div class="result-item" class:result-item--success={item.status === 'stored'} class:result-item--warning={item.status === 'classified_not_stored'} class:result-item--error={item.status === 'error'}>
							<div class="result-status">
								{#if item.status === 'stored'}
									<span class="badge badge--success">{t('fetcher.stored')}</span>
								{:else if item.status === 'classified_not_stored'}
									<span class="badge badge--warning">{t('fetcher.classified')}</span>
								{:else}
									<span class="badge badge--error">{t('fetcher.error')}</span>
								{/if}
							</div>
							<div class="result-info">
								<span class="result-title">{item.title}</span>
								{#if item.classification}
									<span class="result-meta">
										{item.classification.mainSectionName || '—'}
										{#if item.classification.subSectionName} → {item.classification.subSectionName}{/if}
										{#if item.classification.confidence != null}
											<span class="confidence-badge" style="color: {confidenceColor(item.classification.confidence)}">
												{item.classification.confidence}%
											</span>
										{/if}
									</span>
								{/if}
								{#if item.error || item.storeError}
									<span class="result-error">{item.error || item.storeError}</span>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/if}

		<!-- Tabs -->
		<div class="tabs">
			<button class="tab" class:tab--active={activeTab === 'overview'} onclick={() => activeTab = 'overview'}>{t('fetcher.tab_overview')}</button>
			<button class="tab" class:tab--active={activeTab === 'success'} onclick={() => { activeTab = 'success'; loadSuccessLogs(); }}>
				{t('fetcher.tab_success')} ({successTotal})
			</button>
			<button class="tab" class:tab--active={activeTab === 'errors'} onclick={() => { activeTab = 'errors'; loadErrorLogs(); }}>
				{t('fetcher.tab_errors')} ({errorTotal})
			</button>
			<button class="tab" class:tab--active={activeTab === 'jobs'} onclick={() => activeTab = 'jobs'}>{t('fetcher.tab_jobs')}</button>
		</div>

		<div class="tab-content">
			{#if activeTab === 'overview'}
				<div class="overview-section">
					<h3>{t('fetcher.provider')}</h3>
					<div class="provider-cards">
						{#each providers as p}
							<div class="provider-card">
								<div class="provider-icon">
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
								</div>
								<div>
									<span class="provider-name">{p.displayName}</span>
									<span class="provider-url">{p.baseUrl}</span>
								</div>
							</div>
						{/each}
					</div>

					{#if recentJobs.length > 0}
						<h3 style="margin-top: 1.5rem">{t('fetcher.tab_jobs')}</h3>
						<div class="jobs-table-wrapper">
							<table class="data-table">
								<thead>
									<tr>
										<th>#</th>
										<th>{t('fetcher.provider')}</th>
										<th>{t('fetcher.category')}</th>
										<th>{t('common.status')}</th>
										<th>{t('fetcher.stored')}</th>
										<th>{t('fetcher.stats_errors')}</th>
										<th>{t('fetcher.time')}</th>
									</tr>
								</thead>
								<tbody>
									{#each recentJobs as job}
										<tr>
											<td>{job.id}</td>
											<td>{job.providerId}</td>
											<td>{job.category}</td>
											<td>
												<span class="badge" class:badge--success={job.status === 'completed'} class:badge--error={job.status === 'failed'} class:badge--warning={job.status === 'running'}>
													{job.status}
												</span>
											</td>
											<td>{job.totalStored || 0}</td>
											<td>{job.totalErrors || 0}</td>
											<td>{formatTime(job.startedAt)}</td>
										</tr>
									{/each}
								</tbody>
							</table>
						</div>
					{/if}
				</div>

			{:else if activeTab === 'success'}
				{#if successLogs.length === 0}
					<div class="empty-state">{t('fetcher.no_logs')}</div>
				{:else}
					<div class="jobs-table-wrapper">
						<table class="data-table">
							<thead>
								<tr>
									<th>{t('fetcher.book_title')}</th>
									<th>{t('fetcher.main_section')}</th>
									<th>{t('fetcher.sub_section')}</th>
									<th>{t('fetcher.confidence')}</th>
									<th>{t('fetcher.source_category')}</th>
									<th>{t('fetcher.time')}</th>
								</tr>
							</thead>
							<tbody>
								{#each successLogs as log}
									<tr>
										<td class="td-title">{log.title}</td>
										<td>{log.mainSection || '—'}</td>
										<td>{log.subSection || '—'}</td>
										<td>
											{#if log.confidence != null}
												<span style="color: {confidenceColor(log.confidence)}">{log.confidence}%</span>
											{:else}
												—
											{/if}
										</td>
										<td>{log.category || '—'}</td>
										<td>{formatTime(log.timestamp)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}

			{:else if activeTab === 'errors'}
				{#if errorLogs.length === 0}
					<div class="empty-state">{t('fetcher.no_logs')}</div>
				{:else}
					<div class="jobs-table-wrapper">
						<table class="data-table">
							<thead>
								<tr>
									<th>{t('fetcher.book_title')}</th>
									<th>{t('fetcher.error_reason')}</th>
									<th>{t('fetcher.job_id')}</th>
									<th>{t('fetcher.time')}</th>
								</tr>
							</thead>
							<tbody>
								{#each errorLogs as log}
									<tr>
										<td class="td-title">{log.title || log.externalId}</td>
										<td class="td-error">{log.error}</td>
										<td>#{log.jobId}</td>
										<td>{formatTime(log.timestamp)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}

			{:else if activeTab === 'jobs'}
				{#if recentJobs.length === 0}
					<div class="empty-state">{t('fetcher.no_logs')}</div>
				{:else}
					<div class="jobs-table-wrapper">
						<table class="data-table">
							<thead>
								<tr>
									<th>#</th>
									<th>{t('fetcher.provider')}</th>
									<th>{t('fetcher.category')}</th>
									<th>{t('common.status')}</th>
									<th>Fetched</th>
									<th>{t('fetcher.classified')}</th>
									<th>{t('fetcher.stored')}</th>
									<th>{t('fetcher.stats_errors')}</th>
									<th>{t('fetcher.time')}</th>
								</tr>
							</thead>
							<tbody>
								{#each recentJobs as job}
									<tr>
										<td>{job.id}</td>
										<td>{job.providerId}</td>
										<td>{job.category}</td>
										<td>
											<span class="badge" class:badge--success={job.status === 'completed'} class:badge--error={job.status === 'failed'} class:badge--warning={job.status === 'running'}>
												{job.status}
											</span>
										</td>
										<td>{job.totalFetched || 0}</td>
										<td>{job.totalClassified || 0}</td>
										<td>{job.totalStored || 0}</td>
										<td>{job.totalErrors || 0}</td>
										<td>{formatTime(job.startedAt)}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			{/if}
		</div>
	{/if}
</div>

<style>
	.fetcher-page {
		max-width: 1200px;
	}

	.page-header {
		margin-bottom: 1.5rem;
	}
	.page-title {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--color-surface-100);
	}
	.page-desc {
		font-size: 0.875rem;
		color: var(--color-surface-400);
		margin-top: 0.25rem;
	}

	.loading-state {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		padding: 4rem 0;
		color: var(--color-surface-400);
	}
	.spinner {
		width: 24px;
		height: 24px;
		border: 2px solid var(--color-surface-600);
		border-top-color: var(--color-primary-400);
		border-radius: 50%;
		animation: spinner 0.8s linear infinite;
	}

	/* Stats */
	.stats-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
		margin-bottom: 1.5rem;
	}
	.stat-card {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem 1.25rem;
		background: var(--color-surface-800);
		border: 1px solid var(--color-surface-700);
		border-radius: 12px;
	}
	.stat-icon {
		width: 42px;
		height: 42px;
		border-radius: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}
	.stat-icon svg { width: 22px; height: 22px; }
	.stat-icon--success { background: rgba(16, 185, 129, 0.15); color: var(--color-primary-400); }
	.stat-icon--error { background: rgba(244, 63, 94, 0.15); color: var(--color-danger-400); }
	.stat-icon--active { background: rgba(251, 191, 36, 0.15); color: var(--color-gold-400); }
	.stat-icon--info { background: rgba(99, 102, 241, 0.15); color: #818cf8; }
	.stat-info { display: flex; flex-direction: column; }
	.stat-value { font-size: 1.5rem; font-weight: 700; color: var(--color-surface-100); }
	.stat-value--time { font-size: 0.875rem; font-weight: 600; }
	.stat-label { font-size: 0.75rem; color: var(--color-surface-400); margin-top: 2px; }

	/* Form */
	.fetch-form-card {
		background: var(--color-surface-800);
		border: 1px solid var(--color-surface-700);
		border-radius: 12px;
		padding: 1.25rem 1.5rem;
		margin-bottom: 1.5rem;
	}
	.card-title {
		font-size: 1rem;
		font-weight: 600;
		color: var(--color-surface-200);
		margin-bottom: 1rem;
	}
	.fetch-form { display: flex; flex-direction: column; gap: 1rem; }
	.form-row { display: flex; gap: 1rem; flex-wrap: wrap; }
	.form-group { display: flex; flex-direction: column; gap: 0.375rem; flex: 1; min-width: 160px; }
	.form-group--small { flex: 0 0 100px; min-width: 80px; }
	.form-group label {
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-surface-400);
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.form-group select,
	.form-group input {
		padding: 0.5rem 0.75rem;
		background: var(--color-surface-900);
		border: 1px solid var(--color-surface-600);
		border-radius: 8px;
		color: var(--color-surface-100);
		font-size: 0.8125rem;
		font-family: inherit;
	}
	.form-group select:focus,
	.form-group input:focus {
		outline: none;
		border-color: var(--color-primary-500);
		box-shadow: 0 0 0 2px rgba(5, 150, 105, 0.15);
	}
	.form-row--actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.btn-fetch {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.625rem 1.25rem;
		background: linear-gradient(135deg, var(--color-primary-600), var(--color-primary-700));
		color: white;
		border: none;
		border-radius: 10px;
		font-size: 0.875rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.2s;
		font-family: inherit;
	}
	.btn-fetch:hover:not(:disabled) {
		background: linear-gradient(135deg, var(--color-primary-500), var(--color-primary-600));
		box-shadow: 0 0 20px rgba(5, 150, 105, 0.25);
	}
	.btn-fetch:disabled { opacity: 0.5; cursor: not-allowed; }
	.btn-icon { width: 18px; height: 18px; }
	.btn-spinner {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255,255,255,0.3);
		border-top-color: white;
		border-radius: 50%;
		animation: spinner 0.8s linear infinite;
	}

	/* Alert */
	.alert {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.875rem 1.25rem;
		border-radius: 10px;
		margin-bottom: 1rem;
		font-size: 0.8125rem;
	}
	.alert svg { width: 20px; height: 20px; flex-shrink: 0; }
	.alert--error {
		background: rgba(244, 63, 94, 0.1);
		border: 1px solid rgba(244, 63, 94, 0.25);
		color: var(--color-danger-400);
	}

	/* Results */
	.results-card {
		background: var(--color-surface-800);
		border: 1px solid var(--color-surface-700);
		border-radius: 12px;
		padding: 1.25rem 1.5rem;
		margin-bottom: 1.5rem;
	}
	.results-list { display: flex; flex-direction: column; gap: 0.5rem; }
	.result-item {
		display: flex;
		align-items: flex-start;
		gap: 1rem;
		padding: 0.75rem 1rem;
		border-radius: 8px;
		background: var(--color-surface-900);
		border: 1px solid var(--color-surface-700);
	}
	.result-item--success { border-inline-start: 3px solid var(--color-primary-500); }
	.result-item--warning { border-inline-start: 3px solid var(--color-gold-500); }
	.result-item--error { border-inline-start: 3px solid var(--color-danger-500); }
	.result-status { flex-shrink: 0; padding-top: 2px; }
	.result-info { display: flex; flex-direction: column; gap: 0.25rem; min-width: 0; }
	.result-title { font-size: 0.875rem; font-weight: 600; color: var(--color-surface-100); }
	.result-meta { font-size: 0.75rem; color: var(--color-surface-400); display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
	.result-error { font-size: 0.75rem; color: var(--color-danger-400); }
	.confidence-badge { font-weight: 700; font-size: 0.7rem; }

	/* Badge */
	.badge {
		display: inline-block;
		padding: 0.2rem 0.5rem;
		border-radius: 6px;
		font-size: 0.6875rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	.badge--success { background: rgba(16, 185, 129, 0.15); color: var(--color-primary-400); }
	.badge--error { background: rgba(244, 63, 94, 0.15); color: var(--color-danger-400); }
	.badge--warning { background: rgba(251, 191, 36, 0.15); color: var(--color-gold-400); }

	/* Tabs */
	.tabs {
		display: flex;
		gap: 2px;
		margin-bottom: 1rem;
		border-bottom: 1px solid var(--color-surface-700);
	}
	.tab {
		padding: 0.625rem 1rem;
		background: none;
		border: none;
		color: var(--color-surface-400);
		font-size: 0.8125rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s;
		border-bottom: 2px solid transparent;
		font-family: inherit;
	}
	.tab:hover { color: var(--color-surface-200); }
	.tab--active {
		color: var(--color-primary-400);
		border-bottom-color: var(--color-primary-500);
		font-weight: 600;
	}
	.tab-content { min-height: 200px; }

	/* Tables */
	.jobs-table-wrapper { overflow-x: auto; }
	.data-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.8125rem;
	}
	.data-table th {
		text-align: start;
		padding: 0.625rem 0.75rem;
		color: var(--color-surface-400);
		font-weight: 600;
		font-size: 0.6875rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		border-bottom: 1px solid var(--color-surface-700);
		white-space: nowrap;
	}
	.data-table td {
		padding: 0.625rem 0.75rem;
		color: var(--color-surface-200);
		border-bottom: 1px solid var(--color-surface-800);
	}
	.data-table tbody tr:hover { background: var(--color-surface-800); }
	.td-title { font-weight: 600; max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.td-error { color: var(--color-danger-400); font-size: 0.75rem; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

	/* Provider cards */
	.provider-cards { display: flex; gap: 1rem; flex-wrap: wrap; }
	.provider-card {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem;
		background: var(--color-surface-800);
		border: 1px solid var(--color-surface-700);
		border-radius: 10px;
		min-width: 220px;
	}
	.provider-icon {
		width: 40px;
		height: 40px;
		border-radius: 10px;
		background: linear-gradient(135deg, var(--color-primary-700), var(--color-primary-500));
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		flex-shrink: 0;
	}
	.provider-icon svg { width: 20px; height: 20px; }
	.provider-name { font-weight: 600; color: var(--color-surface-100); display: block; }
	.provider-url { font-size: 0.6875rem; color: var(--color-surface-500); display: block; }

	/* Empty */
	.empty-state {
		text-align: center;
		padding: 3rem 1rem;
		color: var(--color-surface-500);
		font-size: 0.875rem;
	}

	.overview-section h3 {
		font-size: 0.875rem;
		font-weight: 600;
		color: var(--color-surface-300);
		margin-bottom: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
</style>
