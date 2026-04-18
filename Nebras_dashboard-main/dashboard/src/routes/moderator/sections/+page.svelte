<!--
  Moderator Sections — /moderator/sections
  Full CRUD for the moderator's own sections.
  3-level hierarchy: Main → Sub → Secondary.
  Tab-based level selector with cascading parent dropdowns.
  Create modal requires parent selection for sub/secondary.
-->

<script>
	import { onMount } from 'svelte';
	import {
		listMyMainSections, createMainSection, updateMainSection, removeMainSection,
		listMySubSections, createSubSection, updateSubSection, removeSubSection,
		listMySecondarySections, createSecondarySection, updateSecondarySection, removeSecondarySection
	} from '$lib/api/moderator.js';
	import { notifySectionCreated } from '$lib/utils/notifyEvents.js';
	import { t } from '$lib/i18n/store.svelte.js';

	// ─── Level & Parent State ───────────────────────────
	let activeLevel = $state('main');
	let filterMainSection = $state('');
	let filterSubSection = $state('');

	// Dropdown options (own sections)
	let mainSectionsList = $state([]);
	let subSectionsList = $state([]);

	// ─── List State ─────────────────────────────────────
	let items = $state([]);
	let totalCount = $state(0);
	let currentPage = $state(1);
	let searchQuery = $state('');
	let filterIsListed = $state('');
	let isLoading = $state(true);
	let error = $state('');

	// Create modal
	let showCreateModal = $state(false);
	let createForm = $state({ name: '', order_index: 0, main_section: '', sub_section: '', is_listed: true });
	let createThumbnail = $state(null);       // File object
	let createThumbnailPreview = $state('');   // data URL for preview
	let createFormError = $state('');
	let createFormLoading = $state(false);

	// Edit modal
	let showEditModal = $state(false);
	let editingItem = $state(null);
	let editForm = $state({ name: '', order_index: 0, is_listed: true });
	let editThumbnail = $state(null);         // File object (null = no change)
	let editThumbnailPreview = $state('');     // data URL or existing URL
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

	// ─── Level info ─────────────────────────────────────
	let pageTitle = $derived(
		activeLevel === 'main' ? t('sections.main_sections') :
		activeLevel === 'sub' ? t('sections.sub_sections') :
		t('sections.secondary_sections')
	);

	let pageDesc = $derived(
		activeLevel === 'main' ? t('sections.desc') :
		activeLevel === 'sub' ? t('sections.desc') :
		t('sections.desc')
	);

	// ─── Lifecycle ──────────────────────────────────────
	onMount(() => {
		fetchItems();
		fetchMainSectionsOptions();
	});

	// ─── Fetch items ────────────────────────────────────

	async function fetchItems() {
		isLoading = true;
		error = '';
		try {
			let data;
			const baseParams = {
				search: searchQuery,
				page: currentPage,
				is_listed: filterIsListed === '' ? undefined : filterIsListed === 'true'
			};

			if (activeLevel === 'main') {
				data = await listMyMainSections(baseParams);
			} else if (activeLevel === 'sub') {
				data = await listMySubSections({
					...baseParams,
					main_section: filterMainSection || undefined
				});
			} else {
				data = await listMySecondarySections({
					...baseParams,
					sub_section: filterSubSection || undefined
				});
			}

			items = data.results;
			totalCount = data.count;
		} catch (err) {
			error = err.message;
		} finally {
			isLoading = false;
		}
	}

	// ─── Fetch dropdown options ─────────────────────────

	async function fetchMainSectionsOptions() {
		try {
			const data = await listMyMainSections({ search: '', page: 1 });
			mainSectionsList = data.results;
		} catch {
			// Silent
		}
	}

	async function fetchSubSectionsOptions(mainSectionId) {
		try {
			const params = { search: '', page: 1 };
			if (mainSectionId) params.main_section = mainSectionId;
			const data = await listMySubSections(params);
			subSectionsList = data.results;
		} catch {
			subSectionsList = [];
		}
	}

	// ─── Level change ───────────────────────────────────

	function handleLevelChange() {
		// Reset filters & parent selections
		searchQuery = '';
		filterIsListed = '';
		filterMainSection = '';
		filterSubSection = '';
		currentPage = 1;
		items = [];

		if (activeLevel === 'sub') {
			if (mainSectionsList.length === 0) fetchMainSectionsOptions();
		} else if (activeLevel === 'secondary') {
			if (mainSectionsList.length === 0) fetchMainSectionsOptions();
			fetchSubSectionsOptions('');
		}

		fetchItems();
	}

	// ─── Parent filter changes ──────────────────────────

	function handleMainSectionFilterChange() {
		currentPage = 1;
		if (activeLevel === 'secondary') {
			filterSubSection = '';
			fetchSubSectionsOptions(filterMainSection || '');
		}
		fetchItems();
	}

	function handleSubSectionFilterChange() {
		currentPage = 1;
		fetchItems();
	}

	// ─── Filters ────────────────────────────────────────

	function handleSearch() {
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			currentPage = 1;
			fetchItems();
		}, 400);
	}

	function goToPage(page) {
		if (page < 1 || page > totalPages) return;
		currentPage = page;
		fetchItems();
	}

	// ─── Detail ─────────────────────────────────────────

	function openDetailModal(item) {
		detailItem = item;
		showDetailModal = true;
	}

	// ─── Create ─────────────────────────────────────────

	function openCreateModal() {
		createForm = { name: '', order_index: 0, main_section: '', sub_section: '', is_listed: true };
		createThumbnail = null;
		createThumbnailPreview = '';
		createFormError = '';
		showCreateModal = true;

		// Pre-load parent options for create form
		if (activeLevel === 'sub') {
			if (mainSectionsList.length === 0) fetchMainSectionsOptions();
		} else if (activeLevel === 'secondary') {
			if (mainSectionsList.length === 0) fetchMainSectionsOptions();
			fetchSubSectionsOptions('');
		}
	}

	function handleCreateThumbnailChange(e) {
		const file = e.target.files?.[0];
		if (file) {
			createThumbnail = file;
			const reader = new FileReader();
			reader.onload = (ev) => { createThumbnailPreview = ev.target.result; };
			reader.readAsDataURL(file);
		}
	}

	function clearCreateThumbnail() {
		createThumbnail = null;
		createThumbnailPreview = '';
	}

	function handleCreateMainSectionChange() {
		// When creating secondary, changing the main section filter refreshes sub section options
		createForm.sub_section = '';
		if (createForm.main_section) {
			fetchSubSectionsOptions(createForm.main_section);
		} else {
			fetchSubSectionsOptions('');
		}
	}

	async function handleCreate() {
		createFormError = '';
		createFormLoading = true;
		try {
			/** @type {{level:'main'|'sub'|'secondary', name:string, parentName:string, sectionId?:string|number}} */
			let notifyInfo = null;

			if (activeLevel === 'main') {
				const created = await createMainSection({
					name: createForm.name,
					order_index: createForm.order_index || 0,
					is_listed: createForm.is_listed,
					thumbnail: createThumbnail || undefined
				});
				notifyInfo = { level: 'main', name: createForm.name, parentName: '', sectionId: created?.id, parentId: '' };
			} else if (activeLevel === 'sub') {
				if (!createForm.main_section) {
					createFormError = 'Please select a parent main section.';
					createFormLoading = false;
					return;
				}
				const created = await createSubSection({
					name: createForm.name,
					main_section: Number(createForm.main_section),
					is_listed: createForm.is_listed,
					thumbnail: createThumbnail || undefined
				});
				const parent = mainSectionsList.find((m) => String(m.id) === String(createForm.main_section))?.name || '';
				notifyInfo = { level: 'sub', name: createForm.name, parentName: parent, sectionId: created?.id, parentId: createForm.main_section };
			} else {
				if (!createForm.sub_section) {
					createFormError = 'Please select a parent sub section.';
					createFormLoading = false;
					return;
				}
				const created = await createSecondarySection({
					name: createForm.name,
					sub_section: Number(createForm.sub_section),
					is_listed: createForm.is_listed,
					thumbnail: createThumbnail || undefined
				});
				const parent = subSectionsList.find((s) => String(s.id) === String(createForm.sub_section))?.name || '';
				notifyInfo = { level: 'secondary', name: createForm.name, parentName: parent, sectionId: created?.id, parentId: createForm.sub_section };
			}
			// إشعار FCM غير مُعطِّل.
			if (notifyInfo) notifySectionCreated(notifyInfo);
			showCreateModal = false;
			fetchItems();
			// Refresh options in case a new parent was created
			fetchMainSectionsOptions();
		} catch (err) {
			createFormError = parseFormError(err.message);
		} finally {
			createFormLoading = false;
		}
	}

	// ─── Edit ───────────────────────────────────────────

	function openEditModal(item) {
		editingItem = item;
		editForm = {
			name: item.name,
			order_index: item.order_index ?? 0,
			is_listed: item.is_listed ?? true
		};
		editThumbnail = null;
		editThumbnailPreview = item.thumbnail || '';
		editFormError = '';
		showEditModal = true;
	}

	function handleEditThumbnailChange(e) {
		const file = e.target.files?.[0];
		if (file) {
			editThumbnail = file;
			const reader = new FileReader();
			reader.onload = (ev) => { editThumbnailPreview = ev.target.result; };
			reader.readAsDataURL(file);
		}
	}

	function clearEditThumbnail() {
		editThumbnail = null;
		editThumbnailPreview = '';
	}

	async function handleEdit() {
		editFormError = '';
		editFormLoading = true;
		try {
			const payload = { ...editForm };
			if (editThumbnail) payload.thumbnail = editThumbnail;

			if (activeLevel === 'main') {
				await updateMainSection(editingItem.id, payload);
			} else if (activeLevel === 'sub') {
				await updateSubSection(editingItem.id, payload);
			} else {
				await updateSecondarySection(editingItem.id, payload);
			}
			showEditModal = false;
			fetchItems();
			// Refresh parent options in case name changed
			if (activeLevel === 'main') fetchMainSectionsOptions();
		} catch (err) {
			editFormError = parseFormError(err.message);
		} finally {
			editFormLoading = false;
		}
	}

	// ─── Delete ─────────────────────────────────────────

	function openDeleteModal(item) {
		deletingItem = item;
		showDeleteModal = true;
	}

	async function handleDelete() {
		deleteLoading = true;
		try {
			if (activeLevel === 'main') {
				await removeMainSection(deletingItem.id);
			} else if (activeLevel === 'sub') {
				await removeSubSection(deletingItem.id);
			} else {
				await removeSecondarySection(deletingItem.id);
			}
			showDeleteModal = false;
			deletingItem = null;
			fetchItems();
			// Refresh options
			if (activeLevel === 'main') fetchMainSectionsOptions();
		} catch (err) {
			error = err.message;
			showDeleteModal = false;
		} finally {
			deleteLoading = false;
		}
	}

	// ─── Helpers ────────────────────────────────────────

	function parseFormError(msg) {
		try {
			const parsed = JSON.parse(msg);
			const messages = [];
			for (const [key, val] of Object.entries(parsed)) {
				const fieldErrors = Array.isArray(val) ? val.join(', ') : val;
				messages.push(`${key}: ${fieldErrors}`);
			}
			return messages.join(' | ');
		} catch {
			return msg;
		}
	}

	function formatDate(dateStr) {
		if (!dateStr) return '—';
		return new Date(dateStr).toLocaleDateString('en-US', {
			year: 'numeric', month: 'short', day: 'numeric'
		});
	}

	function getMainSectionName(id) {
		const s = mainSectionsList.find(m => m.id === id);
		return s ? s.name : `#${id}`;
	}

	function getSubSectionName(id) {
		const s = subSectionsList.find(m => m.id === id);
		return s ? s.name : `#${id}`;
	}
</script>

<svelte:head>
	<title>My {pageTitle} — Nebras</title>
</svelte:head>

<div class="page">
	<!-- Page Header -->
	<div class="page-header">
		<div class="header-info">
			<div>
				<h1 class="page-title">{t('sections.title')}</h1>
				<p class="page-desc">{pageDesc}</p>
			</div>
		</div>
		<button class="btn btn-primary" onclick={openCreateModal} id="create-section-btn">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="btn-icon">
				<path d="M12 5v14m-7-7h14" />
			</svg>
			{t('sections.new_section')}
		</button>
	</div>

	<!-- Level Tabs -->
	<div class="level-tabs">
		<button class="level-tab" class:active={activeLevel === 'main'}
			onclick={() => { activeLevel = 'main'; handleLevelChange(); }}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tab-icon">
				<path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
			</svg>
			{t('sections.main_sections')}
		</button>
		<button class="level-tab" class:active={activeLevel === 'sub'}
			onclick={() => { activeLevel = 'sub'; handleLevelChange(); }}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tab-icon">
				<path d="M9 5l7 7-7 7" />
			</svg>
			{t('sections.sub_sections')}
		</button>
		<button class="level-tab" class:active={activeLevel === 'secondary'}
			onclick={() => { activeLevel = 'secondary'; handleLevelChange(); }}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="tab-icon">
				<path d="M13 5l7 7-7 7M5 5l7 7-7 7" />
			</svg>
			{t('sections.secondary_sections')}
		</button>
	</div>

	<!-- Toolbar -->
	<div class="toolbar">
		<div class="search-box">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="search-icon">
				<path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
			</svg>
			<input type="text" placeholder={t('sections.search')} bind:value={searchQuery}
				oninput={handleSearch} class="search-input" id="search-sections" />
		</div>

		<!-- Parent: Main Section dropdown (for sub & secondary levels) -->
		{#if activeLevel === 'sub' || activeLevel === 'secondary'}
			<select class="filter-select" bind:value={filterMainSection} onchange={handleMainSectionFilterChange}>
				<option value="">{t('sections.main_sections')} ({t('content.all_sections')})</option>
				{#each mainSectionsList as ms}
					<option value={ms.id}>{ms.name}</option>
				{/each}
			</select>
		{/if}

		<!-- Parent: Sub Section dropdown (for secondary level) -->
		{#if activeLevel === 'secondary'}
			<select class="filter-select" bind:value={filterSubSection} onchange={handleSubSectionFilterChange}>
				<option value="">{t('sections.sub_sections')} ({t('content.all_sections')})</option>
				{#each subSectionsList as ss}
					<option value={ss.id}>{ss.name}</option>
				{/each}
			</select>
		{/if}

		<select class="filter-select" bind:value={filterIsListed} onchange={handleFilterChange}>
			<option value="">{t('common.all')} ({t('common.is_listed')})</option>
			<option value="true">{t('common.listed')}</option>
			<option value="false">{t('common.unlisted')}</option>
		</select>

		<div class="count-badge">
			{t('common.total')} {totalCount}
		</div>
	</div>

	<!-- Error -->
	{#if error}
		<div class="alert alert-error">{error}</div>
	{/if}

	<!-- Sections Grid -->
	<div class="sections-container">
		{#if isLoading}
			<div class="state-box">
				<div class="spinner"></div>
				<span>Loading sections...</span>
			</div>
		{:else if items.length === 0}
			<div class="state-box empty-state">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon">
					<path d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" stroke-linecap="round" stroke-linejoin="round" />
				</svg>
				<p>No sections found</p>
				<button class="btn btn-primary btn-sm" onclick={openCreateModal}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="btn-icon">
						<path d="M12 5v14m-7-7h14" />
					</svg>
					Create your first {activeLevel === 'main' ? 'main' : activeLevel === 'sub' ? 'sub' : 'secondary'} section
				</button>
			</div>
		{:else}
			<div class="sections-grid">
				{#each items as item (item.id)}
					<div class="section-card">
						<!-- Thumbnail -->
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="card-thumbnail" onclick={() => openDetailModal(item)}>
							{#if item.thumbnail}
								<img src={item.thumbnail} alt={item.name} class="thumbnail-img" />
							{:else}
								<div class="thumbnail-placeholder">
									<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
										<path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" stroke-linecap="round" stroke-linejoin="round" />
									</svg>
								</div>
							{/if}
							<div class="level-badge">
								{activeLevel === 'main' ? 'Main' : activeLevel === 'sub' ? 'Sub' : 'Secondary'}
							</div>
						</div>

						<!-- Card body -->
						<div class="card-body">
							<h3 class="card-title">{item.name}</h3>

							<div class="card-meta">
								{#if item.order_index !== undefined}
									<span class="meta-item">
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="meta-icon">
											<path d="M4 6h16M4 12h16M4 18h7" />
										</svg>
										Order: {item.order_index}
									</span>
								{/if}
								<span class="meta-item" style="color: {item.is_listed ? 'var(--color-primary-400)' : 'var(--color-danger-400)'};">
									{item.is_listed ? t('common.listed') : t('common.unlisted')}
								</span>
								{#if item.main_section}
									<span class="meta-item meta-parent">
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="meta-icon">
											<path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
										</svg>
										Main: {getMainSectionName(item.main_section)}
									</span>
								{/if}
								{#if item.sub_section}
									<span class="meta-item meta-parent">
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="meta-icon">
											<path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
										</svg>
										Sub: {getSubSectionName(item.sub_section)}
									</span>
								{/if}
							</div>

							<div class="card-footer">
								<span class="card-date">{formatDate(item.created_at)}</span>
								<div class="card-actions">
									<button class="action-btn edit" title="Edit" onclick={() => openEditModal(item)}>
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
											<path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
										</svg>
									</button>
									<button class="action-btn delete" title="Delete" onclick={() => openDeleteModal(item)}>
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
											<path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
										</svg>
									</button>
								</div>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>

	<!-- Pagination -->
	{#if totalPages > 1}
		<div class="pagination">
			<button class="page-btn" disabled={currentPage === 1} onclick={() => goToPage(currentPage - 1)}>
				← Previous
			</button>
			<div class="page-numbers">
				{#each Array.from({ length: totalPages }, (_, i) => i + 1) as p}
					{#if p === 1 || p === totalPages || (p >= currentPage - 1 && p <= currentPage + 1)}
						<button class="page-num" class:active={p === currentPage} onclick={() => goToPage(p)}>
							{p}
						</button>
					{:else if p === currentPage - 2 || p === currentPage + 2}
						<span class="page-ellipsis">...</span>
					{/if}
				{/each}
			</div>
			<button class="page-btn" disabled={currentPage === totalPages} onclick={() => goToPage(currentPage + 1)}>
				Next →
			</button>
		</div>
	{/if}
</div>

<!-- ═══════════════════════════════════════════════════════ -->
<!-- Detail Modal -->
<!-- ═══════════════════════════════════════════════════════ -->
{#if showDetailModal && detailItem}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="modal-overlay" role="dialog" tabindex="-1" onclick={(e) => { if (e.target === e.currentTarget) showDetailModal = false; }}>
		<div class="modal modal-detail animate-fade-in">
			<div class="modal-header">
				<h2 class="modal-title">Section Details</h2>
				<button class="modal-close" aria-label="Close" onclick={() => (showDetailModal = false)}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" /></svg>
				</button>
			</div>
			<div class="detail-content">
				{#if detailItem.thumbnail}
					<img src={detailItem.thumbnail} alt={detailItem.name} class="detail-thumbnail" />
				{/if}
				<div class="detail-fields">
					<div class="detail-row">
						<span class="detail-label">ID</span>
						<span class="detail-value">#{detailItem.id}</span>
					</div>
					<div class="detail-row">
						<span class="detail-label">Type</span>
						<span class="detail-value level-chip">{activeLevel === 'main' ? 'Main Section' : activeLevel === 'sub' ? 'Sub Section' : 'Secondary Sub Section'}</span>
					</div>
					<div class="detail-row">
						<span class="detail-label">Name</span>
						<span class="detail-value">{detailItem.name}</span>
					</div>
					{#if detailItem.order_index !== undefined}
						<div class="detail-row">
							<span class="detail-label">Order Index</span>
							<span class="detail-value">{detailItem.order_index}</span>
						</div>
					{/if}
					{#if detailItem.main_section}
						<div class="detail-row">
							<span class="detail-label">Main Section</span>
							<span class="detail-value">{getMainSectionName(detailItem.main_section)}</span>
						</div>
					{/if}
					{#if detailItem.sub_section}
						<div class="detail-row">
							<span class="detail-label">Sub Section</span>
							<span class="detail-value">{getSubSectionName(detailItem.sub_section)}</span>
						</div>
					{/if}
					<div class="detail-row">
						<span class="detail-label">Created At</span>
						<span class="detail-value">{formatDate(detailItem.created_at)}</span>
					</div>
					<div class="detail-row">
						<span class="detail-label">{t('common.is_listed')}</span>
						<span class="detail-value" style="color: {detailItem.is_listed ? 'var(--color-primary-400)' : 'var(--color-danger-400)'};">
							{detailItem.is_listed ? t('common.listed') : t('common.unlisted')}
						</span>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- ═══════════════════════════════════════════════════════ -->
<!-- Create Modal -->
<!-- ═══════════════════════════════════════════════════════ -->
{#if showCreateModal}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="modal-overlay" role="dialog" tabindex="-1" onclick={(e) => { if (e.target === e.currentTarget) showCreateModal = false; }}>
		<div class="modal animate-fade-in">
			<div class="modal-header">
				<h2 class="modal-title">{t('sections.create_section')}</h2>
				<button class="modal-close" aria-label="Close" onclick={() => (showCreateModal = false)}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" /></svg>
				</button>
			</div>

			{#if createFormError}
				<div class="alert alert-error modal-alert">{createFormError}</div>
			{/if}

			<form onsubmit={(e) => { e.preventDefault(); handleCreate(); }} class="modal-form">
				<div class="form-group">
					<label for="create-name" class="form-label">{t('common.name')} *</label>
					<input type="text" id="create-name" bind:value={createForm.name} class="form-input" required
						placeholder="e.g. History, 19th Century..." />
				</div>

				{#if activeLevel === 'main'}
					<div class="form-group">
						<label for="create-order" class="form-label">{t('sections.order_index')}</label>
						<input type="number" id="create-order" bind:value={createForm.order_index} class="form-input" />
					</div>
				{/if}

				{#if activeLevel === 'sub'}
					<div class="form-group">
						<label for="create-main-section" class="form-label">{t('sections.parent_main')} *</label>
						<select id="create-main-section" bind:value={createForm.main_section} class="form-input" required>
							<option value="">{t('common.select')}</option>
							{#each mainSectionsList as ms}
								<option value={ms.id}>{ms.name}</option>
							{/each}
						</select>
						<span class="form-hint">Sub section will be created under this main section.</span>
					</div>
				{/if}

				{#if activeLevel === 'secondary'}
					<div class="form-group">
						<label for="create-main-filter" class="form-label">{t('sections.filter_main')}</label>
						<select id="create-main-filter" bind:value={createForm.main_section} class="form-input"
							onchange={handleCreateMainSectionChange}>
							<option value="">{t('common.select')}</option>
							{#each mainSectionsList as ms}
								<option value={ms.id}>{ms.name}</option>
							{/each}
						</select>
						<span class="form-hint">Optional: narrow down sub section options.</span>
					</div>
					<div class="form-group">
						<label for="create-sub-section" class="form-label">{t('sections.parent_sub')} *</label>
						<select id="create-sub-section" bind:value={createForm.sub_section} class="form-input" required>
							<option value="">{t('common.select')}</option>
							{#each subSectionsList as ss}
								<option value={ss.id}>{ss.name}</option>
							{/each}
						</select>
						<span class="form-hint">Secondary section will be created under this sub section.</span>
					</div>
				{/if}

				<div class="form-group" style="margin-top: 1.5rem; margin-bottom: 0.5rem;">
					<label class="toggle-switch">
						<input type="checkbox" id="create-listed" bind:checked={createForm.is_listed} class="toggle-input" />
						<span class="toggle-slider"></span>
						<span class="toggle-label">{t('common.is_listed')}</span>
					</label>
				</div>

				<!-- Thumbnail upload -->
				<div class="form-group">
					<span class="form-label">{t('content.thumbnail')}</span>
					{#if createThumbnailPreview}
						<div class="upload-preview">
							<img src={createThumbnailPreview} alt="Preview" class="preview-img" />
							<button type="button" class="preview-remove" onclick={clearCreateThumbnail} title={t('common.remove')}>
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" /></svg>
							</button>
						</div>
					{:else}
						<label class="upload-zone" for="create-thumbnail">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="upload-icon">
								<path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" stroke-linecap="round" stroke-linejoin="round" />
							</svg>
							<span>Click to upload an image</span>
							<span class="upload-hint">PNG, JPG, WebP</span>
						</label>
						<input type="file" id="create-thumbnail" accept="image/*" class="file-input-hidden"
							onchange={handleCreateThumbnailChange} />
					{/if}
				</div>

				<div class="modal-actions">
					<button type="button" class="btn btn-secondary" onclick={() => (showCreateModal = false)}>
						{t('common.cancel')}
					</button>
					<button type="submit" class="btn btn-primary" disabled={createFormLoading}>
						{#if createFormLoading}
							<span class="spinner-sm"></span>
						{/if}
						{t('sections.create_section')}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- ═══════════════════════════════════════════════════════ -->
<!-- Edit Modal -->
<!-- ═══════════════════════════════════════════════════════ -->
{#if showEditModal && editingItem}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="modal-overlay" role="dialog" tabindex="-1" onclick={(e) => { if (e.target === e.currentTarget) showEditModal = false; }}>
		<div class="modal animate-fade-in">
			<div class="modal-header">
				<h2 class="modal-title">{t('sections.edit_section')}</h2>
				<button class="modal-close" aria-label="Close" onclick={() => (showEditModal = false)}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" /></svg>
				</button>
			</div>

			{#if editFormError}
				<div class="alert alert-error modal-alert">{editFormError}</div>
			{/if}

			<form onsubmit={(e) => { e.preventDefault(); handleEdit(); }} class="modal-form">
				<div class="form-group">
					<label for="edit-name" class="form-label">{t('common.name')} *</label>
					<input type="text" id="edit-name" bind:value={editForm.name} class="form-input" required />
				</div>

				<div class="form-group">
					<label for="edit-order" class="form-label">{t('sections.order_index')}</label>
					<input type="number" id="edit-order" bind:value={editForm.order_index} class="form-input" />
				</div>

				<div class="form-group" style="margin-top: 1.5rem; margin-bottom: 0.5rem;">
					<label class="toggle-switch">
						<input type="checkbox" id="edit-listed" bind:checked={editForm.is_listed} class="toggle-input" />
						<span class="toggle-slider"></span>
						<span class="toggle-label">{t('common.is_listed')}</span>
					</label>
				</div>

				<!-- Thumbnail upload -->
				<div class="form-group">
					<span class="form-label">{t('content.thumbnail')}</span>
					{#if editThumbnailPreview}
						<div class="upload-preview">
							<img src={editThumbnailPreview} alt="Preview" class="preview-img" />
							<button type="button" class="preview-remove" onclick={clearEditThumbnail} title="Remove">
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" /></svg>
							</button>
							<label class="change-thumbnail-btn" for="edit-thumbnail">{t('content.change_image')}</label>
							<input type="file" id="edit-thumbnail" accept="image/*" class="file-input-hidden"
								onchange={handleEditThumbnailChange} />
						</div>
					{:else}
						<label class="upload-zone" for="edit-thumbnail-new">
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="upload-icon">
								<path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" stroke-linecap="round" stroke-linejoin="round" />
							</svg>
							<span>Click to upload an image</span>
							<span class="upload-hint">PNG, JPG, WebP</span>
						</label>
						<input type="file" id="edit-thumbnail-new" accept="image/*" class="file-input-hidden"
							onchange={handleEditThumbnailChange} />
					{/if}
				</div>

				<div class="modal-actions">
					<button type="button" class="btn btn-secondary" onclick={() => (showEditModal = false)}>
						{t('common.cancel')}
					</button>
					<button type="submit" class="btn btn-primary" disabled={editFormLoading}>
						{#if editFormLoading}
							<span class="spinner-sm"></span>
						{/if}
						{t('common.save_changes')}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- ═══════════════════════════════════════════════════════ -->
<!-- Delete Confirmation Modal -->
<!-- ═══════════════════════════════════════════════════════ -->
{#if showDeleteModal && deletingItem}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="modal-overlay" role="dialog" tabindex="-1" onclick={(e) => { if (e.target === e.currentTarget) showDeleteModal = false; }}>
		<div class="modal modal-sm animate-fade-in">
			<div class="modal-header">
				<h2 class="modal-title">{t('sections.delete_section')}</h2>
				<button class="modal-close" aria-label="Close" onclick={() => (showDeleteModal = false)}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" /></svg>
				</button>
			</div>
			<p class="delete-message">
				{t('sections.delete_confirm')} <strong>"{deletingItem.name}"</strong>?

				{#if activeLevel === 'main'}
					All sub sections and secondary sub sections will also be deleted.
				{:else if activeLevel === 'sub'}
					All secondary sub sections will also be deleted.
				{/if}
				This action cannot be undone.
			</p>
			<div class="modal-actions pad-actions">
				<button class="btn btn-secondary" onclick={() => (showDeleteModal = false)}>Cancel</button>
				<button class="btn btn-danger" onclick={handleDelete} disabled={deleteLoading}>
					{#if deleteLoading}
						<span class="spinner-sm"></span>
					{/if}
					Delete
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	/* ─── Page Layout ───────────────────────────────── */
	.page {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.page-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 1rem;
		flex-wrap: wrap;
	}

	.page-title {
		font-size: 1.5rem;
		font-weight: 700;
		color: var(--color-surface-100);
		letter-spacing: -0.02em;
	}

	.page-desc {
		font-size: 0.8125rem;
		color: var(--color-surface-400);
		margin-top: 0.25rem;
	}

	/* ─── Level Tabs ─────────────────────────────────── */
	.level-tabs {
		display: flex;
		gap: 0.375rem;
		background: var(--color-surface-800);
		border: 1px solid var(--color-surface-700);
		border-radius: 12px;
		padding: 0.25rem;
		width: fit-content;
	}

	.level-tab {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 1rem;
		border-radius: 9px;
		border: none;
		background: transparent;
		color: var(--color-surface-400);
		font-size: 0.8125rem;
		font-weight: 500;
		font-family: inherit;
		cursor: pointer;
		transition: all 0.2s ease;
	}

	.level-tab:hover {
		color: var(--color-surface-200);
		background: var(--color-surface-700);
	}

	.level-tab.active {
		background: linear-gradient(135deg, var(--color-primary-700), var(--color-primary-600));
		color: white;
		font-weight: 600;
		box-shadow: 0 2px 8px rgba(5, 150, 105, 0.2);
	}

	.tab-icon {
		width: 15px;
		height: 15px;
	}

	/* ─── Toolbar ────────────────────────────────────── */
	.toolbar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	.search-box {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0.75rem;
		background: var(--color-surface-800);
		border: 1px solid var(--color-surface-700);
		border-radius: 10px;
		flex: 1;
		max-width: 280px;
		transition: border-color 0.2s;
	}

	.search-box:focus-within {
		border-color: var(--color-primary-600);
	}

	.search-icon {
		width: 16px;
		height: 16px;
		color: var(--color-surface-500);
		flex-shrink: 0;
	}

	.search-input {
		flex: 1;
		background: none;
		border: none;
		outline: none;
		color: var(--color-surface-100);
		font-size: 0.8125rem;
		font-family: inherit;
	}

	.search-input::placeholder {
		color: var(--color-surface-500);
	}

	.filter-select {
		padding: 0.5rem 0.75rem;
		background: var(--color-surface-800);
		border: 1px solid var(--color-surface-700);
		border-radius: 10px;
		color: var(--color-surface-300);
		font-size: 0.8125rem;
		font-family: inherit;
		outline: none;
		cursor: pointer;
		transition: border-color 0.2s;
		max-width: 200px;
	}

	.filter-select:focus {
		border-color: var(--color-primary-600);
	}

	.filter-select option {
		background: var(--color-surface-800);
		color: var(--color-surface-100);
	}

	.count-badge {
		padding: 0.375rem 0.75rem;
		background: var(--color-surface-800);
		border: 1px solid var(--color-surface-700);
		border-radius: 100px;
		font-size: 0.75rem;
		color: var(--color-surface-400);
		font-weight: 500;
		margin-left: auto;
	}

	/* ─── Alert ──────────────────────────────────────── */
	.alert {
		padding: 0.75rem 1rem;
		border-radius: 10px;
		font-size: 0.8125rem;
	}

	.alert-error {
		background: rgba(244, 63, 94, 0.1);
		border: 1px solid rgba(244, 63, 94, 0.2);
		color: var(--color-danger-400);
	}

	/* ─── Loading / Empty ────────────────────────────── */
	.sections-container {
		min-height: 200px;
	}

	.state-box {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem;
		gap: 0.75rem;
		color: var(--color-surface-500);
		font-size: 0.875rem;
	}

	.empty-state {
		padding: 4rem 2rem;
	}

	.empty-icon {
		width: 48px;
		height: 48px;
		color: var(--color-surface-600);
	}

	.spinner {
		width: 24px;
		height: 24px;
		border: 3px solid var(--color-surface-700);
		border-top-color: var(--color-primary-500);
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	/* ─── Sections Grid ──────────────────────────────── */
	.sections-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 1rem;
	}

	.section-card {
		background: var(--color-surface-800);
		border: 1px solid var(--color-surface-700);
		border-radius: 14px;
		overflow: hidden;
		transition: all 0.2s ease;
	}

	.section-card:hover {
		border-color: var(--color-surface-600);
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
	}

	/* Thumbnail */
	.card-thumbnail {
		width: 100%;
		height: 160px;
		overflow: hidden;
		position: relative;
		background: var(--color-surface-900);
		cursor: pointer;
	}

	.thumbnail-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		transition: transform 0.3s ease;
	}

	.card-thumbnail:hover .thumbnail-img {
		transform: scale(1.05);
	}

	.thumbnail-placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--color-surface-600);
	}

	.thumbnail-placeholder svg {
		width: 40px;
		height: 40px;
	}

	.level-badge {
		position: absolute;
		top: 0.5rem;
		left: 0.5rem;
		padding: 0.2rem 0.5rem;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(4px);
		border-radius: 6px;
		color: var(--color-primary-300);
		font-size: 0.625rem;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}

	/* Card body */
	.card-body {
		padding: 1rem;
	}

	.card-title {
		font-size: 0.9375rem;
		font-weight: 600;
		color: var(--color-surface-100);
		margin-bottom: 0.5rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.card-meta {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		margin-bottom: 0.75rem;
	}

	.meta-item {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		font-size: 0.75rem;
		color: var(--color-surface-400);
	}

	.meta-parent {
		color: var(--color-primary-400);
		opacity: 0.8;
	}

	.meta-icon {
		width: 14px;
		height: 14px;
		flex-shrink: 0;
	}

	.card-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-top: 0.75rem;
		border-top: 1px solid var(--color-surface-700);
	}

	.card-date {
		font-size: 0.6875rem;
		color: var(--color-surface-500);
	}

	.card-actions {
		display: flex;
		gap: 0.375rem;
	}

	.action-btn {
		width: 30px;
		height: 30px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 8px;
		border: 1px solid var(--color-surface-600);
		background: transparent;
		color: var(--color-surface-400);
		cursor: pointer;
		transition: all 0.15s;
	}

	.action-btn svg {
		width: 14px;
		height: 14px;
	}

	.action-btn.edit:hover {
		background: rgba(5, 150, 105, 0.1);
		border-color: var(--color-primary-700);
		color: var(--color-primary-400);
	}

	.action-btn.delete:hover {
		background: rgba(244, 63, 94, 0.1);
		border-color: var(--color-danger-600);
		color: var(--color-danger-400);
	}

	/* ─── Pagination ─────────────────────────────────── */
	.pagination {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
	}

	.page-btn {
		padding: 0.5rem 1rem;
		background: var(--color-surface-800);
		border: 1px solid var(--color-surface-700);
		border-radius: 8px;
		color: var(--color-surface-300);
		font-size: 0.8125rem;
		font-family: inherit;
		cursor: pointer;
		transition: all 0.15s;
	}

	.page-btn:hover:not(:disabled) {
		background: var(--color-surface-700);
	}

	.page-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.page-numbers {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.page-num {
		width: 34px;
		height: 34px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 8px;
		border: 1px solid transparent;
		background: transparent;
		color: var(--color-surface-400);
		font-size: 0.8125rem;
		font-family: inherit;
		cursor: pointer;
		transition: all 0.15s;
	}

	.page-num:hover {
		background: var(--color-surface-700);
	}

	.page-num.active {
		background: var(--color-primary-700);
		color: white;
		font-weight: 600;
	}

	.page-ellipsis {
		color: var(--color-surface-500);
		padding: 0 0.25rem;
	}

	/* ─── Buttons ────────────────────────────────────── */
	.btn {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.625rem 1.125rem;
		border-radius: 10px;
		font-size: 0.8125rem;
		font-weight: 600;
		font-family: inherit;
		cursor: pointer;
		border: none;
		transition: all 0.15s;
	}

	.btn-sm {
		padding: 0.5rem 0.875rem;
		font-size: 0.75rem;
	}

	.btn-icon {
		width: 16px;
		height: 16px;
	}

	.btn-primary {
		background: linear-gradient(135deg, var(--color-primary-700), var(--color-primary-600));
		color: white;
	}

	.btn-primary:hover {
		background: linear-gradient(135deg, var(--color-primary-600), var(--color-primary-500));
		box-shadow: 0 4px 12px rgba(5, 150, 105, 0.25);
	}

	.btn-primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn-secondary {
		background: var(--color-surface-700);
		color: var(--color-surface-300);
		border: 1px solid var(--color-surface-600);
	}

	.btn-secondary:hover {
		background: var(--color-surface-600);
	}

	.btn-danger {
		background: linear-gradient(135deg, var(--color-danger-600), var(--color-danger-500));
		color: white;
	}

	.btn-danger:hover {
		box-shadow: 0 4px 12px rgba(244, 63, 94, 0.25);
	}

	.btn-danger:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	/* ─── Modal ──────────────────────────────────────── */
	.modal-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(4px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		padding: 1rem;
	}

	.modal {
		width: 100%;
		max-width: 480px;
		background: var(--color-surface-800);
		border: 1px solid var(--color-surface-700);
		border-radius: 16px;
		box-shadow: var(--shadow-elevated);
	}

	.modal-sm {
		max-width: 400px;
	}

	.modal-detail {
		max-width: 560px;
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 1.25rem 1.5rem;
		border-bottom: 1px solid var(--color-surface-700);
	}

	.modal-title {
		font-size: 1.125rem;
		font-weight: 700;
		color: var(--color-surface-100);
	}

	.modal-close {
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 8px;
		border: none;
		background: transparent;
		color: var(--color-surface-500);
		cursor: pointer;
		transition: all 0.15s;
	}

	.modal-close:hover {
		background: var(--color-surface-700);
		color: var(--color-surface-300);
	}

	.modal-close svg {
		width: 18px;
		height: 18px;
	}

	.modal-alert {
		margin: 1rem 1.5rem 0;
	}

	.modal-form {
		padding: 1.25rem 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.form-label {
		font-size: 0.8125rem;
		font-weight: 500;
		color: var(--color-surface-300);
	}

	.form-input {
		padding: 0.625rem 0.75rem;
		background: var(--color-surface-900);
		border: 1px solid var(--color-surface-600);
		border-radius: 8px;
		color: var(--color-surface-100);
		font-size: 0.8125rem;
		font-family: inherit;
		outline: none;
		transition: border-color 0.2s;
	}

	.form-input::placeholder {
		color: var(--color-surface-500);
	}

	.form-input:focus {
		border-color: var(--color-primary-600);
	}

	.form-hint {
		font-size: 0.6875rem;
		color: var(--color-surface-500);
		font-style: italic;
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		padding-top: 0.5rem;
	}

	.pad-actions {
		padding: 0 1.5rem 1.25rem;
	}

	.delete-message {
		padding: 1.25rem 1.5rem;
		font-size: 0.875rem;
		color: var(--color-surface-300);
		line-height: 1.5;
	}

	.delete-message strong {
		color: var(--color-surface-100);
	}

	/* Detail modal */
	.detail-content {
		padding: 1.5rem;
	}

	.detail-thumbnail {
		width: 100%;
		max-height: 240px;
		object-fit: cover;
		border-radius: 10px;
		margin-bottom: 1.25rem;
	}

	.detail-fields {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.detail-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0;
		border-bottom: 1px solid var(--color-surface-700);
	}

	.detail-row:last-child {
		border-bottom: none;
	}

	.detail-label {
		font-size: 0.8125rem;
		color: var(--color-surface-400);
		font-weight: 500;
	}

	.detail-value {
		font-size: 0.8125rem;
		color: var(--color-surface-100);
		font-weight: 600;
	}

	.level-chip {
		padding: 0.2rem 0.5rem;
		background: rgba(5, 150, 105, 0.1);
		border-radius: 6px;
		color: var(--color-primary-400);
		font-size: 0.75rem;
	}

	.spinner-sm {
		width: 14px;
		height: 14px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: white;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin {
		to { transform: rotate(360deg); }
	}

	:global(.animate-fade-in) {
		animation: fadeIn 0.15s ease-out;
	}

	@keyframes fadeIn {
		from { opacity: 0; transform: translateY(8px); }
		to { opacity: 1; transform: translateY(0); }
	}

	/* ─── File Upload Zone ────────────────────────────── */
	.upload-zone {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 1.5rem;
		border: 2px dashed var(--color-surface-600);
		border-radius: 12px;
		background: var(--color-surface-900);
		cursor: pointer;
		transition: all 0.2s ease;
		color: var(--color-surface-400);
		font-size: 0.8125rem;
	}

	.upload-zone:hover {
		border-color: var(--color-primary-600);
		background: rgba(5, 150, 105, 0.05);
		color: var(--color-primary-400);
	}

	.upload-icon {
		width: 32px;
		height: 32px;
	}

	.upload-hint {
		font-size: 0.6875rem;
		color: var(--color-surface-500);
	}

	.file-input-hidden {
		position: absolute;
		width: 0;
		height: 0;
		opacity: 0;
		pointer-events: none;
	}

	.upload-preview {
		position: relative;
		border-radius: 10px;
		overflow: hidden;
		border: 1px solid var(--color-surface-600);
	}

	.preview-img {
		width: 100%;
		max-height: 180px;
		object-fit: cover;
		display: block;
	}

	.preview-remove {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		width: 28px;
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.6);
		backdrop-filter: blur(4px);
		border: none;
		color: white;
		cursor: pointer;
		transition: background 0.15s;
	}

	.preview-remove:hover {
		background: rgba(244, 63, 94, 0.8);
	}

	.preview-remove svg {
		width: 14px;
		height: 14px;
	}

	.change-thumbnail-btn {
		display: block;
		text-align: center;
		padding: 0.5rem;
		background: var(--color-surface-800);
		color: var(--color-primary-400);
		font-size: 0.75rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.15s;
	}

	.change-thumbnail-btn:hover {
		background: var(--color-surface-700);
	}

	@media (max-width: 640px) {
		.toolbar { flex-direction: column; align-items: stretch; }
		.search-box, .filter-select { max-width: 100%; width: 100%; }
		.count-badge { margin-left: 0; align-self: flex-start; }
		.sections-grid { grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr)); }
		.detail-row { flex-direction: column; gap: 0.25rem; }
		.detail-value { text-align: left; }
		.level-tabs { flex-wrap: wrap; }
		.level-tab { flex: 1; justify-content: center; }
	}
</style>
