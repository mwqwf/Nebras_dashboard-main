<!--
  Moderator Management — /admin/users/moderators
  Full CRUD: List (paginated + searchable), Create, Edit, Delete.
  Dark theme with Islamic green accents.
-->

<script>
	import { onMount } from 'svelte';
	import {
		listModerators,
		createModerator,
		updateModerator,
		deleteModerator
	} from '$lib/api/admin.js';
	import { t } from '$lib/i18n/store.svelte.js';

	// ─── State ──────────────────────────────────────────
	let moderators = $state([]);
	let totalCount = $state(0);
	let currentPage = $state(1);
	let searchQuery = $state('');
	let filterActive = $state('');
	let filterStaff = $state('');
	let isLoading = $state(true);
	let error = $state('');

	// Modal state
	let showCreateModal = $state(false);
	let showEditModal = $state(false);
	let showDeleteModal = $state(false);

	// Form state
	let formData = $state({ username: '', email: '', password: '', first_name: '', last_name: '' });
	let formError = $state('');
	let formLoading = $state(false);
	let editingMod = $state(null);
	let deletingMod = $state(null);

	const PAGE_SIZE = 10;
	let totalPages = $derived(Math.ceil(totalCount / PAGE_SIZE));

	// Debounced search
	let searchTimeout;

	// ─── Lifecycle ──────────────────────────────────────
	onMount(() => {
		fetchModerators();
	});

	// ─── API Calls ──────────────────────────────────────

	async function fetchModerators() {
		isLoading = true;
		error = '';
		try {
			const data = await listModerators({ search: searchQuery, page: currentPage, is_active: filterActive, is_staff: filterStaff });
			moderators = data.results;
			totalCount = data.count;
		} catch (err) {
			error = err.message;
		} finally {
			isLoading = false;
		}
	}

	function handleSearch(e) {
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			currentPage = 1;
			fetchModerators();
		}, 400);
	}

	function handleFilterChange() {
		currentPage = 1;
		fetchModerators();
	}

	function goToPage(page) {
		if (page < 1 || page > totalPages) return;
		currentPage = page;
		fetchModerators();
	}

	// Create
	function openCreateModal() {
		formData = { username: '', email: '', password: '', first_name: '', last_name: '' };
		formError = '';
		showCreateModal = true;
	}

	async function handleCreate() {
		formError = '';
		formLoading = true;
		try {
			await createModerator(formData);
			showCreateModal = false;
			fetchModerators();
		} catch (err) {
			formError = parseFormError(err.message);
		} finally {
			formLoading = false;
		}
	}

	// Edit
	function openEditModal(mod) {
		editingMod = mod;
		formData = {
			username: mod.username,
			email: mod.email,
			password: '',
			first_name: mod.first_name,
			last_name: mod.last_name
		};
		formError = '';
		showEditModal = true;
	}

	async function handleEdit() {
		formError = '';
		formLoading = true;
		try {
			const updateData = { ...formData };
			// Don't send empty password
			if (!updateData.password) delete updateData.password;
			await updateModerator(editingMod.id, updateData);
			showEditModal = false;
			fetchModerators();
		} catch (err) {
			formError = parseFormError(err.message);
		} finally {
			formLoading = false;
		}
	}

	// Delete
	function openDeleteModal(mod) {
		deletingMod = mod;
		showDeleteModal = true;
	}

	async function handleDelete() {
		formLoading = true;
		try {
			await deleteModerator(deletingMod.id);
			showDeleteModal = false;
			deletingMod = null;
			fetchModerators();
		} catch (err) {
			error = err.message;
			showDeleteModal = false;
		} finally {
			formLoading = false;
		}
	}

	// Parse JSON error strings from API into readable messages
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
</script>

<svelte:head>
	<title>Moderators — Nebras Admin</title>
</svelte:head>

<div class="page">
	<!-- Page Header -->
	<div class="page-header">
		<div class="header-info">
			<h1 class="page-title">{t('moderators.title')}</h1>
			<p class="page-desc">{t('moderators.desc')}</p>
		</div>
		<button class="btn btn-primary" id="create-moderator-btn" onclick={openCreateModal}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="btn-icon">
				<path d="M12 4v16m8-8H4" />
			</svg>
			{t('moderators.new_mod')}
		</button>
	</div>

	<!-- Search & Filters -->
	<div class="toolbar">
		<div class="search-box">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="search-icon">
				<path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
			</svg>
			<input
				type="text"
				placeholder={t('moderators.search')}
				bind:value={searchQuery}
				oninput={handleSearch}
				class="search-input"
				id="search-moderators"
			/>
		</div>

		<select class="filter-select" bind:value={filterActive} onchange={handleFilterChange}>
			<option value="">{t('common.status')} / {t('common.total')}</option>
			<option value="true">Active</option>
			<option value="false">Inactive</option>
		</select>

		<select class="filter-select" bind:value={filterStaff} onchange={handleFilterChange}>
			<option value="">All Roles</option>
			<option value="true">Staff</option>
			<option value="false">Non-Staff</option>
		</select>

		<div class="count-badge">
			{t('common.total')} {totalCount}
		</div>
	</div>

	<!-- Error -->
	{#if error}
		<div class="alert alert-error">{error}</div>
	{/if}

	<!-- Table -->
	<div class="table-card">
		{#if isLoading}
			<div class="table-loading">
				<div class="spinner"></div>
				<span>Loading moderators...</span>
			</div>
		{:else if moderators.length === 0}
			<div class="table-empty">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon">
					<path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" stroke-linecap="round" stroke-linejoin="round" />
				</svg>
				<p>No moderators found</p>
			</div>
		{:else}
			<div class="table-responsive">
				<table class="data-table" id="moderators-table">
					<thead>
						<tr>
							<th>{t('common.users')}</th>
						<th>{t('profile.email')}</th>
						<th>{t('common.status')}</th>
						<th class="th-actions">{t('common.actions')}</th>
					</tr>
				</thead>
				<tbody>
					{#each moderators as mod (mod.id)}
						<tr>
							<td>
								<div class="user-cell">
									<div class="user-avatar">
										{(mod.first_name || mod.username).charAt(0).toUpperCase()}
									</div>
									<div class="user-info">
										<span class="user-name">{mod.first_name} {mod.last_name}</span>
										<span class="user-username">@{mod.username}</span>
									</div>
								</div>
							</td>
							<td>
								<span class="text-secondary">{mod.email}</span>
							</td>
							<td>
								<span class="status-badge" class:active={mod.is_active} class:inactive={!mod.is_active}>
									<span class="status-dot"></span>
									{mod.is_active ? 'Active' : 'Inactive'}
								</span>
							</td>
							<td>
								<div class="action-btns">
									<button class="action-btn edit" title="Edit" onclick={() => openEditModal(mod)}>
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
											<path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
										</svg>
									</button>
									<button class="action-btn delete" title="Delete" onclick={() => openDeleteModal(mod)}>
										<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
											<path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
										</svg>
									</button>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
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
<!-- Create / Edit Modal -->
<!-- ═══════════════════════════════════════════════════════ -->
{#if showCreateModal || showEditModal}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div class="modal-overlay" role="dialog" tabindex="-1" onkeydown={(e) => e.key === 'Escape' && (showCreateModal = false, showEditModal = false)} onclick={(e) => { if (e.target === e.currentTarget) { showCreateModal = false; showEditModal = false; } }}>
		<div class="modal animate-fade-in">
			<div class="modal-header">
				<h2 class="modal-title">{showEditModal ? t('moderators.edit_mod') : t('moderators.create_mod')}</h2>
				<button class="modal-close" aria-label="Close" onclick={() => (showCreateModal = false, showEditModal = false)}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" /></svg>
				</button>
			</div>

			{#if formError}
				<div class="alert alert-error modal-alert">{formError}</div>
			{/if}

			<form onsubmit={(e) => { e.preventDefault(); showEditModal ? handleEdit() : handleCreate(); }} class="modal-form">
				<div class="form-row">
					<div class="form-group">
						<label for="mod-first-name" class="form-label">{t('profile.first_name')}</label>
						<input type="text" id="mod-first-name" bind:value={formData.first_name} class="form-input" placeholder="John" />
					</div>
					<div class="form-group">
						<label for="mod-last-name" class="form-label">{t('profile.last_name')}</label>
						<input type="text" id="mod-last-name" bind:value={formData.last_name} class="form-input" placeholder="Doe" />
					</div>
				</div>

				<div class="form-group">
					<label for="mod-username" class="form-label">{t('profile.username')} *</label>
					<input type="text" id="mod-username" bind:value={formData.username} class="form-input" placeholder="moderator1" required />
				</div>

				<div class="form-group">
					<label for="mod-email" class="form-label">{t('profile.email')} *</label>
					<input type="email" id="mod-email" bind:value={formData.email} class="form-input" placeholder="mod@example.com" required />
				</div>

				<div class="form-group">
					<label for="mod-password" class="form-label">
						{t('profile.new_password')} {showEditModal ? t('moderators.leave_empty') : '*'}
					</label>
					<input type="password" id="mod-password" bind:value={formData.password} class="form-input" placeholder="••••••••" required={!showEditModal} />
				</div>

				<div class="modal-actions">
					<button type="button" class="btn btn-secondary" onclick={() => (showCreateModal = false, showEditModal = false)}>
						{t('common.cancel')}
					</button>
					<button type="submit" class="btn btn-primary" disabled={formLoading}>
						{#if formLoading}
							<span class="spinner-sm"></span>
						{/if}
						{showEditModal ? t('common.save_changes') : t('moderators.new_mod')}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}

<!-- ═══════════════════════════════════════════════════════ -->
<!-- Delete Confirmation Modal -->
<!-- ═══════════════════════════════════════════════════════ -->
{#if showDeleteModal && deletingMod}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div class="modal-overlay" role="dialog" tabindex="-1" onkeydown={(e) => e.key === 'Escape' && (showDeleteModal = false)} onclick={(e) => { if (e.target === e.currentTarget) showDeleteModal = false; }}>
		<div class="modal modal-sm animate-fade-in">
			<div class="modal-header">
				<h2 class="modal-title">{t('moderators.delete_mod')}</h2>
				<button class="modal-close" aria-label="Close" onclick={() => (showDeleteModal = false)}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" /></svg>
				</button>
			</div>
			<p class="delete-message">
				{t('moderators.delete_confirm')} <strong>@{deletingMod.username}</strong>?
				This action cannot be undone.
			</p>
			<div class="modal-actions">
				<button class="btn btn-secondary" onclick={() => (showDeleteModal = false)}>{t('common.cancel')}</button>
				<button class="btn btn-danger" onclick={handleDelete} disabled={formLoading}>
					{#if formLoading}
						<span class="spinner-sm"></span>
					{/if}
					{t('common.delete')}
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
		min-width: 0;
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

	/* ─── Toolbar ────────────────────────────────────── */
	.toolbar {
		display: flex;
		align-items: center;
		gap: 1rem;
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
		max-width: 320px;
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

	.count-badge {
		padding: 0.375rem 0.75rem;
		background: var(--color-surface-800);
		border: 1px solid var(--color-surface-700);
		border-radius: 100px;
		font-size: 0.75rem;
		color: var(--color-surface-400);
		font-weight: 500;
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
	}

	.filter-select:focus {
		border-color: var(--color-primary-600);
	}

	.filter-select option {
		background: var(--color-surface-800);
		color: var(--color-surface-100);
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

	/* ─── Table ──────────────────────────────────────── */
	.table-card {
		background: var(--color-surface-800);
		border: 1px solid var(--color-surface-700);
		border-radius: 14px;
		overflow: hidden;
	}

	.table-responsive {
		width: 100%;
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
	}

	.table-loading,
	.table-empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 3rem;
		gap: 0.75rem;
		color: var(--color-surface-500);
		font-size: 0.875rem;
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

	.data-table {
		width: 100%;
		border-collapse: collapse;
	}

	.data-table th {
		text-align: left;
		padding: 0.75rem 1rem;
		font-size: 0.6875rem;
		font-weight: 600;
		color: var(--color-surface-400);
		text-transform: uppercase;
		letter-spacing: 0.05em;
		border-bottom: 1px solid var(--color-surface-700);
		white-space: nowrap;
	}

	.th-actions {
		text-align: right;
	}

	.data-table td {
		padding: 0.75rem 1rem;
		font-size: 0.8125rem;
		border-bottom: 1px solid var(--color-surface-700);
		vertical-align: middle;
		white-space: nowrap;
	}

	.data-table tbody tr:last-child td {
		border-bottom: none;
	}

	.data-table tbody tr {
		transition: background 0.1s;
	}

	.data-table tbody tr:hover {
		background: var(--color-surface-700);
	}

	/* User cell */
	.user-cell {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.user-avatar {
		width: 34px;
		height: 34px;
		border-radius: 50%;
		background: linear-gradient(135deg, var(--color-primary-700), var(--color-primary-600));
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		font-size: 0.8125rem;
		font-weight: 700;
		flex-shrink: 0;
	}

	.user-info {
		display: flex;
		flex-direction: column;
	}

	.user-name {
		font-weight: 600;
		color: var(--color-surface-100);
	}

	.user-username {
		font-size: 0.75rem;
		color: var(--color-surface-500);
	}

	.text-secondary {
		color: var(--color-surface-400);
	}

	/* Status */
	.status-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.625rem;
		border-radius: 100px;
		font-size: 0.75rem;
		font-weight: 500;
	}

	.status-badge.active {
		background: rgba(16, 185, 129, 0.1);
		color: var(--color-primary-400);
	}

	.status-badge.inactive {
		background: rgba(244, 63, 94, 0.1);
		color: var(--color-danger-400);
	}

	.status-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
	}

	.status-badge.active .status-dot {
		background: var(--color-primary-500);
	}

	.status-badge.inactive .status-dot {
		background: var(--color-danger-500);
	}

	/* Actions */
	.action-btns {
		display: flex;
		gap: 0.375rem;
		justify-content: flex-end;
	}

	.action-btn {
		width: 32px;
		height: 32px;
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
		width: 15px;
		height: 15px;
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

	.form-row {
		display: grid;
		grid-template-columns: 1fr 1fr;
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
		width: 100%;
		box-sizing: border-box;
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

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		padding-top: 0.5rem;
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

	@media (max-width: 640px) {
		.toolbar { flex-direction: column; align-items: stretch; }
		.search-box, .filter-select { max-width: 100%; width: 100%; }
		.count-badge { margin-left: 0; align-self: flex-start; }
		.form-row { grid-template-columns: 1fr; }
		
		/* Make tables more responsive by adjusting cells */
		.data-table th, .data-table td { padding: 0.5rem; }
		.td-actions { padding-right: 0.5rem; }
		.action-btn { width: 28px; height: 28px; }
		.user-email, .user-id-badge { display: inline-block; word-break: break-all; }
	}
</style>
