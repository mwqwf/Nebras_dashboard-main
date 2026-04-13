<!--
  Admin Layout — Route guard + DashboardLayout
  Only accessible to is_super_admin users (or admins viewing in admin mode).
  Non-admins who are moderators get redirected to /moderator.
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

		// Guard: must be super_admin
		if (!authState.user.is_super_admin) {
			if (authState.user.is_moderator) {
				goto('/moderator');
			} else {
				goto('/login');
			}
			return;
		}

		// Ensure viewMode is admin when on admin routes
		setViewMode('admin');
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
