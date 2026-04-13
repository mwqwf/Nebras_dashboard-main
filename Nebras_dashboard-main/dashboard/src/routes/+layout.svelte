<!--
  Root Layout — Auth hydration on app load
  If token exists in localStorage → use it directly (instant load).
  If no token → attempt silent refresh via cookie → fetchMe → redirect.
-->

<script>
	import { onMount } from 'svelte';
	import { getAuthState, setLoading, setViewMode } from '$lib/stores/auth.svelte.js';
	import { refreshAccessToken, fetchMe } from '$lib/api/auth.js';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import LoadingScreen from '$lib/components/LoadingScreen.svelte';
	import { setLanguage, getLanguage, getDir } from '$lib/i18n/store.svelte.js';
	import '../app.css';

	let { children } = $props();

	const authState = getAuthState();
	let currentDir = $derived(getDir());

	onMount(async () => {
		// Initialize Document Language/Dir direction
		setLanguage(getLanguage());
		
		const currentPath = page.url?.pathname || '/';

		// Skip auth hydration on login page
		if (currentPath === '/login') {
			setLoading(false);
			return;
		}

		// ── Fast path: token + user already in localStorage ──
		if (authState.accessToken && authState.user) {
			// We already have credentials — render immediately.
			// Determine viewMode from current path if user is admin.
			if (authState.user.is_super_admin) {
				if (currentPath.startsWith('/moderator')) {
					setViewMode('moderator');
				}
				// else keep the persisted viewMode
			} else if (authState.user.is_moderator) {
				setViewMode('moderator');
			}

			// Redirect from root
			if (currentPath === '/') {
				if (authState.user.is_super_admin) {
					goto('/admin');
				} else if (authState.user.is_moderator) {
					goto('/moderator');
				}
			}

			setLoading(false);

			// Background fetch to ensure profile image and tokens remain perfectly synced
			fetchMe().catch(() => {});

			return;
		}

		// ── Slow path: no token — try silent refresh ──
		const refreshed = await refreshAccessToken();

		if (refreshed) {
			const fetched = await fetchMe();

			if (fetched) {
				if (authState.user?.is_super_admin) {
					if (currentPath.startsWith('/moderator')) {
						setViewMode('moderator');
					} else {
						setViewMode('admin');
					}
				} else if (authState.user?.is_moderator) {
					setViewMode('moderator');
				}

				if (currentPath === '/') {
					if (authState.user?.is_super_admin) {
						goto('/admin');
					} else if (authState.user?.is_moderator) {
						goto('/moderator');
					}
				}

				setLoading(false);
			} else {
				setLoading(false);
				goto('/login');
			}
		} else {
			setLoading(false);
			if (currentPath !== '/login') {
				goto('/login');
			}
		}
	});
</script>

<svelte:head>
	<title>Nebras Dashboard</title>
</svelte:head>

{#if authState.isLoading && page.url?.pathname !== '/login'}
	<LoadingScreen message="Authenticating" />
{:else}
	<div dir={currentDir} style="display: contents;">
		{@render children()}
	</div>
{/if}
