<!--
  Ban Management — /admin/users/bans
  List bans (filtered), Apply ban, Lift ban.
  Dark theme with Islamic green accents.
-->

<script>
	import { onMount } from 'svelte';
	import { listBans, applyBan, liftBan, listModerators } from '$lib/api/admin.js';
	import { t } from '$lib/i18n/store.svelte.js';

	// ─── State ──────────────────────────────────────────
	let bans = $state([]);
	let totalCount = $state(0);
	let currentPage = $state(1);
	let isLoading = $state(true);
	let error = $state('');

	// Filters
	let filterUser = $state('');
	let filterBanned = $state('');
	let searchQuery = $state('');

	// Ban modal
	let showBanModal = $state(false);
	let banForm = $state({ user: '', reason: '', banned_end: '' });
	let banFormError = $state('');
	let banFormLoading = $state(false);

	// Lift ban
	let liftLoading = $state(null); // holds ban id being lifted

	// Moderator list for the user dropdown
	let moderatorsList = $state([]);

	const PAGE_SIZE = 10;
	let totalPages = $derived(Math.ceil(totalCount / PAGE_SIZE));

	let searchTimeout;

	// ─── Lifecycle ──────────────────────────────────────
	onMount(() => {
		fetchBans();
		fetchModeratorOptions();
	});

	// ─── API Calls ──────────────────────────────────────

	async function fetchBans() {
		isLoading = true;
		error = '';
		try {
			const data = await listBans({
				user: filterUser,
				is_banned: filterBanned,
				search: searchQuery,
				page: currentPage
			});
			bans = data.results;
			totalCount = data.count;
		} catch (err) {
			error = err.message;
		} finally {
			isLoading = false;
		}
	}

	async function fetchModeratorOptions() {
		try {
			// Fetch all moderators for the ban user dropdown
			const data = await listModerators({ search: '', page: 1 });
			moderatorsList = data.results;
		} catch {
			// Silent fail — dropdown will be empty
		}
	}

	function handleSearch() {
		clearTimeout(searchTimeout);
		searchTimeout = setTimeout(() => {
			currentPage = 1;
			fetchBans();
		}, 400);
	}

	function handleFilterChange() {
		currentPage = 1;
		fetchBans();
	}

	function goToPage(page) {
		if (page < 1 || page > totalPages) return;
		currentPage = page;
		fetchBans();
	}

	// Apply ban
	function openBanModal() {
		banForm = { user: '', reason: '', banned_end: '' };
		banFormError = '';
		showBanModal = true;
	}

	async function handleApplyBan() {
		banFormError = '';

		if (!banForm.user) {
			banFormError = 'Please select a user.';
			return;
		}
		if (!banForm.reason.trim()) {
			banFormError = 'Please provide a reason.';
			return;
		}
		if (!banForm.banned_end) {
			banFormError = 'Please set a ban end date.';
			return;
		}

		banFormLoading = true;
		try {
			await applyBan({
				user: parseInt(banForm.user),
				reason: banForm.reason,
				banned_end: new Date(banForm.banned_end).toISOString()
			});
			showBanModal = false;
			fetchBans();
		} catch (err) {
			banFormError = parseFormError(err.message);
		} finally {
			banFormLoading = false;
		}
	}

	// Lift ban
	async function handleLiftBan(banId) {
		liftLoading = banId;
		try {
			await liftBan(banId);
			fetchBans();
		} catch (err) {
			error = err.message;
		} finally {
			liftLoading = null;
		}
	}

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

	// Format date for display
	function formatDate(dateStr) {
		if (!dateStr) return '—';
		const d = new Date(dateStr);
		return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
	}

	function getUserName(userId) {
		const mod = moderatorsList.find(m => m.id === userId);
		return mod ? mod.username : null;
	}
</script>

<svelte:head>
	<title>Bans — Nebras Admin</title>
</svelte:head>

<div class="page">
	<!-- Page Header -->
	<div class="page-header">
		<div class="header-info">
			<h1 class="page-title">{t('bans.title')}</h1>
			<p class="page-desc">{t('bans.desc')}</p>
		</div>
		<button class="btn btn-danger-solid" id="apply-ban-btn" onclick={openBanModal}>
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="btn-icon">
				<path d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
			</svg>
			{t('bans.apply_ban')}
		</button>
	</div>

	<!-- Filters -->
	<div class="toolbar">
		<div class="search-box">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="search-icon">
				<path d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
			</svg>
			<input type="text" placeholder={t('bans.search')} bind:value={searchQuery}
				oninput={handleSearch} class="search-input" id="search-bans" />
		</div>

		<select class="filter-select" bind:value={filterBanned} onchange={handleFilterChange}>
			<option value="">{t('bans.all_status')}</option>
			<option value="true">{t('bans.currently_banned')}</option>
			<option value="false">{t('bans.lifted')}</option>
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
				<span>Loading bans...</span>
			</div>
		{:else if bans.length === 0}
			<div class="table-empty">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="empty-icon">
					<path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke-linecap="round" stroke-linejoin="round" />
				</svg>
				<p>{t('bans.no_bans')}</p>
			</div>
		{:else}
			<div class="table-responsive">
				<table class="data-table" id="bans-table">
					<thead>
						<tr>
							<th>{t('bans.user')}</th>
						<th>{t('bans.reason')}</th>
						<th>{t('bans.start')}</th>
						<th>{t('bans.end')}</th>
						<th>{t('common.status')}</th>
						<th class="th-actions">{t('common.actions')}</th>
					</tr>
				</thead>
				<tbody>
					{#each bans as ban (ban.id)}
						<tr>
							<td>
								<div class="user-cell">
									<span class="user-id-badge">#{ban.user}</span>
									{#if getUserName(ban.user)}
										<span class="user-name-label">@{getUserName(ban.user)}</span>
									{/if}
								</div>
							</td>
							<td>
								<span class="reason-text">{ban.reason || '—'}</span>
							</td>
							<td>
								<span class="text-secondary">{formatDate(ban.banned_start)}</span>
							</td>
							<td>
								<span class="text-secondary">{formatDate(ban.banned_end)}</span>
							</td>
							<td>
								<span class="ban-status" class:active={ban.is_banned} class:lifted={!ban.is_banned}>
									<span class="status-dot"></span>
									{ban.is_banned ? 'Banned' : 'Lifted'}
								</span>
							</td>
							<td>
								<div class="action-btns">
									{#if ban.is_banned}
										<button
											class="btn btn-lift"
											onclick={() => handleLiftBan(ban.id)}
											disabled={liftLoading === ban.id}
										>
											{#if liftLoading === ban.id}
												<span class="spinner-sm"></span>
											{:else}
												{t('bans.lift_ban')}
											{/if}
										</button>
									{:else}
										<span class="text-muted">—</span>
									{/if}
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
<!-- Apply Ban Modal -->
<!-- ═══════════════════════════════════════════════════════ -->
{#if showBanModal}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<div class="modal-overlay" role="dialog" tabindex="-1" onclick={(e) => { if (e.target === e.currentTarget) showBanModal = false; }}>
		<div class="modal animate-fade-in">
			<div class="modal-header">
				<h2 class="modal-title">{t('bans.apply_ban')}</h2>
				<button class="modal-close" aria-label="Close" onclick={() => (showBanModal = false)}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12" stroke-linecap="round" stroke-linejoin="round" /></svg>
				</button>
			</div>

			{#if banFormError}
				<div class="alert alert-error modal-alert">{banFormError}</div>
			{/if}

			<form onsubmit={(e) => { e.preventDefault(); handleApplyBan(); }} class="modal-form">
				<div class="form-group">
					<label for="ban-user" class="form-label">{t('bans.user')} *</label>
					<select id="ban-user" bind:value={banForm.user} class="form-select" required>
						<option value="">{t('bans.select_moderator')}</option>
						{#each moderatorsList as mod}
							<option value={mod.id}>@{mod.username} — {mod.first_name} {mod.last_name}</option>
						{/each}
					</select>
				</div>

				<div class="form-group">
					<label for="ban-reason" class="form-label">{t('bans.reason')} *</label>
					<textarea id="ban-reason" bind:value={banForm.reason} class="form-textarea" placeholder="{t('bans.reason')}..." rows="3" required></textarea>
				</div>

				<div class="form-group">
					<label for="ban-end" class="form-label">{t('bans.ban_end_date')}</label>
					<input type="datetime-local" id="ban-end" bind:value={banForm.banned_end} class="form-input" required />
				</div>

				<div class="modal-actions">
					<button type="button" class="btn btn-secondary" onclick={() => (showBanModal = false)}>
						{t('common.cancel')}
					</button>
					<button type="submit" class="btn btn-danger-solid" disabled={banFormLoading}>
						{#if banFormLoading}
							<span class="spinner-sm"></span>
						{/if}
						{t('bans.apply_ban')}
					</button>
				</div>
			</form>
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

	/* ─── Table ──────────────────────────────────────── */
	.table-card {
		background: var(--color-surface-800);
		border: 1px solid var(--color-surface-700);
		border-radius: 14px;
		overflow: hidden;
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

	.table-responsive {
		width: 100%;
		overflow-x: auto;
		-webkit-overflow-scrolling: touch;
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

	.user-id-badge {
		padding: 0.25rem 0.5rem;
		background: var(--color-surface-700);
		border-radius: 6px;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-surface-200);
		font-family: monospace;
	}

	.user-cell {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.user-name-label {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--color-primary-400);
	}

	.reason-text {
		color: var(--color-surface-300);
		max-width: 200px;
		display: inline-block;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.text-secondary {
		color: var(--color-surface-400);
		font-size: 0.75rem;
	}

	.text-muted {
		color: var(--color-surface-600);
	}

	/* Status */
	.ban-status {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.625rem;
		border-radius: 100px;
		font-size: 0.75rem;
		font-weight: 500;
	}

	.ban-status.active {
		background: rgba(244, 63, 94, 0.1);
		color: var(--color-danger-400);
	}

	.ban-status.lifted {
		background: rgba(16, 185, 129, 0.1);
		color: var(--color-primary-400);
	}

	.status-dot {
		width: 6px;
		height: 6px;
		border-radius: 50%;
	}

	.ban-status.active .status-dot {
		background: var(--color-danger-500);
	}

	.ban-status.lifted .status-dot {
		background: var(--color-primary-500);
	}

	/* Actions */
	.action-btns {
		display: flex;
		justify-content: flex-end;
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

	.btn-danger-solid {
		background: linear-gradient(135deg, var(--color-danger-600), var(--color-danger-500));
		color: white;
	}

	.btn-danger-solid:hover {
		box-shadow: 0 4px 12px rgba(244, 63, 94, 0.25);
	}

	.btn-danger-solid:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.btn-lift {
		padding: 0.375rem 0.75rem;
		background: rgba(16, 185, 129, 0.1);
		border: 1px solid var(--color-primary-700);
		border-radius: 8px;
		color: var(--color-primary-400);
		font-size: 0.75rem;
		font-weight: 600;
		font-family: inherit;
		cursor: pointer;
		transition: all 0.15s;
	}

	.btn-lift:hover {
		background: rgba(16, 185, 129, 0.2);
		border-color: var(--color-primary-500);
	}

	.btn-lift:disabled {
		opacity: 0.5;
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

	.form-input,
	.form-select,
	.form-textarea {
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

	.form-input::placeholder,
	.form-textarea::placeholder {
		color: var(--color-surface-500);
	}

	.form-input:focus,
	.form-select:focus,
	.form-textarea:focus {
		border-color: var(--color-primary-600);
	}

	.form-select option {
		background: var(--color-surface-900);
		color: var(--color-surface-100);
	}

	.form-textarea {
		resize: vertical;
		min-height: 80px;
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
		padding-top: 0.5rem;
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

		/* Make tables more responsive by adjusting cells */
		.data-table th, .data-table td { padding: 0.5rem; }
		.td-actions { padding-right: 0.5rem; }
		.action-btn { width: 28px; height: 28px; }
		.user-email, .user-id-badge { display: inline-block; word-break: break-all; }
	}
</style>
