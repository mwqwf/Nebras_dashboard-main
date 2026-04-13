<!--
  Root Page — Redirects based on auth state
  This page is shown briefly while auth hydration runs.
  The root layout handles the actual redirect logic.
-->

<script>
	import LoadingScreen from '$lib/components/LoadingScreen.svelte';
</script>

<svelte:head>
	<title>Nebras Dashboard</title>
</svelte:head>

<LoadingScreen message="Redirecting" />
