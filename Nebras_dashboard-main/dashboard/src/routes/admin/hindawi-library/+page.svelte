<!-- لوحة محرّك مؤسسة هنداوي -->
<script>
	import EngineDashboard from '$lib/components/EngineDashboard.svelte';
	import {
		getEngineStatus,
		startEngine,
		stopEngine,
		runOneTick,
		resetEngine
	} from '$lib/api/hindawiLibrary.js';

	const api = {
		getStatus: () => getEngineStatus(),
		startEngine: () => startEngine(),
		stopEngine: () => stopEngine(),
		runOneTick: () => runOneTick(),
		resetEngine: (mode) => resetEngine(mode)
	};
</script>

<svelte:head><title>مؤسسة هنداوي — Nebras Admin</title></svelte:head>

<EngineDashboard
	title="محرّك مؤسسة هنداوي"
	subtitle="جلب آليّ لكتب PDF الحرّة (CC) من مؤسسة هنداوي. يعمل تلقائياً عبر الـ cron."
	accent="#9333ea"
	{api}
/>
