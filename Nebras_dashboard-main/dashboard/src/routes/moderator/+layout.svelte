<!--
  Moderator Layout — Route guard + DashboardLayout
  Accessible to is_moderator users.
  Non-moderator admins get redirected to /admin.
-->

<script>
	import { onMount } from 'svelte';
	import { getAuthState, setViewMode } from '$lib/stores/auth.svelte.js';
	import { goto } from '$app/navigation';
	import DashboardLayout from '$lib/components/DashboardLayout.svelte';
	import LoadingScreen from '$lib/components/LoadingScreen.svelte';

	let { children } = $props();
	let ready = $state(false);

	const authState = getAuthState();

	onMount(() => {
		// Guard: must be authenticated
		if (!authState.user) {
			goto('/login');
			return;
		}

		// Guard: must be moderator or admin viewing in moderator mode
		if (!authState.user.is_moderator && !authState.user.is_super_admin) {
			goto('/login');
			return;
		}

		// If admin is navigating to moderator routes directly, allow it
		setViewMode('moderator');
		ready = true;
	});
</script>

{#if ready}
	<DashboardLayout>
		{@render children()}
	</DashboardLayout>
{:else}
	<LoadingScreen message="Loading" />
{/if}
