<!-- لوحة محرّك مكتبة نور -->
<script>
	import EngineDashboard from '$lib/components/EngineDashboard.svelte';
	import {
		getEngineStatus,
		startEngineRemote,
		stopEngineRemote,
		runEngineTickRemote,
		resetEngineCursor,
		factoryResetEngine,
		diagnose
	} from '$lib/api/noorLibrary.js';

	const api = {
		getStatus: () => getEngineStatus(),
		startEngine: () => startEngineRemote(),
		stopEngine: () => stopEngineRemote(),
		runOneTick: () => runEngineTickRemote(),
		resetEngine: (mode) => (mode === 'factory' ? factoryResetEngine() : resetEngineCursor()),
		diagnose: () => diagnose()
	};
</script>

<svelte:head><title>مكتبة نور — Nebras Admin</title></svelte:head>

<EngineDashboard
	title="محرّك مكتبة نور"
	subtitle="جلب آليّ للكتب الحرّة من مكتبة نور عبر crawl4ai. يعمل تلقائياً عبر الـ cron."
	accent="#16a34a"
	{api}
/>
