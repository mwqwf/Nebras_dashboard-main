<!--
  Admin Files — /admin/content/files
  List all R2 files. Edit (PATCH metadata) + Delete. No upload.
-->
<script>
	import { onMount } from 'svelte';
	import { listAllFiles, patchAdminFile, deleteAdminFile, listModerators, listMainSections } from '$lib/api/admin.js';
	import { formatFileSize } from '$lib/utils/fileUpload.js';
	import { t } from '$lib/i18n/store.svelte.js';

	let items = $state([]);
	let totalCount = $state(0);
	let currentPage = $state(1);
	let searchQuery = $state('');
	let filterCreatedBy = $state('');
	let filterMainSection = $state('');
	let filterContentType = $state('');
	let filterIsListed = $state('');
	let isLoading = $state(true);
	let error = $state('');

	let moderatorsList = $state([]);
	let mainSectionsList = $state([]);

	// Edit
	let showEditModal = $state(false);
	let editingItem = $state(null);
	let editForm = $state({ title: '', description: '', author: '', is_listed: true });
	let editFormError = $state('');
	let editFormLoading = $state(false);

	// Delete
	let showDeleteModal = $state(false);
	let deletingItem = $state(null);
	let deleteLoading = $state(false);

	// Detail
	let showDetailModal = $state(false);
	let detailItem = $state(null);

	const PAGE_SIZE = 10;
	let totalPages = $derived(Math.ceil(totalCount / PAGE_SIZE));
	let searchTimeout;

	onMount(() => { fetchItems(); loadFilters(); });

	async function loadFilters() {
		try { const d = await listModerators({ page: 1 }); moderatorsList = d.results; } catch {}
		try { const d = await listMainSections({ page: 1 }); mainSectionsList = d.results; } catch {}
	}

	async function fetchItems() {
		isLoading = true; error = '';
		try {
			const data = await listAllFiles({
				search: searchQuery,
				created_by: filterCreatedBy || undefined,
				main_section: filterMainSection || undefined,
				content_type: filterContentType || undefined,
				metadata__is_listed: filterIsListed === '' ? undefined : filterIsListed === 'true',
				page: currentPage
			});
			items = data.results; totalCount = data.count;
		} catch (err) { error = err.message; }
		finally { isLoading = false; }
	}

	function handleSearch() { clearTimeout(searchTimeout); searchTimeout = setTimeout(() => { currentPage = 1; fetchItems(); }, 400); }
	function handleFilterChange() { currentPage = 1; fetchItems(); }
	function goToPage(p) { if (p < 1 || p > totalPages) return; currentPage = p; fetchItems(); }

	function openDetailModal(item) { detailItem = item; showDetailModal = true; }

	// Edit
	function openEditModal(item) {
		editingItem = item;
		editForm = { title: item.metadata?.title || '', description: item.metadata?.description || '', author: item.metadata?.author || '', is_listed: item.metadata?.is_listed ?? true };
		editFormError = '';
		showEditModal = true;
	}
	async function handleEdit() {
		editFormError = ''; editFormLoading = true;
		try {
			await patchAdminFile(editingItem.id, {
				metadata: { title: editForm.title, description: editForm.description || undefined, author: editForm.author || undefined, is_listed: editForm.is_listed }
			});
			showEditModal = false; fetchItems();
		} catch (err) { editFormError = err.message; }
		finally { editFormLoading = false; }
	}

	// Delete
	function openDeleteModal(item) { deletingItem = item; showDeleteModal = true; }
	async function handleDelete() {
		deleteLoading = true;
		try { await deleteAdminFile(deletingItem.id); showDeleteModal = false; deletingItem = null; fetchItems(); }
		catch (err) { error = err.message; showDeleteModal = false; }
		finally { deleteLoading = false; }
	}

	function formatDate(d) { if (!d) return '—'; return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }

	function statusColor(s) {
		if (s === 'completed') return 'status-completed';
		if (s === 'failed') return 'status-failed';
		return 'status-pending';
	}

	function contentTypeIcon(ct) {
		if (ct === 'video') return '🎬';
		if (ct === 'audio') return '🎵';
		return '📄';
	}
</script>

<svelte:head><title>{t('content.title')} — Nebras</title></svelte:head>

<div class="page">
	<div class="page-header">
		<div><h1 class="page-title">{t('content.title')}</h1><p class="page-desc">{t('content.desc')}</p></div>
	</div>

	<div class="tabs">
		<a href="/admin/content/youtube" class="tab">{t('content.youtube_videos')}</a>
		<a href="/admin/content/files" class="tab active">{t('content.file_uploads')}</a>
	</div>

	<div class="toolbar">
		<div class="search-box">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="search-icon"><path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
			<input type="text" placeholder={t('content.search_files')} bind:value={searchQuery} oninput={handleSearch} class="search-input" />
		</div>
		<select class="filter-select" bind:value={filterContentType} onchange={handleFilterChange}>
			<option value="">{t('content.all_types')}</option>
			<option value="video">{t('content.video')}</option>
			<option value="audio">{t('content.audio')}</option>
			<option value="document">{t('content.document')}</option>
		</select>
		<select class="filter-select" bind:value={filterCreatedBy} onchange={handleFilterChange}>
			<option value="">{t('content.all_creators')}</option>
			{#each moderatorsList as m}<option value={m.id}>{m.username}</option>{/each}
		</select>
		<select class="filter-select" bind:value={filterMainSection} onchange={handleFilterChange}>
			<option value="">{t('content.all_sections')}</option>
			{#each mainSectionsList as ms}<option value={ms.id}>{ms.name}</option>{/each}
		</select>
		<select class="filter-select" bind:value={filterIsListed} onchange={handleFilterChange}>
			<option value="">{t('common.all')} ({t('common.is_listed')})</option>
			<option value="true">{t('common.listed')}</option>
			<option value="false">{t('common.unlisted')}</option>
		</select>
		<div class="count-badge">{totalCount} {t('common.total')}</div>
	</div>

	{#if error}<div class="alert alert-error">{error}</div>{/if}

	<div class="content-container">
		{#if isLoading}
			<div class="state-box"><div class="spinner"></div><span>{t('common.loading')}</span></div>
		{:else if items.length === 0}
			<div class="state-box empty-state"><p>{t('content.no_files')}</p></div>
		{:else}
			<div class="file-list">
				{#each items as item (item.id)}
					<div class="file-row" role="button" tabindex="0" onclick={() => openDetailModal(item)} onkeydown={(e) => e.key === 'Enter' && openDetailModal(item)}>
						<div class="file-icon">{contentTypeIcon(item.metadata?.content_type)}</div>
						<div class="file-info">
							<span class="file-name">{item.metadata?.title || item.filename || 'Untitled'}</span>
							<span class="file-meta">{item.file_type} · {formatFileSize(item.file_size)}</span>
						</div>
						<span class="file-creator" style="color: {item.metadata?.is_listed === false ? 'var(--color-danger-400)' : 'inherit'};">
							{item.metadata?.is_listed === false ? t('common.unlisted') : item.metadata?.created_by || '—'}
						</span>
						<span class="file-status {statusColor(item.upload_status)}">{item.upload_status}</span>
						<span class="file-date">{formatDate(item.metadata?.created_at)}</span>
						<div class="file-actions" role="presentation" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
							<button class="action-btn edit" title="Edit" onclick={() => openEditModal(item)}>
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
							</button>
							<button class="action-btn delete" title="Delete" onclick={() => openDeleteModal(item)}>
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
							</button>
							</div>
						</div>
				{/each}
			</div>
		{/if}
	</div>

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

<!-- Detail Modal -->
{#if showDetailModal && detailItem}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div class="modal-overlay" role="dialog" tabindex="-1" onkeydown={(e) => e.key === 'Escape' && (showDetailModal = false)} onclick={(e) => { if (e.target === e.currentTarget) showDetailModal = false; }}>
		<div class="modal animate-fade-in">
			<div class="modal-header"><h2 class="modal-title">{t('content.file_details')}</h2><button class="modal-close" aria-label="Close" onclick={() => (showDetailModal = false)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" /></svg></button></div>
			<div class="detail-content">
				{#if detailItem.metadata?.thumbnail}
					<img src={detailItem.metadata.thumbnail} alt="" class="detail-thumb" />
				{/if}
				<div class="detail-fields">
					<div class="detail-row"><span class="detail-label">{t('common.title')}</span><span class="detail-value">{detailItem.metadata?.title}</span></div>
					{#if detailItem.metadata?.author}
						<div class="detail-row">
							<span class="detail-label">{t('content.author')}</span>
							<span class="detail-value">{detailItem.metadata.author}</span>
						</div>
					{/if}
					{#if detailItem.metadata?.description}<div class="detail-row"><span class="detail-label">{t('content.description')}</span><span class="detail-value">{detailItem.metadata.description}</span></div>{/if}
					<div class="detail-row"><span class="detail-label">{t('content.file')}</span><span class="detail-value">{detailItem.filename}</span></div>
					<div class="detail-row"><span class="detail-label">{t('common.type')}</span><span class="detail-value">{detailItem.file_type}</span></div>
					<div class="detail-row"><span class="detail-label">{t('content.size')}</span><span class="detail-value">{formatFileSize(detailItem.file_size)}</span></div>
					<div class="detail-row"><span class="detail-label">{t('common.is_listed')}</span><span class="detail-value" style="color: {detailItem.metadata?.is_listed !== false ? 'var(--color-primary-400)' : 'var(--color-danger-400)'};">{detailItem.metadata?.is_listed !== false ? t('common.listed') : t('common.unlisted')}</span></div>
					<div class="detail-row"><span class="detail-label">{t('content.upload')}</span><span class="detail-value">{detailItem.upload_type} — {detailItem.upload_status}</span></div>
					<div class="detail-row"><span class="detail-label">{t('content.creator')}</span><span class="detail-value">{detailItem.metadata?.created_by || '—'}</span></div>
					{#if detailItem.file_url}<div class="detail-row"><span class="detail-label">{t('content.url')}</span><span class="detail-value"><a href={detailItem.file_url} target="_blank" rel="noopener" class="link">{t('content.open_file')}</a></span></div>{/if}
					<div class="detail-row"><span class="detail-label">{t('content.created')}</span><span class="detail-value">{formatDate(detailItem.metadata?.created_at)}</span></div>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Edit Modal -->
{#if showEditModal && editingItem}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div class="modal-overlay" role="dialog" tabindex="-1" onkeydown={(e) => e.key === 'Escape' && (showEditModal = false)} onclick={(e) => { if (e.target === e.currentTarget) showEditModal = false; }}>
		<div class="modal animate-fade-in">
			<div class="modal-header"><h2 class="modal-title">{t('content.edit_file')}</h2><button class="modal-close" aria-label="Close" onclick={() => (showEditModal = false)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" /></svg></button></div>
			{#if editFormError}<div class="alert alert-error modal-alert">{editFormError}</div>{/if}
			<form onsubmit={(e) => { e.preventDefault(); handleEdit(); }} class="modal-form">
				<div class="form-group"><label for="edit-title" class="form-label">{t('common.title')}</label><input type="text" id="edit-title" bind:value={editForm.title} class="form-input" required /></div>
				<div class="form-group"><label for="edit-desc" class="form-label">{t('content.description')}</label><textarea id="edit-desc" bind:value={editForm.description} class="form-input form-textarea" rows="3"></textarea></div>
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
				<div class="modal-actions">
					<button type="button" class="btn btn-secondary" onclick={() => (showEditModal = false)}>{t('common.cancel')}</button>
					<button type="submit" class="btn btn-primary" disabled={editFormLoading}>{#if editFormLoading}<span class="spinner-sm"></span>{/if}{t('common.save_changes')}</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- Delete Modal -->
{#if showDeleteModal && deletingItem}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div class="modal-overlay" role="dialog" tabindex="-1" onkeydown={(e) => e.key === 'Escape' && (showDeleteModal = false)} onclick={(e) => { if (e.target === e.currentTarget) showDeleteModal = false; }}>
		<div class="modal modal-sm animate-fade-in">
			<div class="modal-header"><h2 class="modal-title">{t('content.delete_file')}</h2><button class="modal-close" aria-label="Close" onclick={() => (showDeleteModal = false)}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" /></svg></button></div>
			<p class="delete-message">{t('content.delete_confirm')} <strong>"{deletingItem.metadata?.title || deletingItem.filename}"</strong>?</p>
			<div class="modal-actions pad-actions">
				<button class="btn btn-secondary" onclick={() => (showDeleteModal = false)}>{t('common.cancel')}</button>
				<button class="btn btn-danger" onclick={handleDelete} disabled={deleteLoading}>{#if deleteLoading}<span class="spinner-sm"></span>{/if}{t('common.delete')}</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.page { display: flex; flex-direction: column; gap: 1.25rem; }
	.page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; }
	.page-title { font-size: 1.5rem; font-weight: 700; color: var(--color-surface-100); letter-spacing: -0.02em; }
	.page-desc { font-size: 0.8125rem; color: var(--color-surface-400); margin-top: 0.25rem; }
	.tabs { display: flex; gap: 0.25rem; border-bottom: 1px solid var(--color-surface-700); }
	.tab { padding: 0.625rem 1rem; font-size: 0.8125rem; font-weight: 500; color: var(--color-surface-400); text-decoration: none; border-bottom: 2px solid transparent; transition: all 0.15s; }
	.tab:hover { color: var(--color-surface-200); }
	.tab.active { color: var(--color-primary-400); border-bottom-color: var(--color-primary-500); }
	.toolbar { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
	.search-box { display: flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; background: var(--color-surface-800); border: 1px solid var(--color-surface-700); border-radius: 10px; flex: 1; max-width: 280px; }
	.search-box:focus-within { border-color: var(--color-primary-600); }
	.search-icon { width: 16px; height: 16px; color: var(--color-surface-500); flex-shrink: 0; }
	.search-input { flex: 1; background: none; border: none; outline: none; color: var(--color-surface-100); font-size: 0.8125rem; font-family: inherit; }
	.search-input::placeholder { color: var(--color-surface-500); }
	.filter-select { padding: 0.5rem 0.75rem; background: var(--color-surface-800); border: 1px solid var(--color-surface-700); border-radius: 10px; color: var(--color-surface-300); font-size: 0.8125rem; font-family: inherit; outline: none; cursor: pointer; max-width: 200px; }
	.filter-select option { background: var(--color-surface-800); color: var(--color-surface-100); }
	.count-badge { padding: 0.375rem 0.75rem; background: var(--color-surface-800); border: 1px solid var(--color-surface-700); border-radius: 100px; font-size: 0.75rem; color: var(--color-surface-400); font-weight: 500; margin-left: auto; }
	.alert { padding: 0.75rem 1rem; border-radius: 10px; font-size: 0.8125rem; }
	.alert-error { background: rgba(244,63,94,0.1); border: 1px solid rgba(244,63,94,0.2); color: var(--color-danger-400); }
	.content-container { min-height: 200px; }
	.state-box { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 3rem; gap: 0.75rem; color: var(--color-surface-500); font-size: 0.875rem; }
	.empty-state { padding: 4rem 2rem; }
	.spinner { width: 24px; height: 24px; border: 3px solid var(--color-surface-700); border-top-color: var(--color-primary-500); border-radius: 50%; animation: spin 0.6s linear infinite; }

	/* File list */
	.file-list { display: flex; flex-direction: column; gap: 0.5rem; }
	.file-row { display: flex; align-items: center; gap: 1rem; padding: 0.875rem 1rem; background: var(--color-surface-800); border: 1px solid var(--color-surface-700); border-radius: 12px; cursor: pointer; transition: all 0.15s; }
	.file-row:hover { border-color: var(--color-surface-600); }
	.file-icon { font-size: 1.25rem; flex-shrink: 0; }
	.file-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.15rem; }
	.file-name { font-size: 0.875rem; font-weight: 600; color: var(--color-surface-100); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.file-meta { font-size: 0.6875rem; color: var(--color-surface-500); }
	.file-creator { font-size: 0.6875rem; color: var(--color-primary-400); flex-shrink: 0; }
	.file-status { font-size: 0.6875rem; font-weight: 600; padding: 0.2rem 0.5rem; border-radius: 6px; text-transform: capitalize; flex-shrink: 0; }
	.status-completed { background: rgba(5,150,105,0.15); color: var(--color-primary-400); }
	.status-pending { background: rgba(234,179,8,0.15); color: #eab308; }
	.status-failed { background: rgba(244,63,94,0.15); color: var(--color-danger-400); }
	.file-date { font-size: 0.6875rem; color: var(--color-surface-500); flex-shrink: 0; }
	.file-actions { display: flex; gap: 0.375rem; flex-shrink: 0; }
	.action-btn { width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; border-radius: 8px; border: 1px solid var(--color-surface-600); background: transparent; color: var(--color-surface-400); cursor: pointer; transition: all 0.15s; }
	.action-btn svg { width: 14px; height: 14px; }
	.action-btn.edit:hover { background: rgba(5,150,105,0.1); border-color: var(--color-primary-700); color: var(--color-primary-400); }
	.action-btn.delete:hover { background: rgba(244,63,94,0.1); border-color: var(--color-danger-600); color: var(--color-danger-400); }

	/* Pagination */
	.pagination { display: flex; align-items: center; justify-content: center; gap: 0.5rem; }
	.page-btn { padding: 0.5rem 1rem; background: var(--color-surface-800); border: 1px solid var(--color-surface-700); border-radius: 8px; color: var(--color-surface-300); font-size: 0.8125rem; font-family: inherit; cursor: pointer; }
	.page-btn:hover:not(:disabled) { background: var(--color-surface-700); }
	.page-btn:disabled { opacity: 0.4; cursor: not-allowed; }
	.page-numbers { display: flex; align-items: center; gap: 0.25rem; }
	.page-num { width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; border-radius: 8px; border: none; background: transparent; color: var(--color-surface-400); font-size: 0.8125rem; font-family: inherit; cursor: pointer; }
	.page-num:hover { background: var(--color-surface-700); }
	.page-num.active { background: var(--color-primary-700); color: white; font-weight: 600; }
	.page-ellipsis { color: var(--color-surface-500); }

	/* Buttons */
	.btn { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.625rem 1.125rem; border-radius: 10px; font-size: 0.8125rem; font-weight: 600; font-family: inherit; cursor: pointer; border: none; transition: all 0.15s; }
	.btn-primary { background: linear-gradient(135deg, var(--color-primary-700), var(--color-primary-600)); color: white; }
	.btn-primary:hover { box-shadow: 0 4px 12px rgba(5,150,105,0.25); }
	.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
	.btn-secondary { background: var(--color-surface-700); color: var(--color-surface-300); border: 1px solid var(--color-surface-600); }
	.btn-secondary:hover { background: var(--color-surface-600); }
	.btn-danger { background: linear-gradient(135deg, var(--color-danger-600), var(--color-danger-500)); color: white; }
	.btn-danger:disabled { opacity: 0.6; cursor: not-allowed; }

	/* Modal */
	.modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 100; padding: 1rem; }
	.modal { width: 100%; max-width: 520px; background: var(--color-surface-800); border: 1px solid var(--color-surface-700); border-radius: 16px; box-shadow: var(--shadow-elevated); max-height: 90vh; overflow-y: auto; }
	.modal-sm { max-width: 400px; }
	.modal-header { display: flex; align-items: center; justify-content: space-between; padding: 1.25rem 1.5rem; border-bottom: 1px solid var(--color-surface-700); }
	.modal-title { font-size: 1.125rem; font-weight: 700; color: var(--color-surface-100); }
	.modal-close { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 8px; border: none; background: transparent; color: var(--color-surface-500); cursor: pointer; }
	.modal-close:hover { background: var(--color-surface-700); color: var(--color-surface-300); }
	.modal-close svg { width: 18px; height: 18px; }
	.modal-alert { margin: 1rem 1.5rem 0; }
	.modal-form { padding: 1.25rem 1.5rem; display: flex; flex-direction: column; gap: 1rem; }
	.modal-actions { display: flex; justify-content: flex-end; gap: 0.5rem; padding-top: 0.5rem; }
	.pad-actions { padding: 0 1.5rem 1.25rem; }
	.delete-message { padding: 1.25rem 1.5rem; font-size: 0.875rem; color: var(--color-surface-300); line-height: 1.5; }
	.delete-message strong { color: var(--color-surface-100); }
	.form-group { display: flex; flex-direction: column; gap: 0.375rem; }
	.form-label { font-size: 0.8125rem; font-weight: 500; color: var(--color-surface-300); }
	.form-input { padding: 0.625rem 0.75rem; background: var(--color-surface-900); border: 1px solid var(--color-surface-600); border-radius: 8px; color: var(--color-surface-100); font-size: 0.8125rem; font-family: inherit; outline: none; }
	.form-input:focus { border-color: var(--color-primary-600); }
	.form-textarea { resize: vertical; min-height: 60px; }

	/* Detail */
	.detail-content { padding: 1.5rem; }
	.detail-thumb { width: 100%; max-height: 180px; object-fit: cover; border-radius: 10px; margin-bottom: 1rem; }
	.detail-fields { display: flex; flex-direction: column; gap: 0.75rem; }
	.detail-row { display: flex; align-items: flex-start; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--color-surface-700); gap: 1rem; }
	.detail-row:last-child { border-bottom: none; }
	.detail-label { font-size: 0.8125rem; color: var(--color-surface-400); font-weight: 500; flex-shrink: 0; }
	.detail-value { font-size: 0.8125rem; color: var(--color-surface-100); font-weight: 600; text-align: right; }
	.link { color: var(--color-primary-400); text-decoration: none; word-break: break-all; }
	.link:hover { text-decoration: underline; }

	.spinner-sm { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 0.6s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }
	:global(.animate-fade-in) { animation: fadeIn 0.15s ease-out; }
	@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }

	@media (max-width: 640px) {
		.toolbar { flex-direction: column; align-items: stretch; }
		.search-box, .filter-select { max-width: 100%; width: 100%; }
		.count-badge { margin-left: 0; align-self: flex-start; }
		
		.file-row { flex-wrap: wrap; gap: 0.5rem; }
		.file-info { min-width: 100%; order: -1; }
		.file-name { white-space: normal; word-break: break-all; }
		.file-actions { margin-left: auto; justify-content: flex-end; width: 100%; }

		.detail-row { flex-direction: column; gap: 0.25rem; }
		.detail-value { text-align: left; }
	}
</style>
