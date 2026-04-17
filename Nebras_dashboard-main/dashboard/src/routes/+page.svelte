<!-- Root Page — simple static landing after login removal -->
<script>
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';

	onMount(() => {
		goto('/moderator/content/files');
	});
</script>

<svelte:head>
	<title>Nebras Dashboard</title>
</svelte:head>
