<script lang="ts">
	import '../app.css';
	let { children } = $props();
</script>

<svelte:head>
	<title>SMPTE Color Bars - Broadcast Test Pattern</title>
	<meta name="description" content="Official SMPTE broadcast color bars with time.gov synchronized clock" />
</svelte:head>

{@render children()}
