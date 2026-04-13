<!--
  Profile Layout — wraps profile page in DashboardLayout
  Accessible to any authenticated user (admin or moderator).
-->

<script>
	import { onMount } from 'svelte';
	import { getAuthState } from '$lib/stores/auth.svelte.js';
	import { goto } from '$app/navigation';
	import DashboardLayout from '$lib/components/DashboardLayout.svelte';
	import LoadingScreen from '$lib/components/LoadingScreen.svelte';

	let { children } = $props();
	let ready = $state(false);

	const authState = getAuthState();

	onMount(() => {
		if (!authState.user) {
			goto('/login');
			return;
		}
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
