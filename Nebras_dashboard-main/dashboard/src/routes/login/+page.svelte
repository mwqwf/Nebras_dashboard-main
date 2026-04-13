<!--
  Login Page — /login
  Dark theme with Islamic green + gold accents.
  On success: stores tokens, redirects based on role.
-->

<script>
	import { login, fetchMe } from '$lib/api/auth.js';
	import { getAuthState, setViewMode } from '$lib/stores/auth.svelte.js';
	import { goto } from '$app/navigation';
	import { t, getDir } from '$lib/i18n/store.svelte.js';

	let username = $state('');
	let password = $state('');
	let error = $state('');
	let isSubmitting = $state(false);
	let showPassword = $state(false);

	const authState = getAuthState();

	$effect(() => {
		if (authState.user && !authState.isLoading) {
			redirectByRole(authState.user);
		}
	});

	function redirectByRole(user) {
		if (user.is_super_admin) {
			setViewMode('admin');
			goto('/admin');
		} else if (user.is_moderator) {
			setViewMode('moderator');
			goto('/moderator');
		}
	}

	async function handleSubmit(e) {
		e.preventDefault();
		error = '';

		if (!username.trim() || !password.trim()) {
			error = 'Please fill in all fields.';
			return;
		}

		isSubmitting = true;

		const result = await login(username, password);

		if (result.success) {
			const fetched = await fetchMe();
			if (fetched) {
				redirectByRole(authState.user);
			} else {
				error = 'Login succeeded but could not fetch user profile.';
				isSubmitting = false;
			}
		} else {
			error = result.error;
			isSubmitting = false;
		}
	}
	
	import { toggleLanguage, getLanguage } from '$lib/i18n/store.svelte.js';
</script>

<svelte:head>
	<title>Login — Nebras Dashboard</title>
</svelte:head>

<div class="login-page" id="login-page">
	<div class="lang-switch-container">
		<button class="lang-btn" onclick={toggleLanguage} title="Change Language">
			{getLanguage() === 'ar' ? 'EN' : 'عربي'}
		</button>
	</div>
	<div class="bg-pattern"></div>

	<div class="login-card animate-fade-in">
		<!-- Brand -->
		<div class="login-brand">
			<div class="brand-icon">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
					<path d="M12 3L2 12h3v8h6v-6h2v6h6v-8h3L12 3z" />
				</svg>
			</div>
			<h1 class="brand-title">Nebras</h1>
			<p class="brand-subtitle">{t('login.desc')}</p>
		</div>

		<!-- Form -->
		<form onsubmit={handleSubmit} class="login-form" id="login-form">
			{#if error}
				<div class="error-message" id="login-error">
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="error-icon">
						<path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" stroke-linecap="round" stroke-linejoin="round" />
					</svg>
					<span>{error}</span>
				</div>
			{/if}

			<div class="form-group">
				<label for="username" class="form-label">{t('login.username')}</label>
				<input type="text" id="username" bind:value={username} class="form-input"
					placeholder={t('login.username')} autocomplete="username" disabled={isSubmitting} />
			</div>

			<div class="form-group">
				<label for="password" class="form-label">{t('login.password')}</label>
				<div class="password-wrapper">
					<input type={showPassword ? 'text' : 'password'} id="password" bind:value={password}
						class="form-input" placeholder={t('login.password')} autocomplete="current-password"
						disabled={isSubmitting} />
					<button type="button" class="password-toggle"
						onclick={() => (showPassword = !showPassword)} tabindex="-1">
						{#if showPassword}
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" /></svg>
						{:else}
							<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
						{/if}
					</button>
				</div>
			</div>

			<button type="submit" class="submit-btn" id="login-submit" disabled={isSubmitting}>
				{#if isSubmitting}
					<span class="spinner"></span>
					{t('login.signing_in')}
				{:else}
					{t('login.sign_in')}
				{/if}
			</button>
		</form>

		<p class="login-footer">
			Staff access only. Contact your administrator for credentials.
		</p>
	</div>
</div>

<style>
	.login-page {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: var(--color-surface-950);
		position: relative;
		overflow: hidden;
		padding: 1rem;
	}

	.lang-switch-container {
		position: absolute;
		top: 1rem;
		inset-inline-end: 1.5rem;
		z-index: 10;
	}

	.lang-btn {
		background: rgba(255, 255, 255, 0.05);
		border: 1px solid var(--color-surface-700);
		color: var(--color-primary-400);
		font-weight: 700;
		font-size: 0.8125rem;
		padding: 0.375rem 0.75rem;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.lang-btn:hover {
		background: rgba(255, 255, 255, 0.1);
		border-color: var(--color-surface-600);
	}

	.bg-pattern {
		position: absolute;
		inset: 0;
		background-image:
			radial-gradient(circle at 25% 25%, rgba(5, 150, 105, 0.07) 0%, transparent 50%),
			radial-gradient(circle at 75% 75%, rgba(217, 119, 6, 0.05) 0%, transparent 50%);
	}

	.login-card {
		position: relative;
		width: 100%;
		max-width: 400px;
		padding: 2.5rem;
		background: var(--color-surface-900);
		border: 1px solid var(--color-surface-700);
		border-radius: 20px;
		box-shadow: var(--shadow-elevated), var(--shadow-glow);
	}

	.login-brand {
		text-align: center;
		margin-bottom: 2rem;
	}

	.brand-icon {
		width: 56px;
		height: 56px;
		margin: 0 auto 1rem;
		background: linear-gradient(135deg, var(--color-primary-700), var(--color-primary-500));
		border-radius: 16px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: white;
		box-shadow: 0 4px 20px rgba(5, 150, 105, 0.3);
	}

	.brand-icon svg { width: 28px; height: 28px; }

	.brand-title {
		font-size: 1.75rem;
		font-weight: 800;
		background: linear-gradient(135deg, var(--color-primary-300), var(--color-primary-100));
		-webkit-background-clip: text;
		-webkit-text-fill-color: transparent;
		background-clip: text;
		letter-spacing: -0.03em;
		margin-bottom: 0.25rem;
	}

	.brand-subtitle {
		font-size: 0.8125rem;
		color: var(--color-surface-400);
	}

	/* Error */
	.error-message {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		padding: 0.75rem;
		background: rgba(244, 63, 94, 0.1);
		border: 1px solid rgba(244, 63, 94, 0.2);
		border-radius: 10px;
		margin-bottom: 1.25rem;
		color: var(--color-danger-400);
		font-size: 0.8125rem;
		line-height: 1.4;
	}

	.error-icon { width: 18px; height: 18px; flex-shrink: 0; margin-top: 1px; }

	/* Form */
	.login-form {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
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
		padding: 0.75rem 0.875rem;
		background: var(--color-surface-800);
		border: 1px solid var(--color-surface-600);
		border-radius: 10px;
		color: var(--color-surface-100);
		font-size: 0.875rem;
		font-family: inherit;
		transition: all 0.2s ease;
		outline: none;
	}

	.form-input::placeholder { color: var(--color-surface-500); }

	.form-input:focus {
		border-color: var(--color-primary-500);
		box-shadow: 0 0 0 3px rgba(5, 150, 105, 0.15);
	}

	.form-input:disabled { opacity: 0.5; cursor: not-allowed; }

	.password-wrapper { position: relative; }
	.password-wrapper .form-input { padding-inline-end: 2.5rem; }

	.password-toggle {
		position: absolute;
		inset-inline-end: 0.75rem;
		top: 50%;
		transform: translateY(-50%);
		background: none;
		border: none;
		color: var(--color-surface-500);
		cursor: pointer;
		padding: 0.25rem;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: color 0.15s ease;
	}

	.password-toggle:hover { color: var(--color-surface-300); }
	.password-toggle svg { width: 18px; height: 18px; }

	/* Submit */
	.submit-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		width: 100%;
		padding: 0.75rem;
		background: linear-gradient(135deg, var(--color-primary-700), var(--color-primary-600));
		border: none;
		border-radius: 10px;
		color: white;
		font-size: 0.875rem;
		font-weight: 600;
		font-family: inherit;
		cursor: pointer;
		transition: all 0.2s ease;
		margin-top: 0.5rem;
	}

	.submit-btn:hover:not(:disabled) {
		background: linear-gradient(135deg, var(--color-primary-600), var(--color-primary-500));
		box-shadow: 0 4px 15px rgba(5, 150, 105, 0.3);
		transform: translateY(-1px);
	}

	.submit-btn:active:not(:disabled) { transform: translateY(0); }
	.submit-btn:disabled { opacity: 0.7; cursor: not-allowed; }

	.spinner {
		width: 18px;
		height: 18px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: white;
		border-radius: 50%;
		animation: spin 0.6s linear infinite;
	}

	@keyframes spin { to { transform: rotate(360deg); } }

	.login-footer {
		text-align: center;
		margin-top: 1.5rem;
		font-size: 0.75rem;
		color: var(--color-surface-500);
	}
</style>
