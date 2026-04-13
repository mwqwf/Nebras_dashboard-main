<script>
	import { onMount } from 'svelte';
	import { getAuthState } from '$lib/stores/auth.svelte.js';
	import { fetchMe } from '$lib/api/auth.js';
	import { updateProfile, changePassword } from '$lib/api/user.js';
	import { t } from '$lib/i18n/store.svelte.js';

	const authState = getAuthState();

	// Profile form
	let profileForm = $state({ username: '', email: '', first_name: '', last_name: '' });
	let profileImage = $state(null);
	let profileImagePreview = $state('');
	let profileError = $state('');
	let profileSuccess = $state('');
	let profileLoading = $state(false);

	// Password form
	let passwordForm = $state({ old_password: '', new_password: '', confirm_password: '' });
	let passwordError = $state('');
	let passwordSuccess = $state('');
	let passwordLoading = $state(false);
	let showOldPassword = $state(false);
	let showNewPassword = $state(false);

	onMount(async () => {
		await fetchMe(); // Get fresh user data including profile image URL
		syncFormFromUser();
	});

	function syncFormFromUser() {
		const u = authState.user;
		if (!u) return;
		profileForm = {
			username: u.username || '',
			email: u.email || '',
			first_name: u.first_name || '',
			last_name: u.last_name || ''
		};
		profileImagePreview = u.profile?.profile_image || '';
	}

	function handleImageSelect(e) {
		const f = e.target.files?.[0];
		if (f) {
			profileImage = f;
			const r = new FileReader();
			r.onload = (ev) => { profileImagePreview = ev.target.result; };
			r.readAsDataURL(f);
		}
	}

	function removeImage() {
		profileImage = null;
		profileImagePreview = authState.user?.profile?.profile_image || '';
	}

	async function handleProfileSubmit() {
		profileError = ''; profileSuccess = ''; profileLoading = true;
		try {
			const data = { ...profileForm };
			if (profileImage instanceof File) data.profile_image = profileImage;
			await updateProfile(data);
			await fetchMe();
			syncFormFromUser();
			profileSuccess = t('profile.updated_success');
			profileImage = null;
			setTimeout(() => { profileSuccess = ''; }, 3000);
		} catch (err) {
			try {
				const parsed = JSON.parse(err.message);
				profileError = Object.entries(parsed).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join('. ');
			} catch { profileError = err.message; }
		}
		finally { profileLoading = false; }
	}

	async function handlePasswordSubmit() {
		passwordError = ''; passwordSuccess = ''; passwordLoading = true;
		if (passwordForm.new_password !== passwordForm.confirm_password) {
			passwordError = 'New passwords do not match.'; passwordLoading = false; return;
		}
		if (passwordForm.new_password.length < 8) {
			passwordError = 'Password must be at least 8 characters.'; passwordLoading = false; return;
		}
		try {
			await changePassword(passwordForm.old_password, passwordForm.new_password);
			passwordSuccess = t('profile.password_success');
			passwordForm = { old_password: '', new_password: '', confirm_password: '' };
			setTimeout(() => { passwordSuccess = ''; }, 3000);
		} catch (err) {
			try {
				const parsed = JSON.parse(err.message);
				passwordError = Object.entries(parsed).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`).join('. ');
			} catch { passwordError = err.message; }
		}
		finally { passwordLoading = false; }
	}

	let displayName = $derived(authState.user?.first_name ? `${authState.user.first_name} ${authState.user.last_name || ''}`.trim() : authState.user?.username || '');
	let userRole = $derived(authState.user?.is_super_admin ? 'Super Admin' : 'Moderator');
</script>

<svelte:head><title>My Profile — Nebras</title></svelte:head>

<div class="page">
	<div class="page-header">
		<div>
			<button class="back-btn" onclick={() => history.back()}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5m7-7l-7 7 7 7" /></svg>
				{t('common.back')}
			</button>
			<h1 class="page-title">{t('profile.title')}</h1>
			<p class="page-desc">{t('profile.desc')}</p>
		</div>
	</div>

	<!-- ═══ Profile Section ═══ -->
	<div class="section">
		<div class="section-header">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="section-icon"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
			<h2 class="section-title">{t('profile.personal_info')}</h2>
		</div>

		{#if profileError}<div class="alert alert-error">{profileError}</div>{/if}
		{#if profileSuccess}<div class="alert alert-success">{profileSuccess}</div>{/if}

		<form onsubmit={(e) => { e.preventDefault(); handleProfileSubmit(); }} class="section-body">
			<!-- Avatar row -->
			<div class="avatar-row">
				<div class="avatar-lg">
					{#if profileImagePreview}
						<img src={profileImagePreview} alt="Profile" class="avatar-img" />
					{:else}
						<span class="avatar-letter-lg">{displayName.charAt(0).toUpperCase()}</span>
					{/if}
				</div>
				<div class="avatar-meta">
					<span class="avatar-name">{displayName}</span>
					<span class="avatar-role">{userRole}</span>
					<div class="avatar-btns">
						<label class="btn btn-secondary btn-sm" for="profile-image">{t('profile.change_photo')}</label>
						<input type="file" id="profile-image" accept="image/*" class="file-input-hidden" onchange={handleImageSelect} />
						{#if profileImage}<button type="button" class="btn btn-ghost btn-sm" onclick={removeImage}>{t('profile.undo')}</button>{/if}
					</div>
				</div>
			</div>

			<div class="form-row">
				<div class="form-group"><label for="p-first" class="form-label">{t('profile.first_name')}</label><input type="text" id="p-first" bind:value={profileForm.first_name} class="form-input" /></div>
				<div class="form-group"><label for="p-last" class="form-label">{t('profile.last_name')}</label><input type="text" id="p-last" bind:value={profileForm.last_name} class="form-input" /></div>
			</div>
			<div class="form-row">
				<div class="form-group"><label for="p-username" class="form-label">{t('profile.username')}</label><input type="text" id="p-username" bind:value={profileForm.username} class="form-input" required /></div>
				<div class="form-group"><label for="p-email" class="form-label">{t('profile.email')}</label><input type="email" id="p-email" bind:value={profileForm.email} class="form-input" required /></div>
			</div>

			<div class="form-actions">
				<button type="submit" class="btn btn-primary" disabled={profileLoading}>
					{#if profileLoading}<span class="spinner-sm"></span>{/if}
					{t('common.save_changes')}
				</button>
			</div>
		</form>
	</div>

	<!-- ═══ Password Section ═══ -->
	<div class="section">
		<div class="section-header">
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="section-icon"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>
			<h2 class="section-title">{t('profile.change_password')}</h2>
		</div>

		{#if passwordError}<div class="alert alert-error">{passwordError}</div>{/if}
		{#if passwordSuccess}<div class="alert alert-success">{passwordSuccess}</div>{/if}

		<form onsubmit={(e) => { e.preventDefault(); handlePasswordSubmit(); }} class="section-body">
			<div class="form-row form-row-three">
				<div class="form-group">
					<label for="pw-old" class="form-label">{t('profile.current_password')}</label>
					<div class="pw-wrap">
						<input type={showOldPassword ? 'text' : 'password'} id="pw-old" bind:value={passwordForm.old_password} class="form-input" required />
						<button type="button" class="toggle-pw" onclick={() => (showOldPassword = !showOldPassword)} tabindex="-1">
							{#if showOldPassword}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
							{:else}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
							{/if}
						</button>
					</div>
				</div>
				<div class="form-group">
					<label for="pw-new" class="form-label">{t('profile.new_password')}</label>
					<div class="pw-wrap">
						<input type={showNewPassword ? 'text' : 'password'} id="pw-new" bind:value={passwordForm.new_password} class="form-input" required minlength="8" />
						<button type="button" class="toggle-pw" onclick={() => (showNewPassword = !showNewPassword)} tabindex="-1">
							{#if showNewPassword}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></svg>
							{:else}
								<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
							{/if}
						</button>
					</div>
				</div>
				<div class="form-group">
					<label for="pw-confirm" class="form-label">{t('profile.confirm_password')}</label>
					<input type="password" id="pw-confirm" bind:value={passwordForm.confirm_password} class="form-input" required minlength="8" />
				</div>
			</div>
			<div class="form-actions">
				<button type="submit" class="btn btn-primary" disabled={passwordLoading}>
					{#if passwordLoading}<span class="spinner-sm"></span>{/if}
					{t('profile.update_password')}
				</button>
			</div>
		</form>
	</div>
</div>

<style>
	.page { display: flex; flex-direction: column; gap: 1.25rem; max-width: 720px; margin: 0 auto; }
	.page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; flex-wrap: wrap; }
	.page-title { font-size: 1.5rem; font-weight: 700; color: var(--color-surface-100); letter-spacing: -0.02em; }
	.page-desc { font-size: 0.8125rem; color: var(--color-surface-400); margin-top: 0.25rem; }

	.back-btn { display: inline-flex; align-items: center; gap: 0.375rem; background: none; border: none; color: var(--color-surface-400); font-size: 0.8125rem; font-family: inherit; cursor: pointer; padding: 0.25rem 0; margin-bottom: 0.5rem; transition: color 0.15s; }
	.back-btn:hover { color: var(--color-primary-400); }
	.back-btn svg { width: 16px; height: 16px; }

	/* Sections */
	.section { background: var(--color-surface-800); border: 1px solid var(--color-surface-700); border-radius: 14px; overflow: hidden; }
	.section-header { display: flex; align-items: center; gap: 0.625rem; padding: 1rem 1.5rem; border-bottom: 1px solid var(--color-surface-700); }
	.section-icon { width: 18px; height: 18px; color: var(--color-primary-400); flex-shrink: 0; }
	.section-title { font-size: 0.9375rem; font-weight: 600; color: var(--color-surface-100); }
	.section-body { padding: 1.5rem; display: flex; flex-direction: column; gap: 1.125rem; }

	/* Avatar */
	.avatar-row { display: flex; align-items: center; gap: 1.25rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--color-surface-700); }
	.avatar-lg { width: 72px; height: 72px; border-radius: 50%; background: linear-gradient(135deg, var(--color-primary-700), var(--color-primary-500)); display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; border: 3px solid var(--color-surface-600); }
	.avatar-img { width: 100%; height: 100%; object-fit: cover; }
	.avatar-letter-lg { font-size: 1.75rem; font-weight: 700; color: white; }
	.avatar-meta { display: flex; flex-direction: column; gap: 0.25rem; }
	.avatar-name { font-size: 1rem; font-weight: 600; color: var(--color-surface-100); }
	.avatar-role { font-size: 0.6875rem; font-weight: 600; color: var(--color-primary-400); background: rgba(5,150,105,0.12); padding: 0.15rem 0.5rem; border-radius: 6px; width: fit-content; }
	.avatar-btns { display: flex; gap: 0.5rem; margin-top: 0.375rem; }

	/* Form */
	.form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
	.form-row-three { grid-template-columns: 1fr 1fr 1fr; }
	@media (max-width: 800px) { .form-row, .form-row-three { grid-template-columns: 1fr; } }
	.form-group { display: flex; flex-direction: column; gap: 0.375rem; }
	.form-label { font-size: 0.8125rem; font-weight: 500; color: var(--color-surface-300); }
	.form-input { padding: 0.625rem 0.75rem; background: var(--color-surface-900); border: 1px solid var(--color-surface-600); border-radius: 10px; color: var(--color-surface-100); font-size: 0.8125rem; font-family: inherit; outline: none; transition: border-color 0.15s; width: 100%; }
	.form-input:focus { border-color: var(--color-primary-600); }
	.form-actions { display: flex; justify-content: flex-end; padding-top: 0.25rem; }

	/* Password toggle */
	.pw-wrap { position: relative; }
	.pw-wrap .form-input { padding-inline-end: 2.5rem; }
	.toggle-pw { position: absolute; inset-inline-end: 0.625rem; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: var(--color-surface-500); padding: 0.25rem; display: flex; }
	.toggle-pw:hover { color: var(--color-surface-300); }
	.toggle-pw svg { width: 16px; height: 16px; }

	/* Alerts */
	.alert { padding: 0.75rem 1rem; border-radius: 10px; font-size: 0.8125rem; margin: 0 1.5rem; }
	.alert:first-of-type { margin-top: 1rem; }
	.alert-error { background: rgba(244,63,94,0.1); border: 1px solid rgba(244,63,94,0.2); color: var(--color-danger-400); }
	.alert-success { background: rgba(5,150,105,0.1); border: 1px solid rgba(5,150,105,0.2); color: var(--color-primary-400); }

	/* Buttons */
	.btn { display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.625rem 1.125rem; border-radius: 10px; font-size: 0.8125rem; font-weight: 600; font-family: inherit; cursor: pointer; border: none; transition: all 0.15s; }
	.btn-sm { padding: 0.4375rem 0.75rem; font-size: 0.75rem; }
	.btn-primary { background: linear-gradient(135deg, var(--color-primary-700), var(--color-primary-600)); color: white; }
	.btn-primary:hover { box-shadow: 0 4px 12px rgba(5,150,105,0.25); }
	.btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }
	.btn-secondary { background: var(--color-surface-700); color: var(--color-surface-300); border: 1px solid var(--color-surface-600); }
	.btn-secondary:hover { background: var(--color-surface-600); }
	.btn-ghost { background: transparent; color: var(--color-surface-400); }
	.btn-ghost:hover { color: var(--color-surface-200); }

	.file-input-hidden { position: absolute; width: 0; height: 0; opacity: 0; pointer-events: none; }
	.spinner-sm { width: 14px; height: 14px; border: 2px solid rgba(255,255,255,0.3); border-top-color: white; border-radius: 50%; animation: spin 0.6s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }
</style>
