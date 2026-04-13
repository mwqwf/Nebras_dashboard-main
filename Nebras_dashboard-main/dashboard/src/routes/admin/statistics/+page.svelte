<script>
	import PagePlaceholder from '$lib/components/PagePlaceholder.svelte';
	import { t } from '$lib/i18n/store.svelte.js';
</script>

<svelte:head>
	<title>{t('statistics.title')} — Nebras Admin</title>
</svelte:head>

<PagePlaceholder
	title={t('statistics.title')}
	description={t('statistics.desc')}
	icon="stats"
/>
