<!--
  Root Layout â€” Auth hydration on app load
  If token exists in localStorage â†’ use it directly (instant load).
  If no token â†’ attempt silent refresh via cookie â†’ fetchMe â†’ redirect.
-->

<script>
	import { onMount } from 'svelte';
	import { getAuthState, setLoading } from '$lib/stores/auth.svelte.js';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import LoadingScreen from '$lib/components/LoadingScreen.svelte';
	import { setLanguage, getLanguage, getDir } from '$lib/i18n/store.svelte.js';
	import { initFirebase } from '$lib/firebase/client.js';
	import '../app.css';

	let { children } = $props();

	const authState = getAuthState();
	let currentDir = $derived(getDir());

	onMount(async () => {
		await initFirebase();

		// Initialize Document Language/Dir direction
		setLanguage(getLanguage());
		
		const currentPath = page.url?.pathname || '/';

		// â”€â”€ Fast path: token + user already in localStorage â”€â”€
		if (authState.accessToken && authState.user) {
			// Redirect from root
			if (currentPath === '/') {
				goto('/moderator/content/files');
			}

			setLoading(false);
			return;
		}

		// ظ„ط§ ظ†ط­ط§ظˆظ„ طھط³ط¬ظٹظ„ ط§ظ„ط¯ط®ظˆظ„/طھط¬ط¯ظٹط¯ ط§ظ„ط¬ظ„ط³ط© طھظ„ظ‚ط§ط¦ظٹظ‹ط§ ط¨ط¹ط¯ ط­ط°ظپ طµظپط­ط© ط§ظ„ط¯ط®ظˆظ„.
		setLoading(false);
	});
</script>

<svelte:head>
	<title>Nebras Dashboard</title>
</svelte:head>

{#if authState.isLoading}
	<LoadingScreen message="Authenticating" />
{:else}
	<div dir={currentDir} style="display: contents;">
		{@render children()}
	</div>
{/if}

