<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	onMount(() => {
		goto('/moderator/content/youtube', { replaceState: true });
	});
</script>

<svelte:head>
	<title>Redirecting — Nebras</title>
</svelte:head>
