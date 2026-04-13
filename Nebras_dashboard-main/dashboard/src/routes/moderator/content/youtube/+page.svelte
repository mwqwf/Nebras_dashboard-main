<!--
  Moderator Content — /moderator/content
  YouTube Videos CRUD (R2 files to be added later).
  Create with: video_url, metadata (title, description, subsection, secondary_subsection), thumbnail.
-->
<script>
	import { onMount } from 'svelte';
	import {
		listMyYoutubeVideos, createYoutubeVideo, updateYoutubeVideo, removeYoutubeVideo,
		listMyMainSections, listMySubSections, listMySecondarySections
	} from '$lib/api/moderator.js';
	import { t } from '$lib/i18n/store.svelte.js';

	// ─── State ──────────────────────────────────────────
	let items = $state([]);
	let totalCount = $state(0);
	let currentPage = $state(1);
	let searchQuery = $state('');
	let filterMainSection = $state('');
	let filterSubSection = $state('');
	let filterIsListed = $state('');
	let isLoading = $state(true);
	let error = $state('');

	// Dropdown options
	let mainSectionsList = $state([]);
	let subSectionsList = $state([]);
	let secondarySectionsList = $state([]);

	// Create modal
	let showCreateModal = $state(false);
	let createForm = $state({ video_url: '', title: '', description: '', author: '', main_section: '', subsection: '', secondary_subsection: '', is_listed: true });
	let createThumbnail = $state(null);
	let createThumbnailPreview = $state('');
	let createFormError = $state('');
	let createFormLoading = $state(false);
	let createSubOptions = $state([]);
	let createSecondaryOptions = $state([]);

	// Edit modal
	let showEditModal = $state(false);
	let editingItem = $state(null);
	let editForm = $state({ video_url: '', title: '', description: '', author: '', is_listed: true });
	let editThumbnail = $state(null);
	let editThumbnailPreview = $state('');
	let editFormError = $state('');
	let editFormLoading = $state(false);

	// Delete modal
	let showDeleteModal = $state(false);
	let deletingItem = $state(null);
	let deleteLoading = $state(false);

	// Detail modal
	let showDetailModal = $state(false);
	let detailItem = $state(null);

	const PAGE_SIZE = 10;
	let totalPages = $derived(Math.ceil(totalCount / PAGE_SIZE));
	let searchTimeout;

	// ─── Lifecycle ──────────────────────────────────────
	onMount(() => {
		fetchItems();
		fetchMainSectionsOptions();
	});

	// ─── Fetch ──────────────────────────────────────────
	async function fetchItems() {
		isLoading = true;
		error = '';
		try {
			const data = await listMyYoutubeVideos({
				search: searchQuery,
				main_section: filterMainSection || undefined,
				subsection: filterSubSection || undefined,
				metadata__is_listed: filterIsListed === '' ? undefined : filterIsListed === 'true',
				page: currentPage
			});
			items = data.results;
			totalCount = data.count;
		} catch (err) { error = err.message; }
		finally { isLoading = false; }
	}

	async function fetchMainSectionsOptions() {
		try {
			const data = await listMyMainSections({ page: 1 });
			mainSectionsList = data.results;
		} catch { /* silent */ }
	}

	async function fetchSubOptions(mainId, target = 'filter') {
		try {
			const data = await listMySubSections({ main_section: mainId || undefined, page: 1 });
			if (target === 'filter') subSectionsList = data.results;
			else createSubOptions = data.results;
		} catch {
			if (target === 'filter') subSectionsList = [];
			else createSubOptions = [];
		}
	}

	async function fetchSecondaryOptions(subId) {
		try {
			const data = await listMySecondarySections({ sub_section: subId || undefined, page: 1 });
			createSecondaryOptions = data.results;
		} catch { createSecondaryOptions = []; }
	}

	// ─── Filter handlers ────────────────────────────────
	function handleSearch() {
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => { currentPage = 1; fetchItems(); }, 400);
	}

	function handleMainFilterChange() {
		currentPage = 1;
		filterSubSection = '';
		if (filterMainSection) fetchSubOptions(filterMainSection, 'filter');
		else subSectionsList = [];
		fetchItems();
	}

	function handleSubFilterChange() {
		currentPage = 1;
		fetchItems();
	}

	function goToPage(p) {
		if (p < 1 || p > totalPages) return;
		currentPage = p;
		fetchItems();
	}

	// ─── Create ─────────────────────────────────────────
	function openCreateModal() {
		createForm = { video_url: '', title: '', description: '', author: '', main_section: '', subsection: '', secondary_subsection: '', is_listed: true };
		createThumbnail = null;
		createThumbnailPreview = '';
		createFormError = '';
		createSubOptions = [];
		createSecondaryOptions = [];
		showCreateModal = true;
		if (mainSectionsList.length === 0) fetchMainSectionsOptions();
	}

	function handleCreateMainChange() {
		createForm.subsection = '';
		createForm.secondary_subsection = '';
		createSecondaryOptions = [];
		if (createForm.main_section) fetchSubOptions(createForm.main_section, 'create');
		else createSubOptions = [];
	}

	function handleCreateSubChange() {
		createForm.secondary_subsection = '';
		if (createForm.subsection) fetchSecondaryOptions(createForm.subsection);
		else createSecondaryOptions = [];
	}

	function handleCreateThumbnailChange(e) {
		const file = e.target.files?.[0];
		if (file) {
			createThumbnail = file;
			const r = new FileReader();
			r.onload = (ev) => { createThumbnailPreview = ev.target.result; };
			r.readAsDataURL(file);
		}
	}

	async function handleCreate() {
		createFormError = '';
		if (!createForm.subsection) { createFormError = 'Please select a sub section.'; return; }
		if (!createForm.video_url) { createFormError = 'Please enter a YouTube URL.'; return; }
		if (!createForm.title) { createFormError = 'Please enter a title.'; return; }

		createFormLoading = true;
		try {
			const payload = {
				video_url: createForm.video_url,
				metadata: {
					title: createForm.title,
					description: createForm.description || undefined,
					author: createForm.author || undefined,
					subsection: Number(createForm.subsection),
					content_type: 'youtube',
					is_listed: createForm.is_listed
				}
			};
			if (createForm.secondary_subsection) {
				payload.metadata.secondary_subsection = Number(createForm.secondary_subsection);
			}
			if (createThumbnail) payload.thumbnail = createThumbnail;

			await createYoutubeVideo(payload);
			showCreateModal = false;
			fetchItems();
		} catch (err) { createFormError = parseFormError(err.message); }
		finally { createFormLoading = false; }
	}

	// ─── Edit ───────────────────────────────────────────
	function openEditModal(item) {
		editingItem = item;
		editForm = {
			video_url: item.video_url || '',
			title: item.metadata?.title || '',
			description: item.metadata?.description || '',
			author: item.metadata?.author || '',
			is_listed: item.metadata?.is_listed ?? true
		};
		editThumbnail = null;
		editThumbnailPreview = item.metadata?.thumbnail || '';
		editFormError = '';
		showEditModal = true;
	}

	function handleEditThumbnailChange(e) {
		const file = e.target.files?.[0];
		if (file) {
			editThumbnail = file;
			const r = new FileReader();
			r.onload = (ev) => { editThumbnailPreview = ev.target.result; };
			r.readAsDataURL(file);
		}
	}

	async function handleEdit() {
		editFormError = '';
		editFormLoading = true;
		try {
			const payload = {
				video_url: editForm.video_url,
				metadata: { title: editForm.title, description: editForm.description || undefined, author: editForm.author || undefined, is_listed: editForm.is_listed }
			};
			if (editThumbnail) payload.thumbnail = editThumbnail;
			await updateYoutubeVideo(editingItem.id, payload);
			showEditModal = false;
			fetchItems();
		} catch (err) { editFormError = parseFormError(err.message); }
		finally { editFormLoading = false; }
	}

	// ─── Delete ─────────────────────────────────────────
	function openDeleteModal(item) { deletingItem = item; showDeleteModal = true; }

	async function handleDelete() {
		deleteLoading = true;
		try {
			await removeYoutubeVideo(deletingItem.id);
			showDeleteModal = false;
			deletingItem = null;
			fetchItems();
		} catch (err) { error = err.message; showDeleteModal = false; }
		finally { deleteLoading = false; }
	}

	// ─── Detail ─────────────────────────────────────────
	function openDetailModal(item) { detailItem = item; showDetailModal = true; }

	// ─── Helpers ────────────────────────────────────────
	function parseFormError(msg) {
		try {
			const parsed = JSON.parse(msg);
			const messages = [];
			for (const [key, val] of Object.entries(parsed)) {
				if (typeof val === 'object' && !Array.isArray(val)) {
					for (const [k2, v2] of Object.entries(val)) {
						messages.push(`${k2}: ${Array.isArray(v2) ? v2.join(', ') : v2}`);
					}
				} else {
					messages.push(`${key}: ${Array.isArray(val) ? val.join(', ') : val}`);
				}
			}
			return messages.join(' | ');
		} catch { return msg; }
	}

	function formatDate(d) {
		if (!d) return '—';
		return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
	}

	function extractYoutubeId(url) {
		if (!url) return null;
		const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/);
		return m ? m[1] : null;
	}

	function getMainName(id) {
		return mainSectionsList.find(s => s.id === id)?.name || `#${id}`;
	}
</script>

<svelte:head>
	<title>{t('content.title')} — Nebras</title>
</svelte:head>

<div class="page">
	<div class="page-header">
		<div>
			<h1 class="page-title">{t('content.my_content')}</h1>
			<p class="page-desc">{t('content.my_content_desc')}</p>
		</div>
		<button class="btn btn-primary" onclick={openCreateModal} id="create-content-btn">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="btn-icon"><path d="M12 5v14m-7-7h14" /></svg>
			{t('content.add_youtube')}
		</button>
	</div>

	<!-- Tabs -->
	<div class="tabs">
		<a href="/moderator/content/youtube" class="tab active">{t('content.youtube_videos')}</a>
		<a href="/moderator/content/files" class="tab">{t('content.file_uploads')}</a>
	</div>

	<!-- Toolbar -->
	<div class="toolbar">
		<div class="search-box">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="search-icon"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
			<input type="text" placeholder={t('content.search_videos')} bind:value={searchQuery} oninput={handleSearch} class="search-input" />
		</div>
		<select class="filter-select" bind:value={filterMainSection} onchange={handleMainFilterChange}>
			<option value="">{t('content.all_main_sections')}</option>
			{#each mainSectionsList as ms}<option value={ms.id}>{ms.name}</option>{/each}
		</select>
		{#if filterMainSection}
			<select class="filter-select" bind:value={filterSubSection} onchange={handleSubFilterChange}>
				<option value="">{t('content.all_sub_sections')}</option>
				{#each subSectionsList as ss}<option value={ss.id}>{ss.name}</option>{/each}
			</select>
		{/if}
		<select class="filter-select" bind:value={filterIsListed} onchange={handleFilterChange}>
			<option value="">{t('common.all')} ({t('common.is_listed')})</option>
			<option value="true">{t('common.listed')}</option>
			<option value="false">{t('common.unlisted')}</option>
		</select>
		<div class="count-badge">{totalCount} {t('common.total')}</div>
	</div>

	{#if error}<div class="alert alert-error">{error}</div>{/if}

	<!-- Content Grid -->
	<div class="content-container">
		{#if isLoading}
			<div class="state-box"><div class="spinner"></div><span>{t('common.loading')}</span></div>
		{:else if items.length === 0}
			<div class="state-box empty-state">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon"><path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round" /></svg>
				<p>{t('content.no_youtube_yet')}</p>
				<button class="btn btn-primary btn-sm" onclick={openCreateModal}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="btn-icon"><path d="M12 5v14m-7-7h14" /></svg>
					{t('content.add_first_video')}
				</button>
			</div>
		{:else}
			<div class="content-grid">
				{#each items as item (item.id)}
					{@const ytId = extractYoutubeId(item.video_url)}
					<div class="content-card">
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="card-thumbnail" onclick={() => openDetailModal(item)}>
							{#if item.metadata?.thumbnail}
								<img src={item.metadata.thumbnail} alt={item.metadata?.title} class="thumbnail-img" />
							{:else if ytId}
								<img src="https://img.youtube.com/vi/{ytId}/mqdefault.jpg" alt={item.metadata?.title} class="thumbnail-img" />
							{:else}
								<div class="thumbnail-placeholder">
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" /><path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round" /></svg>
								</div>
							{/if}
							<div class="type-badge">YouTube</div>
						</div>
						<div class="card-body">
							<h3 class="card-title">{item.metadata?.title || 'Untitled'}</h3>
							{#if item.metadata?.description}
								<p class="card-desc">{item.metadata.description.slice(0, 80)}{item.metadata.description.length > 80 ? '...' : ''}</p>
							{/if}
							<div class="card-footer">
								<span class="card-date">{formatDate(item.metadata?.created_at)}</span>
								<div class="card-actions">
									<button class="action-btn edit" title="Edit" onclick={() => openEditModal(item)}>
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
									</button>
									<button class="action-btn delete" title="Delete" onclick={() => openDeleteModal(item)}>
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
									</button>
								</div>
							</div>
							{#if item.metadata?.author}
								<div class="meta-row">
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="meta-icon"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
									<span>{item.metadata.author}</span>
								</div>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Pagination -->
	{#if totalPages > 1}
		<div class="pagination">
			<button class="page-btn" disabled={currentPage === 1} onclick={() => goToPage(currentPage - 1)}>← {t('common.previous')}</button>
			<div class="page-numbers">
				{#each Array.from({ length: totalPages }, (_, i) => i + 1) as p}
					{#if p === 1 || p === totalPages || (p >= currentPage - 1 && p <= currentPage + 1)}
						<button class="page-num" class:active={p === currentPage} onclick={() => goToPage(p)}>{p}</button>
					{:else if p === currentPage - 2 || p === currentPage + 2}
						<span class="page-ellipsis">...</span>
					{/if}
				{/each}
			</div>
			<button class="page-btn" disabled={currentPage === totalPages} onclick={() => goToPage(currentPage + 1)}>{t('common.next')} →</button>
		</div>
	{/if}
</div>

<!-- ═══════════════ Detail Modal ═══════════════ -->
{#if showDetailModal && detailItem}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div class="modal-overlay" role="dialog" tabindex="-1" onkeydown={(e) => e.key === 'Escape' && (showDetailModal = false)} onclick={(e) => { if (e.target === e.currentTarget) showDetailModal = false; }}>
		<div class="modal modal-lg animate-fade-in">
			<div class="modal-header">
				<h2 class="modal-title">{t('content.video_details')}</h2>
				<button class="modal-close" aria-label="Close" onclick={() => (showDetailModal = false)}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" /></svg>
				</button>
			</div>
			<div class="detail-content">
				{#if extractYoutubeId(detailItem.video_url)}
					{@const ytId = extractYoutubeId(detailItem.video_url)}
					<div class="video-embed">
						<iframe src="https://www.youtube.com/embed/{ytId}" title={detailItem.metadata?.title} frameborder="0" allowfullscreen></iframe>
					</div>
				{/if}
				<div class="detail-fields">
					<div class="detail-row"><span class="detail-label">{t('common.title')}</span><span class="detail-value">{detailItem.metadata?.title}</span></div>
					{#if detailItem.metadata?.author}
						<div class="detail-row">
							<span class="detail-label">{t('content.author')}</span>
							<span class="detail-value">{detailItem.metadata.author}</span>
						</div>
					{/if}
					{#if detailItem.metadata?.description}<div class="detail-row"><span class="detail-label">{t('content.description')}</span><span class="detail-value desc-val">{detailItem.metadata.description}</span></div>{/if}
					<div class="detail-row"><span class="detail-label">{t('content.url')}</span><span class="detail-value"><a href={detailItem.video_url} target="_blank" rel="noopener" class="link">{detailItem.video_url}</a></span></div>
					<div class="detail-row"><span class="detail-label">{t('sections.sub_section')}</span><span class="detail-value">#{detailItem.metadata?.subsection}</span></div>
					{#if detailItem.metadata?.secondary_subsection}<div class="detail-row"><span class="detail-label">{t('sections.secondary')}</span><span class="detail-value">#{detailItem.metadata.secondary_subsection}</span></div>{/if}
					<div class="detail-row"><span class="detail-label">{t('common.is_listed')}</span><span class="detail-value" style="color: {detailItem.metadata?.is_listed !== false ? 'var(--color-primary-400)' : 'var(--color-danger-400)'};">{detailItem.metadata?.is_listed !== false ? t('common.listed') : t('common.unlisted')}</span></div>
					<div class="detail-row"><span class="detail-label">{t('content.created')}</span><span class="detail-value">{formatDate(detailItem.metadata?.created_at)}</span></div>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- ═══════════════ Create Modal ═══════════════ -->
{#if showCreateModal}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div class="modal-overlay" role="dialog" tabindex="-1" onkeydown={(e) => e.key === 'Escape' && (showCreateModal = false)} onclick={(e) => { if (e.target === e.currentTarget) showCreateModal = false; }}>
		<div class="modal animate-fade-in">
			<div class="modal-header">
				<h2 class="modal-title">{t('content.add_youtube')}</h2>
				<button class="modal-close" aria-label="Close" onclick={() => (showCreateModal = false)}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" /></svg>
				</button>
			</div>
			{#if createFormError}<div class="alert alert-error modal-alert">{createFormError}</div>{/if}
			<form onsubmit={(e) => { e.preventDefault(); handleCreate(); }} class="modal-form">
				<div class="form-group">
					<label for="create-url" class="form-label">{t('content.youtube_url')} *</label>
					<input type="url" id="create-url" bind:value={createForm.video_url} class="form-input" required placeholder="https://youtube.com/watch?v=..." />
					{#if extractYoutubeId(createForm.video_url)}
						<img src="https://img.youtube.com/vi/{extractYoutubeId(createForm.video_url)}/mqdefault.jpg" alt="Preview" class="url-preview" />
					{/if}
				</div>
				<div class="form-group">
					<label for="create-title" class="form-label">{t('common.title')} *</label>
					<input type="text" id="create-title" bind:value={createForm.title} class="form-input" required placeholder={t('common.title')} />
				</div>
				<div class="form-group">
					<label for="create-desc" class="form-label">{t('content.description')}</label>
					<textarea id="create-desc" bind:value={createForm.description} class="form-input form-textarea" rows="3" placeholder={t('common.optional')}></textarea>
				</div>
				<div class="form-group">
					<label for="create-author" class="form-label">{t('content.author')}</label>
					<input type="text" id="create-author" bind:value={createForm.author} class="form-input" placeholder="e.g. John Doe..." />
				</div>
				<!-- Section selectors (cascading) -->
				<div class="form-group">
					<label for="create-main" class="form-label">{t('sections.main_section')} *</label>
					<select id="create-main" bind:value={createForm.main_section} class="form-input" onchange={handleCreateMainChange} required>
						<option value="">{t('common.select')}</option>
						{#each mainSectionsList as ms}<option value={ms.id}>{ms.name}</option>{/each}
					</select>
				</div>
				{#if createForm.main_section}
					<div class="form-group">
						<label for="create-sub" class="form-label">{t('sections.sub_section')} *</label>
						<select id="create-sub" bind:value={createForm.subsection} class="form-input" onchange={handleCreateSubChange} required>
							<option value="">{t('common.select')}</option>
							{#each createSubOptions as ss}<option value={ss.id}>{ss.name}</option>{/each}
						</select>
					</div>
				{/if}
				{#if createForm.subsection && createSecondaryOptions.length > 0}
					<div class="form-group">
						<label for="create-secondary" class="form-label">{t('sections.secondary')}</label>
						<select id="create-secondary" bind:value={createForm.secondary_subsection} class="form-input">
							<option value="">{t('common.none')}</option>
							{#each createSecondaryOptions as sec}<option value={sec.id}>{sec.name}</option>{/each}
						</select>
					</div>
				{/if}
				<div class="form-group" style="margin-top: 1.5rem; margin-bottom: 0.5rem;">
					<label class="toggle-switch">
						<input type="checkbox" id="create-listed" bind:checked={createForm.is_listed} class="toggle-input" />
						<span class="toggle-slider"></span>
						<span class="toggle-label">{t('common.is_listed')}</span>
					</label>
				</div>
				<!-- Thumbnail -->
				<div class="form-group">
					<span class="form-label">{t('content.thumbnail')}</span>
					{#if createThumbnailPreview}
						<div class="upload-preview">
							<img src={createThumbnailPreview} alt="Preview" class="preview-img" />
							<button type="button" class="preview-remove" onclick={() => { createThumbnail = null; createThumbnailPreview = ''; }} title={t('common.remove')}>
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" /></svg>
							</button>
						</div>
					{:else}
						<label class="upload-zone" for="create-thumb">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="upload-icon"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" stroke-linecap="round" stroke-linejoin="round" /></svg>
							<span>{t('content.upload_thumb')}</span><span class="upload-hint">PNG, JPG, WebP</span>
						</label>
						<input type="file" id="create-thumb" accept="image/*" class="file-input-hidden" onchange={handleCreateThumbnailChange} />
					{/if}
				</div>
				<div class="modal-actions">
					<button type="button" class="btn btn-secondary" onclick={() => (showCreateModal = false)}>{t('common.cancel')}</button>
					<button type="submit" class="btn btn-primary" disabled={createFormLoading}>
						{#if createFormLoading}<span class="spinner-sm"></span>{/if}{t('content.create_video')}
					</button>
				</div>
			</form>>
		</div>
	</div>
{/if}

<!-- ═══════════════ Edit Modal ═══════════════ -->
{#if showEditModal && editingItem}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div class="modal-overlay" role="dialog" tabindex="-1" onkeydown={(e) => e.key === 'Escape' && (showEditModal = false)} onclick={(e) => { if (e.target === e.currentTarget) showEditModal = false; }}>
		<div class="modal animate-fade-in">
			<div class="modal-header">
				<h2 class="modal-title">{t('content.edit_video')}</h2>
				<button class="modal-close" aria-label="Close" onclick={() => (showEditModal = false)}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" /></svg>
				</button>
			</div>
			{#if editFormError}<div class="alert alert-error modal-alert">{editFormError}</div>{/if}
			<form onsubmit={(e) => { e.preventDefault(); handleEdit(); }} class="modal-form">
				<div class="form-group">
					<label for="edit-url" class="form-label">{t('content.youtube_url')} *</label>
					<input type="url" id="edit-url" bind:value={editForm.video_url} class="form-input" required />
				</div>
				<div class="form-group">
					<label for="edit-title" class="form-label">{t('common.title')} *</label>
					<input type="text" id="edit-title" bind:value={editForm.title} class="form-input" required />
				</div>
				<div class="form-group">
					<label for="edit-desc" class="form-label">{t('content.description')}</label>
					<textarea id="edit-desc" bind:value={editForm.description} class="form-input form-textarea" rows="3"></textarea>
				</div>
				<div class="form-group">
					<label for="edit-author" class="form-label">{t('content.author')}</label>
					<input type="text" id="edit-author" bind:value={editForm.author} class="form-input" placeholder="e.g. John Doe..." />
				</div>
				<div class="form-group" style="margin-top: 1.5rem; margin-bottom: 0.5rem;">
					<label class="toggle-switch">
						<input type="checkbox" id="edit-listed" bind:checked={editForm.is_listed} class="toggle-input" />
						<span class="toggle-slider"></span>
						<span class="toggle-label">{t('common.is_listed')}</span>
					</label>
				</div>
				<div class="form-group">
					<span class="form-label">{t('content.thumbnail')}</span>
					{#if editThumbnailPreview}
						<div class="upload-preview">
							<img src={editThumbnailPreview} alt="Preview" class="preview-img" />
							<button type="button" class="preview-remove" aria-label="Remove Thumbnail" onclick={() => { editThumbnail = null; editThumbnailPreview = ''; }}>
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" /></svg>
							</button>
							<label class="change-thumbnail-btn" for="edit-thumb">{t('content.change_image')}</label>
							<input type="file" id="edit-thumb" accept="image/*" class="file-input-hidden" onchange={handleEditThumbnailChange} />
						</div>
					{:else}
						<label class="upload-zone" for="edit-thumb-new">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="upload-icon"><path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" stroke-linecap="round" stroke-linejoin="round" /></svg>
							<span>{t('content.upload_thumb')}</span><span class="upload-hint">PNG, JPG, WebP</span>
						</label>
						<input type="file" id="edit-thumb-new" accept="image/*" class="file-input-hidden" onchange={handleEditThumbnailChange} />
					{/if}
				</div>
				<div class="modal-actions">
					<button type="button" class="btn btn-secondary" onclick={() => (showEditModal = false)}>{t('common.cancel')}</button>
					<button type="submit" class="btn btn-primary" disabled={editFormLoading}>
						{#if editFormLoading}<span class="spinner-sm"></span>{/if}{t('common.save_changes')}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- ═══════════════ Delete Modal ═══════════════ -->
{#if showDeleteModal && deletingItem}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div class="modal-overlay" role="dialog" tabindex="-1" onkeydown={(e) => e.key === 'Escape' && (showDeleteModal = false)} onclick={(e) => { if (e.target === e.currentTarget) showDeleteModal = false; }}>
		<div class="modal modal-sm animate-fade-in">
			<div class="modal-header">
				<h2 class="modal-title">{t('content.delete_video')}</h2>
				<button class="modal-close" aria-label="Close" onclick={() => (showDeleteModal = false)}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" /></svg>
				</button>
			</div>
			<p class="delete-message">{t('content.delete_video_confirm')} <strong>"{deletingItem.metadata?.title}"</strong>? {t('common.cannot_be_undone')}</p>
			<div class="modal-actions pad-actions">
				<button class="btn btn-secondary" onclick={() => (showDeleteModal = false)}>{t('common.cancel')}</button>
				<button class="btn btn-danger" onclick={handleDelete} disabled={deleteLoading}>
					{#if deleteLoading}<span class="spinner-sm"></span>{/if}{t('common.delete')}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.page { display: flex; flex-direction: column; gap: 1.25rem; }
	.page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
	.page-title { font-size: 1.5rem; font-weight: 700; color: var(--color-surface-100); letter-spacing: -0.02em; }
	.page-desc { font-size: 0.8125rem; color: var(--color-surface-400); margin-top: 0.25rem; }

	/* Tabs */
	.tabs { display: flex; gap: 0.25rem; border-bottom: 1px solid var(--color-surface-700); }
	.tab { padding: 0.625rem 1rem; font-size: 0.8125rem; font-weight: 500; color: var(--color-surface-400); text-decoration: none; border-bottom: 2px solid transparent; transition: all 0.15s; }
	.tab:hover { color: var(--color-surface-200); }
	.tab.active { color: var(--color-primary-400); border-bottom-color: var(--color-primary-500); }

	/* Toolbar */
	.toolbar { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
	.search-box { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; background: var(--color-surface-800); border: 1px solid var(--color-surface-700); border-radius: 10px; flex: 1; max-width: 280px; transition: border-color 0.2s; }
	.search-box:focus-within { border-color: var(--color-primary-600); }
	.search-icon { width: 16px; height: 16px; color: var(--color-surface-500); flex-shrink: 0; }
	.search-input { flex: 1; background: none; border: none; outline: none; color: var(--color-surface-100); font-size: 0.8125rem; font-family: inherit; }
	.search-input::placeholder { color: var(--color-surface-500); }
	.filter-select { padding: 0.5rem 0.75rem; background: var(--color-surface-800); border: 1px solid var(--color-surface-700); border-radius: 10px; color: var(--color-surface-300); font-size: 0.8125rem; font-family: inherit; outline: none; cursor: pointer; max-width: 200px; }
	.filter-select:focus { border-color: var(--color-primary-600); }
	.filter-select option { background: var(--color-surface-800); color: var(--color-surface-100); }
	.count-badge { padding: 0.375rem 0.75rem; background: var(--color-surface-800); border: 1px solid var(--color-surface-700); border-radius: 100px; font-size: 0.75rem; color: var(--color-surface-400); font-weight: 500; margin-left: auto; }

	/* Alert */
	.alert { padding: 0.75rem 1rem; border-radius: 10px; font-size: 0.8125rem; }
	.alert-error { background: rgba(244, 63, 94, 0.1); border: 1px solid rgba(244, 63, 94, 0.2); color: var(--color-danger-400); }

	/* States */
	.content-container { min-height: 200px; }
	.state-box { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 3rem; gap: 0.75rem; color: var(--color-surface-500); font-size: 0.875rem; }
	.empty-state { padding: 4rem 2rem; }
	.empty-icon { width: 48px; height: 48px; color: var(--color-surface-600); }
	.spinner { width: 24px; height: 24px; border: 3px solid var(--color-surface-700); border-top-color: var(--color-primary-500); border-radius: 50%; animation: spin 0.6s linear infinite; }

	/* Grid */
	.content-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem; }
	.content-card { background: var(--color-surface-800); border: 1px solid var(--color-surface-700); border-radius: 14px; overflow: hidden; transition: all 0.2s ease; }
	.content-card:hover { border-color: var(--color-surface-600); box-shadow: 0 4px 24px rgba(0,0,0,0.2); }
	.card-thumbnail { width: 100%; height: 170px; overflow: hidden; position: relative; background: var(--color-surface-900); cursor: pointer; }
	.thumbnail-img { width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s ease; }
	.card-thumbnail:hover .thumbnail-img { transform: scale(1.05); }
	.thumbnail-placeholder { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--color-surface-600); }
	.thumbnail-placeholder svg { width: 40px; height: 40px; }
	.type-badge { position: absolute; top: 0.5rem; left: 0.5rem; padding: 0.2rem 0.5rem; background: rgba(255,0,0,0.75); backdrop-filter: blur(4px); border-radius: 6px; color: white; font-size: 0.625rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
	.card-body { padding: 1rem; }
	.card-title { font-size: 0.9375rem; font-weight: 600; color: var(--color-surface-100); margin-bottom: 0.25rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.card-desc { font-size: 0.75rem; color: var(--color-surface-500); margin-bottom: 0.75rem; line-height: 1.4; }
	.card-footer { display: flex; align-items: center; justify-content: space-between; padding-top: 0.75rem; border-top: 1px solid var(--color-surface-700); }
	.card-date { font-size: 0.6875rem; color: var(--color-surface-500); }
	.card-actions { display: flex; gap: 0.375rem; }
	.action-btn { width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border-radius: 8px; border: 1px solid var(--color-surface-600); background: transparent; color: var(--color-surface-400); cursor: pointer; transition: all 0.15s; }
	.action-btn svg { width: 14px; height: 14px; }
	.action-btn.edit:hover { background: rgba(5,150,105,0.1); border-color: var(--color-primary-700); color: var(--color-primary-400); }
	.action-btn.delete:hover { background: rgba(244,63,94,0.1); border-color: var(--color-danger-600); color: var(--color-danger-400); }

	/* Pagination */
	.pagination { display: flex; align-items: center; justify-content: center; gap: 0.5rem; }
	.page-btn { padding: 0.5rem 1rem; background: var(--color-surface-800); border: 1px solid var(--color-surface-700); border-radius: 8px; color: var(--color-surface-300); font-size: 0.8125rem; font-family: inherit; cursor: pointer; transition: all 0.15s; }
	.page-btn:hover:not(:disabled) { background: var(--color-surface-700); }
	.page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
	.page-numbers { display: flex; align-items: center; gap: 0.25rem; }
	.page-num { width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; border-radius: 8px; border: none; background: transparent; color: var(--color-surface-400); font-size: 0.8125rem; font-family: inherit; cursor: pointer; }
	.page-num:hover { background: var(--color-surface-700); }
	.page-num.active { background: var(--color-primary-700); color: white; font-weight: 600; }
	.page-ellipsis { color: var(--color-surface-500); padding: 0 0.25rem; }

	/* Buttons */
	.btn { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.625rem 1.125rem; border-radius: 10px; font-size: 0.8125rem; font-weight: 600; font-family: inherit; cursor: pointer; border: none; transition: all 0.15s; }
	.btn-sm { padding: 0.5rem 0.875rem; font-size: 0.75rem; }
	.btn-icon { width: 16px; height: 16px; }
	.btn-primary { background: linear-gradient(135deg, var(--color-primary-700), var(--color-primary-600)); color: white; }
	.btn-primary:hover { background: linear-gradient(135deg, var(--color-primary-600), var(--color-primary-500)); box-shadow: 0 4px 12px rgba(5,150,105,0.25); }
	.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
	.btn-secondary { background: var(--color-surface-700); color: var(--color-surface-300); border: 1px solid var(--color-surface-600); }
	.btn-secondary:hover { background: var(--color-surface-600); }
	.btn-danger { background: linear-gradient(135deg, var(--color-danger-600), var(--color-danger-500)); color: white; }
	.btn-danger:hover { box-shadow: 0 4px 12px rgba(244,63,94,0.25); }
	.btn-danger:disabled { opacity: 0.6; cursor: not-allowed; }

	/* Modal */
	.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 1rem; }
	.modal { width: 100%; max-width: 520px; background: var(--color-surface-800); border: 1px solid var(--color-surface-700); border-radius: 16px; box-shadow: var(--shadow-elevated); max-height: 90vh; overflow-y: auto; }
	.modal-sm { max-width: 400px; }
	.modal-lg { max-width: 640px; }
	.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--color-surface-700); }
	.modal-title { font-size: 1.125rem; font-weight: 700; color: var(--color-surface-100); }
	.modal-close { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 8px; border: none; background: transparent; color: var(--color-surface-500); cursor: pointer; transition: all 0.15s; }
	.modal-close:hover { background: var(--color-surface-700); color: var(--color-surface-300); }
	.modal-close svg { width: 18px; height: 18px; }
	.modal-alert { margin: 1rem 1.5rem 0; }
	.modal-form { padding: 1.25rem 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
	.modal-actions { display: flex; justify-content: flex-end; gap: 0.5rem; padding-top: 0.5rem; }
	.pad-actions { padding: 0 1.5rem 1.25rem; }
	.delete-message { padding: 1.25rem 1.5rem; font-size: 0.875rem; color: var(--color-surface-300); line-height: 1.5; }
	.delete-message strong { color: var(--color-surface-100); }

	/* Form */
	.form-group { display: flex; flex-direction: column; gap: 0.375rem; }
	.form-label { font-size: 0.8125rem; font-weight: 500; color: var(--color-surface-300); }
	.form-input { padding: 0.625rem 0.75rem; background: var(--color-surface-900); border: 1px solid var(--color-surface-600); border-radius: 8px; color: var(--color-surface-100); font-size: 0.8125rem; font-family: inherit; outline: none; transition: border-color 0.2s; }
	.form-input::placeholder { color: var(--color-surface-500); }
	.form-input:focus { border-color: var(--color-primary-600); }
	.form-textarea { resize: vertical; min-height: 60px; }

	/* Detail */
	.detail-content { padding: 1.5rem; }
	.video-embed { position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 10px; margin-bottom: 1.25rem; }
	.video-embed iframe { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 10px; }
	.detail-fields { display: flex; flex-direction: column; gap: 0.75rem; }
	.detail-row { display: flex; align-items: flex-start; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--color-surface-700); gap: 1rem; }
	.detail-row:last-child { border-bottom: none; }
	.detail-label { font-size: 0.8125rem; color: var(--color-surface-400); font-weight: 500; flex-shrink: 0; }
	.detail-value { font-size: 0.8125rem; color: var(--color-surface-100); font-weight: 600; text-align: right; }
	.desc-val { text-align: left; white-space: pre-wrap; font-weight: 400; }
	.link { color: var(--color-primary-400); text-decoration: none; word-break: break-all; }
	.link:hover { text-decoration: underline; }
	.url-preview { width: 100%; max-height: 120px; object-fit: cover; border-radius: 8px; margin-top: 0.5rem; }

	/* Upload */
	.upload-zone { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.5rem; padding: 1.25rem; border: 2px dashed var(--color-surface-600); border-radius: 12px; background: var(--color-surface-900); cursor: pointer; transition: all 0.2s ease; color: var(--color-surface-400); font-size: 0.8125rem; }
	.upload-zone:hover { border-color: var(--color-primary-600); background: rgba(5,150,105,0.05); color: var(--color-primary-400); }
	.upload-icon { width: 28px; height: 28px; }
	.upload-hint { font-size: 0.6875rem; color: var(--color-surface-500); }
	.file-input-hidden { position: absolute; width: 0; height: 0; opacity: 0; pointer-events: none; }
	.upload-preview { position: relative; border-radius: 10px; overflow: hidden; border: 1px solid var(--color-surface-600); }
	.preview-img { width: 100%; max-height: 150px; object-fit: cover; display: block; }
	.preview-remove { position: absolute; top: 0.5rem; right: 0.5rem; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); border: none; color: white; cursor: pointer; }
	.preview-remove:hover { background: rgba(244,63,94,0.8); }
	.preview-remove svg { width: 14px; height: 14px; }
	.change-thumbnail-btn { display: block; text-align: center; padding: 0.5rem; background: var(--color-surface-800); color: var(--color-primary-400); font-size: 0.75rem; font-weight: 500; cursor: pointer; }
	.change-thumbnail-btn:hover { background: var(--color-surface-700); }

	.spinner-sm { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 0.6s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }
	:global(.animate-fade-in) { animation: fadeIn 0.15s ease-out; }
	@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

	@media (max-width: 640px) {
		.toolbar { flex-direction: column; align-items: stretch; }
		.search-box, .filter-select { max-width: 100%; width: 100%; }
		.count-badge { margin-left: 0; align-self: flex-start; }
		.content-grid { grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); }
		.detail-row { flex-direction: column; gap: 0.25rem; }
		.detail-value { text-align: left; word-break: break-all; }
	}
</style>
