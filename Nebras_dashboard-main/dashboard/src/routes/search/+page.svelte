<!--
  Global Search Page — /search
  ──────────────────────────────────────────────────────────
  بحث موحَّد عبر الأقسام + الملفّات + الفيديوهات في المشاريع الثلاثة
  (Nebras, Mshcat, OldApp). يعتمد حصرًا على طبقة الـ API الحاليّة (لا
  يُنشئ قنوات بيانات جديدة) ويطبّق Arabic-aware AND search + ranking.
-->
<script>
	import DashboardLayout from '$lib/components/DashboardLayout.svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import {
		listMyMainSections,
		listMySubSections,
		listMySecondarySections,
		listMyFiles,
		listMyYoutubeVideos,
		getLastPartialFailures
	} from '$lib/api/moderator.js';
	import { t } from '$lib/i18n/store.svelte.js';
	import { tokenize, highlightMatches } from '$lib/utils/search.js';

	let query = $state('');
	let activeTab = $state('all'); // all | sections | files | videos
	let isLoading = $state(false);
	let error = $state('');
	let partialFailures = $state([]);
	let searchTokens = $state([]);

	let sectionsResults = $state([]);
	let filesResults = $state([]);
	let videosResults = $state([]);

	let counts = $derived({
		sections: sectionsResults.length,
		files: filesResults.length,
		videos: videosResults.length,
		all: sectionsResults.length + filesResults.length + videosResults.length
	});

	// يقرأ الاستعلام من URL عند فتح الصفحة ويُشغّل البحث فورًا.
	$effect(() => {
		const q = String($page.url.searchParams.get('q') || '').trim();
		if (q !== query) {
			query = q;
			if (q) runSearch();
			else resetAll();
		}
	});

	function resetAll() {
		sectionsResults = [];
		filesResults = [];
		videosResults = [];
		searchTokens = [];
		partialFailures = [];
		error = '';
	}

	async function runSearch() {
		const q = String(query || '').trim();
		if (!q) { resetAll(); return; }
		isLoading = true;
		error = '';
		searchTokens = tokenize(q);
		try {
			// نُشغّل كلّ المصادر بالتوازي. كلّ مصدر يُطبّق فلترة AND + ranking
			// بنفسه داخل moderator.js، فنستقبل نتائج مرتّبة جاهزة.
			const [mains, subs, secondaries, files, videos] = await Promise.all([
				listMyMainSections({ search: q, page: 1, requireSearch: true }),
				listMySubSections({ search: q, page: 1, requireSearch: true }),
				listMySecondarySections({ search: q, page: 1, requireSearch: true }),
				listMyFiles({ search: q, page: 1, requireSearch: true }),
				listMyYoutubeVideos({ search: q, page: 1, requireSearch: true })
			]);
			sectionsResults = [
				...mains.results.map((x) => ({ ...x, _level: 'main' })),
				...subs.results.map((x) => ({ ...x, _level: 'sub' })),
				...secondaries.results.map((x) => ({ ...x, _level: 'secondary' }))
			];
			filesResults = files.results || [];
			videosResults = videos.results || [];
			partialFailures = getLastPartialFailures();
		} catch (err) {
			error = err?.message || String(err);
		} finally {
			isLoading = false;
		}
	}

	function submit(e) {
		e?.preventDefault?.();
		const q = String(query || '').trim();
		if (!q) return;
		const url = new URL($page.url);
		url.searchParams.set('q', q);
		goto(url.pathname + url.search, { replaceState: true, noScroll: true });
		runSearch();
	}

	function handleKey(e) {
		if (e.key === 'Enter') submit(e);
		else if (e.key === 'Escape') { query = ''; resetAll(); }
	}

	function levelLabel(l) {
		if (l === 'main') return t('sections.main_section');
		if (l === 'sub') return t('sections.sub_section');
		return t('sections.secondary');
	}
</script>

<svelte:head><title>{t('common.search_global_title')} — Nebras</title></svelte:head>

<DashboardLayout>
	<div class="page">
		<div class="page-header">
			<div>
				<h1 class="page-title">{t('common.search_global_title')}</h1>
				<p class="page-desc">{t('common.search_global_desc')}</p>
			</div>
		</div>

		<form class="search-form" onsubmit={submit}>
			<div class="search-box">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="search-icon"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
				<!-- svelte-ignore a11y_autofocus -->
				<input type="text" placeholder={t('common.search_global_placeholder')} bind:value={query} onkeydown={handleKey} class="search-input" autofocus />
				{#if query}
					<button type="button" class="search-clear" aria-label={t('common.search_clear')} onclick={() => { query = ''; resetAll(); }}>
						<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 18L18 6M6 6l12 12" /></svg>
					</button>
				{/if}
			</div>
			<button class="btn btn-primary" type="submit" disabled={!String(query || '').trim()}>
				{t('common.search_btn')}
			</button>
		</form>

		{#if error}<div class="alert alert-error">{error}</div>{/if}
		{#if partialFailures.length > 0}
			<div class="alert alert-warning">
				{t('common.search_partial_warning')}
				{#each partialFailures as f}<span style="display:inline-block;margin:0 0.35rem">· {f.source}</span>{/each}
			</div>
		{/if}

		<div class="tabs">
			<button class="tab" class:active={activeTab === 'all'} onclick={() => activeTab = 'all'}>{t('common.all')} ({counts.all})</button>
			<button class="tab" class:active={activeTab === 'sections'} onclick={() => activeTab = 'sections'}>{t('common.sections')} ({counts.sections})</button>
			<button class="tab" class:active={activeTab === 'files'} onclick={() => activeTab = 'files'}>{t('content.file_uploads')} ({counts.files})</button>
			<button class="tab" class:active={activeTab === 'videos'} onclick={() => activeTab = 'videos'}>{t('content.youtube_videos')} ({counts.videos})</button>
		</div>

		{#if isLoading}
			<div class="state-box"><div class="spinner"></div><span>{t('common.loading')}</span></div>
		{:else if !String(query || '').trim()}
			<div class="state-box empty-state">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" stroke-linecap="round" stroke-linejoin="round" /></svg>
				<p class="empty-title">{t('common.search_empty_title')}</p>
				<p class="empty-hint">{t('common.search_empty_hint')}</p>
			</div>
		{:else if counts.all === 0}
			<div class="state-box empty-state">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon"><path d="M19 11H5" stroke-linecap="round" stroke-linejoin="round" /></svg>
				<p>{t('common.search_no_results')}</p>
			</div>
		{:else}
			<!-- Sections group -->
			{#if (activeTab === 'all' || activeTab === 'sections') && sectionsResults.length > 0}
				<h2 class="group-title">{t('common.sections')} <span class="count-badge">{sectionsResults.length}</span></h2>
				<div class="grid">
					{#each sectionsResults as item (item._level + ':' + String(item.id))}
						<a class="result-card" href={`/moderator/sections?level=${item._level}`}>
							{#if item.thumbnail}<img class="thumb" src={item.thumbnail} alt={item.name} />{/if}
							<div class="body">
								<span class="chip">{levelLabel(item._level)}</span>
								<h3 class="title">{@html highlightMatches(item.name, searchTokens)}</h3>
								<div class="meta">#{item.id}</div>
							</div>
						</a>
					{/each}
				</div>
			{/if}

			<!-- Files group -->
			{#if (activeTab === 'all' || activeTab === 'files') && filesResults.length > 0}
				<h2 class="group-title">{t('content.file_uploads')} <span class="count-badge">{filesResults.length}</span></h2>
				<div class="grid">
					{#each filesResults as item (item.id)}
						<a class="result-card" href={`/moderator/content/files`}>
							{#if item.metadata?.thumbnail}<img class="thumb" src={item.metadata.thumbnail} alt={item.metadata?.title} />{/if}
							<div class="body">
								<span class="chip">{item.metadata?.content_type || 'file'}</span>
								<h3 class="title">{@html highlightMatches(item.metadata?.title || item.filename || 'Untitled', searchTokens)}</h3>
								{#if item.metadata?.description}<p class="desc">{@html highlightMatches(String(item.metadata.description).slice(0, 120), searchTokens)}</p>{/if}
							</div>
						</a>
					{/each}
				</div>
			{/if}

			<!-- Videos group -->
			{#if (activeTab === 'all' || activeTab === 'videos') && videosResults.length > 0}
				<h2 class="group-title">{t('content.youtube_videos')} <span class="count-badge">{videosResults.length}</span></h2>
				<div class="grid">
					{#each videosResults as item (item.id)}
						<a class="result-card" href={`/moderator/content/youtube`}>
							{#if item.metadata?.thumbnail}<img class="thumb" src={item.metadata.thumbnail} alt={item.metadata?.title} />{/if}
							<div class="body">
								<span class="chip">YouTube</span>
								<h3 class="title">{@html highlightMatches(item.metadata?.title || 'Untitled', searchTokens)}</h3>
								{#if item.metadata?.author}<div class="meta">· {item.metadata.author}</div>{/if}
							</div>
						</a>
					{/each}
				</div>
			{/if}
		{/if}
	</div>
</DashboardLayout>

<style>
	:global(.hl) { background: rgba(234, 179, 8, 0.32); color: inherit; padding: 0 0.125rem; border-radius: 3px; }
	.page { padding: 0; }
	.page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem; }
	.page-title { font-size: 1.5rem; font-weight: 700; margin: 0 0 0.25rem 0; }
	.page-desc { color: var(--color-surface-400); margin: 0; font-size: 0.9rem; }
	.search-form { display: flex; gap: 0.5rem; align-items: center; margin-bottom: 1rem; }
	.search-box { display: flex; align-items: center; gap: 0.5rem; padding: 0.65rem 0.9rem; background: var(--color-surface-800); border: 1px solid var(--color-surface-700); border-radius: 10px; flex: 1; max-width: 560px; }
	.search-box:focus-within { border-color: var(--color-primary-600); }
	.search-icon { width: 16px; height: 16px; color: var(--color-surface-500); }
	.search-input { flex: 1; background: none; border: none; outline: none; color: var(--color-surface-100); font-size: 0.95rem; font-family: inherit; }
	.search-clear { background: none; border: none; color: var(--color-surface-400); cursor: pointer; padding: 0; display: inline-flex; }
	.search-clear:hover { color: var(--color-surface-100); }
	.search-clear svg { width: 14px; height: 14px; }
	.btn { padding: 0.55rem 1rem; border-radius: 10px; border: none; cursor: pointer; font-weight: 600; font-size: 0.9rem; }
	.btn-primary { background: var(--color-primary-600); color: white; }
	.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
	.tabs { display: flex; gap: 0.5rem; border-bottom: 1px solid var(--color-surface-700); margin: 0.75rem 0 1.25rem 0; overflow-x: auto; }
	.tab { padding: 0.5rem 0.9rem; border: none; background: none; color: var(--color-surface-300); cursor: pointer; font-size: 0.875rem; border-bottom: 2px solid transparent; white-space: nowrap; }
	.tab.active { color: var(--color-primary-400); border-bottom-color: var(--color-primary-500); font-weight: 600; }
	.group-title { font-size: 0.95rem; color: var(--color-surface-300); margin: 1rem 0 0.5rem 0; display: flex; align-items: center; gap: 0.5rem; }
	.count-badge { font-size: 0.75rem; background: var(--color-surface-700); color: var(--color-surface-200); padding: 0.15rem 0.5rem; border-radius: 999px; }
	.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 0.75rem; margin-bottom: 0.75rem; }
	.result-card { background: var(--color-surface-800); border: 1px solid var(--color-surface-700); border-radius: 10px; padding: 0.75rem; text-decoration: none; color: inherit; display: flex; flex-direction: column; gap: 0.5rem; transition: border-color 0.15s, transform 0.15s; }
	.result-card:hover { border-color: var(--color-primary-600); transform: translateY(-2px); }
	.thumb { width: 100%; height: 120px; object-fit: cover; border-radius: 8px; }
	.chip { display: inline-block; font-size: 0.7rem; padding: 0.1rem 0.45rem; border-radius: 4px; background: var(--color-surface-700); color: var(--color-surface-200); }
	.title { font-size: 0.95rem; font-weight: 600; margin: 0.1rem 0 0 0; color: var(--color-surface-100); }
	.desc { font-size: 0.8rem; color: var(--color-surface-400); margin: 0.2rem 0 0 0; }
	.meta { font-size: 0.75rem; color: var(--color-surface-500); }
	.state-box { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 220px; gap: 0.75rem; color: var(--color-surface-400); }
	.empty-icon { width: 48px; height: 48px; color: var(--color-surface-600); }
	.empty-title { font-size: 1rem; color: var(--color-surface-200); margin: 0; }
	.empty-hint { font-size: 0.85rem; color: var(--color-surface-500); margin: 0; text-align: center; max-width: 420px; }
	.spinner { width: 28px; height: 28px; border: 3px solid var(--color-surface-700); border-top-color: var(--color-primary-500); border-radius: 50%; animation: spin 0.8s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }
	.alert { padding: 0.6rem 0.85rem; border-radius: 8px; font-size: 0.85rem; margin-bottom: 0.75rem; }
	.alert-error { background: rgba(239, 68, 68, 0.12); border: 1px solid rgba(239, 68, 68, 0.35); color: #fca5a5; }
	.alert-warning { background: rgba(234, 179, 8, 0.12); border: 1px solid rgba(234, 179, 8, 0.35); color: #fde68a; }
</style>
