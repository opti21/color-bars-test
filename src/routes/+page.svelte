<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import ColorBars from '$lib/components/ColorBars.svelte';
	import { syncTime } from '$lib/timeSync';

	const STORAGE_KEY = 'smpte-color-bars-settings';

	interface Resolution {
		name: string;
		width: number;
		height: number;
		aspect: string;
	}

	const resolutions: Resolution[] = [
		{ name: 'Fit Display', width: 0, height: 0, aspect: 'auto' },
		{ name: 'SD 480p', width: 720, height: 480, aspect: '3:2' },
		{ name: 'HD 720p', width: 1280, height: 720, aspect: '16:9' },
		{ name: '1080p', width: 1920, height: 1080, aspect: '16:9' },
		{ name: '2K', width: 2048, height: 1080, aspect: '1.9:1' },
		{ name: '1440p', width: 2560, height: 1440, aspect: '16:9' },
		{ name: '4K UHD', width: 3840, height: 2160, aspect: '16:9' },
		{ name: '4K DCI', width: 4096, height: 2160, aspect: '1.9:1' },
		{ name: '8K UHD', width: 7680, height: 4320, aspect: '16:9' }
	];

	let resolution = $state<Resolution>(resolutions[0]); // Default fit display
	let containerWidth = $state(1920);
	let containerHeight = $state(1080);
	let nativeWidth = $state(0);
	let nativeHeight = $state(0);

	// Actual dimensions used (either fixed or from container)
	let actualWidth = $derived(resolution.width === 0 ? containerWidth : resolution.width);
	let actualHeight = $derived(resolution.height === 0 ? containerHeight : resolution.height);

	// Calculate zoom/scale level for fixed resolutions
	let scalePercent = $derived(() => {
		if (resolution.width === 0) return 100; // Fit display mode = always 100%

		// Calculate how much the resolution is scaled to fit the container
		const scaleX = containerWidth / resolution.width;
		const scaleY = containerHeight / resolution.height;
		const scale = Math.min(scaleX, scaleY); // SVG uses 'meet' so it's the smaller scale
		return Math.round(scale * 100);
	});
	let isFullscreen = $state(false);
	let barsContainer: HTMLElement;
	let ballEnabled = $state(false);
	let spinnerEnabled = $state(false);
	let syncQrEnabled = $state(false);
	let shimmerEnabled = $state(false);
	let gridEnabled = $state(false);
	let frameEnabled = $state(false);
	let actualSizeMode = $state(false); // true = 1:1 pixels, false = fit to container

	// Time display options
	let showUtcTime = $state(true);
	let showLocalTime = $state(false);
	let showRemoteTime = $state(false);
	let selectedTimezone = $state('America/New_York');

	// Custom overlays
	let customText = $state('');
	let customImage = $state<string | null>(null);
	let imageInput: HTMLInputElement;

	// Info positioning
	type HAlign = 'left' | 'center' | 'right';
	type VAlign = 'top' | 'center' | 'bottom';
	let hAlign = $state<HAlign>('center');
	let vAlign = $state<VAlign>('center');
	let textScale = $state(1);
	let settingsLoaded = $state(false);

	const timezones = [
		{ value: 'Pacific/Honolulu', label: 'HST', name: 'Hawaii' },
		{ value: 'America/Anchorage', label: 'AKST', name: 'Alaska' },
		{ value: 'America/Los_Angeles', label: 'PST', name: 'Pacific' },
		{ value: 'America/Denver', label: 'MST', name: 'Mountain' },
		{ value: 'America/Chicago', label: 'CST', name: 'Central' },
		{ value: 'America/New_York', label: 'EST', name: 'Eastern' },
		{ value: 'America/Sao_Paulo', label: 'BRT', name: 'Brasilia' },
		{ value: 'Europe/London', label: 'GMT', name: 'London' },
		{ value: 'Europe/Paris', label: 'CET', name: 'Paris' },
		{ value: 'Europe/Moscow', label: 'MSK', name: 'Moscow' },
		{ value: 'Asia/Dubai', label: 'GST', name: 'Dubai' },
		{ value: 'Asia/Kolkata', label: 'IST', name: 'India' },
		{ value: 'Asia/Shanghai', label: 'CST', name: 'China' },
		{ value: 'Asia/Tokyo', label: 'JST', name: 'Tokyo' },
		{ value: 'Australia/Sydney', label: 'AEST', name: 'Sydney' },
	];

	interface RemoteTimezone {
		label: string;
		timezone: string;
	}

	function getRemoteTimezone(): RemoteTimezone | null {
		if (!showRemoteTime) return null;
		const tz = timezones.find(t => t.value === selectedTimezone);
		if (!tz) return null;

		return {
			label: tz.label,
			timezone: selectedTimezone
		};
	}

	function handleImageUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = (e) => {
			customImage = e.target?.result as string;
		};
		reader.readAsDataURL(file);
	}

	function clearImage() {
		customImage = null;
		if (imageInput) imageInput.value = '';
	}

	// Settings persistence
	interface Settings {
		resolution: string;
		ball: boolean;
		spinner: boolean;
		syncQr: boolean;
		shimmer: boolean;
		grid: boolean;
		frame: boolean;
		showUtc: boolean;
		showLocal: boolean;
		showRemote: boolean;
		timezone: string;
		customText: string;
		hAlign: HAlign;
		vAlign: VAlign;
		textScale: number;
	}

	function saveSettings() {
		if (!browser) return;
		const settings: Settings = {
			resolution: resolution.name,
			ball: ballEnabled,
			spinner: spinnerEnabled,
			syncQr: syncQrEnabled,
			shimmer: shimmerEnabled,
			grid: gridEnabled,
			frame: frameEnabled,
			showUtc: showUtcTime,
			showLocal: showLocalTime,
			showRemote: showRemoteTime,
			timezone: selectedTimezone,
			customText: customText,
			hAlign: hAlign,
			vAlign: vAlign,
			textScale: textScale
		};
		localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
	}

	function loadSettings() {
		if (!browser) return;
		try {
			const stored = localStorage.getItem(STORAGE_KEY);
			if (!stored) return;

			const settings: Settings = JSON.parse(stored);

			const foundRes = resolutions.find(r => r.name === settings.resolution);
			if (foundRes) resolution = foundRes;

			ballEnabled = settings.ball ?? false;
			spinnerEnabled = settings.spinner ?? false;
			syncQrEnabled = settings.syncQr ?? false;
			shimmerEnabled = settings.shimmer ?? false;
			gridEnabled = settings.grid ?? false;
			frameEnabled = settings.frame ?? false;
			showUtcTime = settings.showUtc ?? true;
			showLocalTime = settings.showLocal ?? false;
			showRemoteTime = settings.showRemote ?? false;
			selectedTimezone = settings.timezone ?? 'America/New_York';
			customText = settings.customText ?? '';
			hAlign = settings.hAlign ?? 'center';
			vAlign = settings.vAlign ?? 'center';
			textScale = settings.textScale ?? 1;
		} catch (e) {
			console.warn('Failed to load settings:', e);
		}
	}

	// Save settings when they change
	$effect(() => {
		if (!settingsLoaded) return;

		// Access all settings to track them
		resolution; ballEnabled; spinnerEnabled; syncQrEnabled; shimmerEnabled; gridEnabled; frameEnabled;
		showUtcTime; showLocalTime; showRemoteTime; selectedTimezone; customText;
		hAlign; vAlign; textScale;
		saveSettings();
	});
	let showFullscreenHint = $state(false);
	let hintTimeout: number;
async function toggleFullscreen() {
		if (!document.fullscreenElement) {
			await barsContainer.requestFullscreen();
			isFullscreen = true;
		} else {
			await document.exitFullscreen();
			isFullscreen = false;
		}
	}

	onMount(() => {
		// Load saved settings
		loadSettings();
		settingsLoaded = true;

		// Initial time sync
		syncTime();

		const handleFullscreenChange = () => {
			isFullscreen = !!document.fullscreenElement;
			if (isFullscreen) {
				const dpr = window.devicePixelRatio || 1;
				// CSS pixels (scaled resolution)
				containerWidth = window.screen.width;
				containerHeight = window.screen.height;
				// Physical pixels (native resolution)
				nativeWidth = Math.floor(window.screen.width * dpr);
				nativeHeight = Math.floor(window.screen.height * dpr);
				showFullscreenHint = true;
				clearTimeout(hintTimeout);
				hintTimeout = setTimeout(() => {
					showFullscreenHint = false;
				}, 3000);
			} else {
				// Reset native dimensions when not fullscreen
				nativeWidth = 0;
				nativeHeight = 0;
				showFullscreenHint = false;
				clearTimeout(hintTimeout);
			}
		};

		document.addEventListener('fullscreenchange', handleFullscreenChange);

		const handleVisibilityChange = () => {
			if (!document.hidden) syncTime();
		};

		document.addEventListener('visibilitychange', handleVisibilityChange);

		// Track container size for "Fit Display" mode
		const resizeObserver = new ResizeObserver((entries) => {
			for (const entry of entries) {
				containerWidth = Math.floor(entry.contentRect.width);
				containerHeight = Math.floor(entry.contentRect.height);
			}
		});

		if (barsContainer) {
			resizeObserver.observe(barsContainer);
		}

		return () => {
			document.removeEventListener('fullscreenchange', handleFullscreenChange);
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			resizeObserver.disconnect();
			clearTimeout(hintTimeout);
		};
	});
</script>

<div class="app">
	<div
		class="bars-container"
		class:actual-size={actualSizeMode && resolution.width !== 0}
		bind:this={barsContainer}
		style="--target-width: {resolution.width}px; --target-height: {resolution.height}px;"
	>
		<ColorBars
			width={actualWidth}
			height={actualHeight}
			{nativeWidth}
			{nativeHeight}
			showBall={ballEnabled}
			showSpinner={spinnerEnabled}
			showSyncQr={syncQrEnabled}
			showShimmer={shimmerEnabled}
			showGrid={gridEnabled}
			showFrame={frameEnabled}
			showUtc={showUtcTime}
			showLocal={showLocalTime}
			remoteTimezone={getRemoteTimezone()}
			{customText}
			{customImage}
			{hAlign}
			{vAlign}
			{textScale}
		/>

		{#if showFullscreenHint}
			<div class="fullscreen-hint">
				<span>ESC to exit</span>
			</div>
		{/if}

	</div>

	<div class="controls">
		<div class="control-group">
			<label class="control-label" for="resolution-select">RESOLUTION</label>
			<select id="resolution-select" class="resolution-select" bind:value={resolution}>
				{#each resolutions as res}
					<option value={res}>
						{#if res.width === 0}
							{res.name}
						{:else}
							{res.name} ({res.width}×{res.height})
						{/if}
					</option>
				{/each}
			</select>
			{#if resolution.width !== 0}
				<button
					class="scale-indicator"
					class:zoomed={!actualSizeMode && scalePercent() !== 100}
					class:actual={actualSizeMode}
					onclick={() => actualSizeMode = !actualSizeMode}
					title={actualSizeMode ? "Click to fit to display" : "Click for 1:1 pixel size"}
				>
					{actualSizeMode ? '1:1' : `${scalePercent()}%`}
				</button>
			{/if}
		</div>

		<div class="control-group toggles">
			<label class="toggle">
				<input type="checkbox" bind:checked={ballEnabled} />
				<span>BALL</span>
			</label>
			<label class="toggle">
				<input type="checkbox" bind:checked={spinnerEnabled} />
				<span>SPINNER</span>
			</label>
			<label class="toggle">
				<input type="checkbox" bind:checked={syncQrEnabled} />
				<span>SYNC QR</span>
			</label>
			<label class="toggle">
				<input type="checkbox" bind:checked={shimmerEnabled} />
				<span>SHIMMER</span>
			</label>
			<label class="toggle">
				<input type="checkbox" bind:checked={gridEnabled} />
				<span>GRID</span>
			</label>
			<label class="toggle">
				<input type="checkbox" bind:checked={frameEnabled} />
				<span>FRAME</span>
			</label>
		</div>

		<div class="control-group time-control">
			<label class="toggle">
				<input type="checkbox" bind:checked={showUtcTime} />
				<span>UTC</span>
			</label>
			<label class="toggle">
				<input type="checkbox" bind:checked={showLocalTime} />
				<span>LOCAL</span>
			</label>
			<label class="toggle">
				<input type="checkbox" bind:checked={showRemoteTime} />
				<span>TZ</span>
			</label>
			{#if showRemoteTime}
				<select class="tz-select" bind:value={selectedTimezone}>
					{#each timezones as tz}
						<option value={tz.value}>{tz.label} - {tz.name}</option>
					{/each}
				</select>
			{/if}
		</div>

		<div class="control-group custom-control">
			<input
				type="text"
				class="text-input"
				bind:value={customText}
				placeholder="Custom text..."
			/>
			<input
				type="file"
				accept="image/*"
				class="file-input"
				bind:this={imageInput}
				onchange={handleImageUpload}
				id="image-upload"
			/>
			<label for="image-upload" class="file-btn">
				{customImage ? 'IMG ✓' : 'IMG'}
			</label>
			{#if customImage}
				<button class="clear-btn" onclick={clearImage}>✕</button>
			{/if}
		</div>

		<div class="control-group align-control">
			<div class="align-buttons">
				<button class="align-btn" class:active={hAlign === 'left'} onclick={() => hAlign = 'left'} title="Align left">◀</button>
				<button class="align-btn" class:active={hAlign === 'center'} onclick={() => hAlign = 'center'} title="Align center">●</button>
				<button class="align-btn" class:active={hAlign === 'right'} onclick={() => hAlign = 'right'} title="Align right">▶</button>
			</div>
			<div class="align-buttons vertical">
				<button class="align-btn" class:active={vAlign === 'top'} onclick={() => vAlign = 'top'} title="Align top">▲</button>
				<button class="align-btn" class:active={vAlign === 'center'} onclick={() => vAlign = 'center'} title="Align middle">●</button>
				<button class="align-btn" class:active={vAlign === 'bottom'} onclick={() => vAlign = 'bottom'} title="Align bottom">▼</button>
			</div>
		</div>

		<div class="control-group text-scale-control">
			<label class="control-label" for="text-scale">TEXT</label>
			<input
				id="text-scale"
				type="range"
				min="0.5"
				max="3"
				step="0.1"
				bind:value={textScale}
				class="scale-slider"
			/>
			<span class="scale-value">{textScale.toFixed(1)}×</span>
		</div>

		<button class="fullscreen-btn" onclick={toggleFullscreen}>
			{isFullscreen ? 'EXIT' : 'FULLSCREEN'}
		</button>
	</div>
</div>

<style>
	.app {
		display: flex;
		flex-direction: column;
		height: 100vh;
		background: #000;
	}

	.bars-container {
		flex: 1;
		min-height: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
		background: #000;
		overflow: hidden;
	}

	.bars-container :global(svg) {
		display: block;
		width: 100%;
		height: 100%;
		overflow: hidden;
	}

	.bars-container.actual-size {
		overflow: auto;
	}

	.bars-container.actual-size :global(svg) {
		width: var(--target-width);
		height: var(--target-height);
		min-width: var(--target-width);
		min-height: var(--target-height);
		max-width: var(--target-width);
		max-height: var(--target-height);
	}

	.bars-container:fullscreen {
		width: 100vw;
		height: 100vh;
	}

	.fullscreen-hint {
		position: absolute;
		bottom: 1rem;
		left: 50%;
		transform: translateX(-50%);
		padding: 0.5rem 1rem;
		background: rgba(0, 0, 0, 0.7);
		color: #666;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		z-index: 20;
		animation: fade-out 3s ease-in-out forwards;
	}

	@keyframes fade-out {
		0%, 70% { opacity: 1; }
		100% { opacity: 0; }
	}

.text-scale-control {
		gap: 0.4rem;
	}

	.scale-slider {
		width: 5rem;
		accent-color: #22c55e;
		cursor: pointer;
	}

	.scale-value {
		font-family: var(--font-mono);
		font-size: 0.625rem;
		color: #22c55e;
		min-width: 2.5rem;
		letter-spacing: 0.05em;
	}

	.controls {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 2rem;
		padding: 0.75rem 1rem;
		background: #0a0a0a;
		border-top: 1px solid #1a1a1a;
		z-index: 100;
	}

	.control-group {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.control-label {
		font-size: 0.625rem;
		color: #666;
		letter-spacing: 0.1em;
	}

	.resolution-select {
		padding: 0.375rem 0.75rem;
		background: #141414;
		border: 1px solid #2a2a2a;
		color: #e5e7eb;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		cursor: pointer;
	}

	.resolution-select:hover {
		border-color: #22c55e;
	}

	.resolution-select:focus {
		outline: none;
		border-color: #22c55e;
	}

	.scale-indicator {
		font-family: var(--font-mono);
		font-size: 0.625rem;
		color: #666;
		padding: 0.25rem 0.5rem;
		background: #141414;
		border: 1px solid #2a2a2a;
		letter-spacing: 0.05em;
		cursor: pointer;
		transition: all 0.15s;
	}

	.scale-indicator:hover {
		border-color: #22c55e;
		color: #9ca3af;
	}

	.scale-indicator.zoomed {
		color: #eab308;
		border-color: #eab308;
	}

	.scale-indicator.actual {
		color: #22c55e;
		border-color: #22c55e;
	}

	.toggles {
		gap: 1rem;
	}

	.time-control {
		gap: 0.5rem;
	}

	.tz-select {
		padding: 0.25rem 0.5rem;
		background: #141414;
		border: 1px solid #2a2a2a;
		color: #eab308;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		cursor: pointer;
	}

	.tz-select:focus {
		outline: none;
		border-color: #eab308;
	}

	.custom-control {
		gap: 0.5rem;
	}

	.text-input {
		width: 10rem;
		padding: 0.25rem 0.5rem;
		background: #141414;
		border: 1px solid #2a2a2a;
		color: #e5e7eb;
		font-family: var(--font-mono);
		font-size: 0.7rem;
	}

	.text-input:focus {
		outline: none;
		border-color: #22c55e;
	}

	.text-input::placeholder {
		color: #666;
	}

	.file-input {
		display: none;
	}

	.file-btn {
		padding: 0.25rem 0.5rem;
		background: #141414;
		border: 1px solid #2a2a2a;
		color: #9ca3af;
		font-family: var(--font-mono);
		font-size: 0.625rem;
		cursor: pointer;
		transition: all 0.15s;
	}

	.file-btn:hover {
		border-color: #22c55e;
		color: #22c55e;
	}

	.clear-btn {
		padding: 0.25rem 0.4rem;
		background: transparent;
		border: 1px solid #ef4444;
		color: #ef4444;
		font-size: 0.625rem;
		cursor: pointer;
		transition: all 0.15s;
	}

	.clear-btn:hover {
		background: #ef4444;
		color: #000;
	}

	.toggle {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		cursor: pointer;
		user-select: none;
		font-size: 0.625rem;
		color: #666;
		letter-spacing: 0.1em;
		transition: color 0.15s;
	}

	.toggle:hover {
		color: #9ca3af;
	}

	.toggle:has(input:checked) {
		color: #22c55e;
	}

	.toggle input {
		accent-color: #22c55e;
		width: 12px;
		height: 12px;
	}

	.align-control {
		gap: 0.5rem;
	}

	.align-buttons {
		display: flex;
		gap: 2px;
	}

	.align-btn {
		width: 24px;
		height: 24px;
		padding: 0;
		background: #141414;
		border: 1px solid #2a2a2a;
		color: #666;
		font-size: 0.625rem;
		cursor: pointer;
		transition: all 0.15s;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.align-btn:hover {
		border-color: #22c55e;
		color: #9ca3af;
	}

	.align-btn.active {
		background: #22c55e;
		border-color: #22c55e;
		color: #000;
	}

	.fullscreen-btn {
		padding: 0.5rem 1rem;
		background: transparent;
		border: 1px solid #2a2a2a;
		color: #9ca3af;
		font-family: var(--font-mono);
		font-size: 0.6875rem;
		letter-spacing: 0.1em;
		cursor: pointer;
		transition: all 0.15s;
	}

	.fullscreen-btn:hover {
		background: #22c55e;
		border-color: #22c55e;
		color: #000;
	}

	@media (max-width: 700px) {
		.controls {
			flex-wrap: wrap;
			gap: 0.75rem;
		}
	}
</style>
