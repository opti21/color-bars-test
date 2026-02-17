<script lang="ts">
	import { onMount } from 'svelte';
	import { getSyncedTime } from '$lib/timeSync';
	import qrcode from 'qrcode-generator';

	interface RemoteTimezone {
		label: string;
		timezone: string;
	}

	type HAlign = 'left' | 'center' | 'right';
	type VAlign = 'top' | 'center' | 'bottom';

	interface Props {
		width: number;
		height: number;
		nativeWidth?: number;
		nativeHeight?: number;
		showBall?: boolean;
		showSpinner?: boolean;
		showSyncQr?: boolean;
		showShimmer?: boolean;
		showGrid?: boolean;
		showFrame?: boolean;
		showUtc?: boolean;
		showLocal?: boolean;
		remoteTimezone?: RemoteTimezone | null;
		customText?: string;
		customImage?: string | null;
		hAlign?: HAlign;
		vAlign?: VAlign;
		textScale?: number;
	}

	let { width, height, nativeWidth = 0, nativeHeight = 0, showBall = false, showSpinner = false, showSyncQr = false, showShimmer = false, showGrid = false, showFrame = false, showUtc = true, showLocal = false, remoteTimezone = null, customText = '', customImage = null, hAlign = 'center', vAlign = 'center', textScale = 1 }: Props = $props();

	// Check if display is scaled (native differs from rendered)
	const isScaled = $derived(nativeWidth > 0 && nativeHeight > 0 && (nativeWidth !== width || nativeHeight !== height));

	// Build list of times to display
	interface TimeDisplay {
		label: string;
		getTime: () => Date;
		color: string;
		isLocal: boolean;
	}

	function getTimeDisplays(): TimeDisplay[] {
		const displays: TimeDisplay[] = [];

		if (showUtc) {
			displays.push({
				label: 'UTC',
				getTime: () => currentTime,
				color: '#22c55e',
				isLocal: false
			});
		}
		if (showLocal) {
			displays.push({
				label: 'LOCAL',
				getTime: () => currentTime,
				color: '#3b82f6',
				isLocal: true
			});
		}
		if (remoteTimezone) {
			displays.push({
				label: remoteTimezone.label,
				getTime: () => {
					// Convert current UTC time to the selected timezone
					const formatter = new Intl.DateTimeFormat('en-US', {
						timeZone: remoteTimezone.timezone,
						hour: 'numeric',
						minute: 'numeric',
						second: 'numeric',
						fractionalSecondDigits: 3,
						hour12: false
					});
					const parts = formatter.formatToParts(currentTime);
					const h = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
					const m = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
					const s = parseInt(parts.find(p => p.type === 'second')?.value || '0');
					const ms = parseInt(parts.find(p => p.type === 'fractionalSecond')?.value || '0');
					const d = new Date(currentTime);
					d.setUTCHours(h, m, s, ms);
					return d;
				},
				color: '#eab308',
				isLocal: false
			});
		}
		return displays;
	}

	// SMPTE ST 2046-1 Safe Areas
	const actionSafe = 0.035; // 3.5% inset = 93% visible
	const titleSafe = 0.05;   // 5% inset = 90% visible

	// SMPTE 75% color bars (standard broadcast intensity)
	const mainBars = [
		{ color: '#b4b4b4', name: '75% White' },
		{ color: '#b4b400', name: '75% Yellow' },
		{ color: '#00b4b4', name: '75% Cyan' },
		{ color: '#00b400', name: '75% Green' },
		{ color: '#b400b4', name: '75% Magenta' },
		{ color: '#b40000', name: '75% Red' },
		{ color: '#0000b4', name: '75% Blue' }
	];

	// Second row - reverse order for castellations
	const castellations = [
		{ color: '#0000b4', name: 'Blue' },
		{ color: '#000000', name: 'Black' },
		{ color: '#b400b4', name: 'Magenta' },
		{ color: '#000000', name: 'Black' },
		{ color: '#00b4b4', name: 'Cyan' },
		{ color: '#000000', name: 'Black' },
		{ color: '#b4b4b4', name: '75% White' }
	];

	// Third row - PLUGE and other reference signals
	const pluGeRow = [
		{ color: '#00214c', name: '-I', width: 1 },
		{ color: '#ffffff', name: '100% White', width: 1 },
		{ color: '#320042', name: '+Q', width: 1 },
		{ color: '#000000', name: 'Black', width: 1 },
		{ color: '#000000', name: 'Superblack (3.5%)', width: 0.5 },
		{ color: '#0d0d0d', name: 'Black (7.5%)', width: 1 },
		{ color: '#1a1a1a', name: 'Light Black (11.5%)', width: 0.5 },
		{ color: '#000000', name: 'Black', width: 2 }
	];

	// Computed values for PLUGE row
	const plugeY = $derived(height * 0.75);
	const plugeHeight = $derived(height * 0.25);
	const totalWidthUnits = pluGeRow.reduce((sum, item) => sum + item.width, 0);
	const unitWidth = $derived(width / totalWidthUnits);

	function getPlugeX(index: number): number {
		return pluGeRow.slice(0, index).reduce((sum, item) => sum + item.width * (width / totalWidthUnits), 0);
	}

	// Timecode
	let currentTime = $state(new Date());
	let animationFrame: number;

	// FPS tracking
	let fps = $state(0);
	let lastFrameTime = 0;
	let frameCount = 0;
	let fpsUpdateTime = 0;

	// Ball animation
	let ballX = $state(0);
	let ballDirection = $state(1);
	const ballRadius = $derived(Math.min(width, height) * 0.025);
	const ballY = $derived(height * 0.67 / 2);
	const ballSpeed = $derived(width / 2); // pixels/sec — crosses screen in ~2 seconds
	let spinnerAngle = $state(0);
	const spinnerRadius = $derived(Math.max(width * 0.16, height * 0.22));
	const spinnerCenterX = $derived(width * 0.5);
	const spinnerCenterY = $derived(height * 0.5);
	const spinnerStroke = $derived(Math.max(1.5, Math.min(width, height) * 0.0055));
	const spinnerSpeed = 72; // degrees/sec (360deg / 5s)
	const spinnerCycleMs = 5000;
	const spinnerStartAngle = 180; // Align cycle start to 12 o'clock
	let spinnerFlashFrameMs = $state(1000 / 60); // updated each frame to match actual frame duration
	let spinnerPhaseMs = $state(0);
	const spinnerCircumference = $derived(2 * Math.PI * spinnerRadius);
	const spinnerSweepLength = $derived(spinnerCircumference * 0.24);
	const spinnerSweepDash = $derived(`${spinnerSweepLength} ${Math.max(0.001, spinnerCircumference - spinnerSweepLength)}`);
	let qrSize = $state(29);
	const qrCell = $derived(Math.max(2, Math.min(width, height) * 0.0065));
	const qrRenderSize = $derived(qrSize * qrCell);
	const qrX = $derived(width * 0.02);
	const qrPanelPadding = $derived(qrCell * 1.1);
	const qrLabelHeight = $derived(height * 0.038);
	const qrPanelWidth = $derived(qrRenderSize + qrPanelPadding * 2);
	const qrPanelHeight = $derived(qrRenderSize + qrPanelPadding * 2 + qrLabelHeight);
	const qrY = $derived((height - qrPanelHeight) / 2);
	let qrToken = $state(0);
	let qrLabel = $state('');
	let qrDataUrl = $state('');

	function generateSyncDataUrl(payload: string): { dataUrl: string, size: number } {
		const qr = qrcode(0, 'L');
		qr.addData(payload);
		qr.make();
		const count = qr.getModuleCount();
		const canvas = document.createElement('canvas');
		canvas.width = count;
		canvas.height = count;
		const ctx = canvas.getContext('2d')!;
		ctx.fillStyle = '#ffffff';
		ctx.fillRect(0, 0, count, count);
		ctx.fillStyle = '#000000';
		for (let r = 0; r < count; r++) {
			for (let c = 0; c < count; c++) {
				if (qr.isDark(r, c)) ctx.fillRect(c, r, 1, 1);
			}
		}
		return { dataUrl: canvas.toDataURL(), size: count };
	}

	function updateAnimation(timestamp: number) {
		currentTime = getSyncedTime();
		const deltaMs = lastFrameTime > 0 ? timestamp - lastFrameTime : 16.67;

		// FPS calculation
		frameCount++;
		if (timestamp - fpsUpdateTime >= 500) {
			fps = Math.round((frameCount * 1000) / (timestamp - fpsUpdateTime));
			frameCount = 0;
			fpsUpdateTime = timestamp;
		}
		spinnerFlashFrameMs = deltaMs;
		lastFrameTime = timestamp;

		if (showBall) {
			ballX += ballSpeed * ballDirection * (deltaMs / 1000);
			if (ballX >= width - ballRadius) {
				ballX = width - ballRadius;
				ballDirection = -1;
			} else if (ballX <= ballRadius) {
				ballX = ballRadius;
				ballDirection = 1;
			}
		}

		if (showSpinner) {
			spinnerPhaseMs = ((currentTime.getTime() % spinnerCycleMs) + spinnerCycleMs) % spinnerCycleMs;
			spinnerAngle = (spinnerPhaseMs / spinnerCycleMs) * 360;
		}

		if (showSyncQr) {
			const frame = Math.floor((currentTime.getUTCMilliseconds() / 1000) * 30);
			const nextToken = Math.floor(currentTime.getTime() / 1000);
			if (nextToken !== qrToken) {
				qrToken = nextToken;
				qrLabel = `${currentTime.toISOString()}|${width}x${height}|f${frame.toString().padStart(2, '0')}`;
				const qrResult = generateSyncDataUrl(qrLabel);
				qrDataUrl = qrResult.dataUrl;
				qrSize = qrResult.size;
			}
		}

		if (showShimmer) {
			shimmerX += shimmerSpeed * (deltaMs / 1000);
			if (shimmerX > width) {
				shimmerX = -shimmerWidth - height;
			}
		}

		animationFrame = requestAnimationFrame(updateAnimation);
	}

	onMount(() => {
		ballX = ballRadius;
		qrLabel = `${currentTime.toISOString()}|${width}x${height}|f00`;
		const qrInit = generateSyncDataUrl(qrLabel);
		qrDataUrl = qrInit.dataUrl;
		qrSize = qrInit.size;
		animationFrame = requestAnimationFrame(updateAnimation);
		return () => cancelAnimationFrame(animationFrame);
	});

	// Timecode formatting (HH:MM:SS:FF format - frames at 30fps)
	function getTimecode(date: Date, useLocal: boolean = false): string {
		const hours = (useLocal ? date.getHours() : date.getUTCHours()).toString().padStart(2, '0');
		const minutes = (useLocal ? date.getMinutes() : date.getUTCMinutes()).toString().padStart(2, '0');
		const seconds = (useLocal ? date.getSeconds() : date.getUTCSeconds()).toString().padStart(2, '0');
		const ms = useLocal ? date.getMilliseconds() : date.getUTCMilliseconds();
		const frames = Math.floor((ms / 1000) * 30).toString().padStart(2, '0');
		return `${hours}:${minutes}:${seconds}:${frames}`;
	}

	// Shimmer sweep animation
	let shimmerX = $state(0);
	const shimmerSpeed = $derived(width / 5); // pixels/sec — crosses screen in ~5 seconds
	const shimmerWidth = $derived(width * 0.3);
</script>

<svg
	viewBox="0 0 {width} {height}"
	xmlns="http://www.w3.org/2000/svg"
	class="color-bars"
>
	<defs>
		<!-- Clip path to keep shimmer within bounds -->
		<clipPath id="bars-clip">
			<rect x="0" y="0" width={width} height={height} />
		</clipPath>
		<!-- Shimmer gradient: transparent on left, solid white on right -->
		<linearGradient id="shimmer-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
			<stop offset="0%" stop-color="white" stop-opacity="0" />
			<stop offset="100%" stop-color="white" stop-opacity="0.7" />
		</linearGradient>
	</defs>

	<!-- Background to fill any gaps -->
	<rect x="0" y="0" width={width} height={height} fill="#000" />

	<g>
		<!-- Main color bars - top 67% -->
		{#each mainBars as bar, i}
			<rect
				x={(width / 7) * i}
				y="0"
				width={width / 7 + 1}
				height={height * 0.67}
				fill={bar.color}
			/>
		{/each}

		<!-- Castellations row - 8% height -->
		{#each castellations as bar, i}
			<rect
				x={(width / 7) * i}
				y={height * 0.67}
				width={width / 7 + 1}
				height={height * 0.08}
				fill={bar.color}
			/>
		{/each}

		<!-- PLUGE and reference row - bottom 25% -->
		{#each pluGeRow as segment, i}
			<rect
				x={getPlugeX(i)}
				y={plugeY}
				width={segment.width * unitWidth + 1}
				height={plugeHeight}
				fill={segment.color}
			/>
		{/each}
	</g>

	<!-- Frame border, diagonal cross, and center circle -->
	{#if showFrame}
		<g class="frame-overlay" fill="none" stroke="#ffffff" stroke-width="2" opacity="0.6">
			<!-- Outer border frame -->
			<rect
				x="1"
				y="1"
				width={width - 2}
				height={height - 2}
			/>
			<!-- Diagonal cross lines -->
			<line x1="0" y1="0" x2={width} y2={height} />
			<line x1={width} y1="0" x2="0" y2={height} />
			<!-- Center circle -->
			<circle
				cx={width / 2}
				cy={height / 2}
				r={Math.min(width, height) * 0.15}
			/>
		</g>
	{/if}

	<!-- Shimmer sweep overlay - 45 degree parallelogram -->
	{#if showShimmer}
		{@const skew = height}
		<g clip-path="url(#bars-clip)" style="mix-blend-mode: screen;">
			<polygon
				points="{shimmerX},{height} {shimmerX + shimmerWidth},{height} {shimmerX + shimmerWidth + skew},0 {shimmerX + skew},0"
				fill="url(#shimmer-gradient)"
			/>
		</g>
	{/if}

	<!-- Bouncing ball -->
	{#if showBall}
		<circle
			cx={ballX}
			cy={ballY}
			r={ballRadius}
			fill="#ffffff"
			class="bouncing-ball"
		/>
	{/if}

	{#if showSyncQr}
		<g class="sync-qr">
			<rect
				x={qrX}
				y={qrY}
				width={qrPanelWidth}
				height={qrPanelHeight}
				fill="#ffffff"
				stroke="rgba(0, 0, 0, 0.2)"
				stroke-width={Math.max(1, qrCell * 0.25)}
			/>
			{#if qrDataUrl}
				<image
					x={qrX + qrPanelPadding}
					y={qrY + qrPanelPadding}
					width={qrRenderSize}
					height={qrRenderSize}
					href={qrDataUrl}
					image-rendering="pixelated"
				/>
			{/if}
			<rect
				x={qrX + qrPanelPadding}
				y={qrY + qrPanelPadding}
				width={qrRenderSize}
				height={qrRenderSize}
				fill="none"
				stroke="#ffffff"
				stroke-width={Math.max(1, qrCell * 0.35)}
			/>
			<text
				x={qrX + qrPanelPadding}
				y={qrY + qrPanelHeight - qrLabelHeight * 0.32}
				fill="#e5e7eb"
				font-family="'Share Tech Mono', monospace"
				font-size={height * 0.019}
				letter-spacing="0.02em"
			>
				SYNC-LINK
			</text>
		</g>
	{/if}

	<!-- Info overlay - vertically stacked and positioned -->
	{#if true}
		{@const displays = getTimeDisplays()}
		{@const rowHeight = height * 0.045}
		{@const gap = height * 0.015}
		{@const margin = height * 0.02}
		{@const extraRows = isScaled ? 1 : 0}
		{@const totalRows = displays.length + 2 + extraRows}
		{@const boxWidth = width * 0.28}
		{@const infoBoxHeight = rowHeight * totalRows + height * 0.025}
		{@const textBoxHeight = customText ? height * 0.05 : 0}
		{@const imgBoxHeight = customImage ? height * 0.12 : 0}
		{@const totalStackHeight = infoBoxHeight + textBoxHeight + imgBoxHeight + (customText ? gap : 0) + (customImage ? gap : 0)}
		{@const stackStartY = vAlign === 'top' ? margin : vAlign === 'bottom' ? height - totalStackHeight - margin : (height - totalStackHeight) / 2}
		{@const textBoxY = stackStartY}
		{@const imgBoxY = stackStartY + (customText ? textBoxHeight + gap : 0)}
		{@const boxY = stackStartY + (customText ? textBoxHeight + gap : 0) + (customImage ? imgBoxHeight + gap : 0)}
		{@const boxX = hAlign === 'left' ? margin : hAlign === 'right' ? width - boxWidth - margin : width * 0.5 - boxWidth / 2}
		{@const textCenterX = hAlign === 'left' ? margin + boxWidth / 2 : hAlign === 'right' ? width - margin - boxWidth / 2 : width * 0.5}
		{@const outRowY = boxY + height * 0.012 + rowHeight * 0.5}
		{@const nativeRowY = boxY + height * 0.012 + rowHeight * 1.5}
		{@const fpsRowY = boxY + height * 0.012 + rowHeight * (isScaled ? 2.5 : 1.5)}
		{@const timeStartRow = isScaled ? 3 : 2}
		{@const imgBoxWidth = width * 0.12}
		{@const imgBoxX = hAlign === 'left' ? margin + (boxWidth - imgBoxWidth) / 2 : hAlign === 'right' ? width - margin - boxWidth + (boxWidth - imgBoxWidth) / 2 : width * 0.5 - imgBoxWidth / 2}
		{@const spinnerX = width * 0.5}
		{@const spinnerY = height * 0.5}

		<!-- Custom text (top of stack) -->
		{#if customText}
			<g class="custom-text-group">
				<rect
					x={boxX}
					y={textBoxY}
					width={boxWidth}
					height={textBoxHeight}
					fill="rgba(0, 0, 0, 0.85)"
					rx="2"
				/>
				<text
					x={textCenterX}
					y={textBoxY + textBoxHeight / 2}
					text-anchor="middle"
					dominant-baseline="middle"
					fill="#ffffff"
					font-family="'VT323', monospace"
					font-size={height * 0.03 * textScale}
					letter-spacing="0.05em"
				>
					{customText}
				</text>
			</g>
		{/if}

		<!-- Custom image (middle of stack) -->
		{#if customImage}
			<g class="custom-image-group">
				<rect
					x={imgBoxX}
					y={imgBoxY}
					width={imgBoxWidth}
					height={imgBoxHeight}
					fill="rgba(0, 0, 0, 0.85)"
					rx="2"
				/>
				<image
					x={imgBoxX + width * 0.005}
					y={imgBoxY + height * 0.005}
					width={imgBoxWidth - width * 0.01}
					height={imgBoxHeight - height * 0.01}
					href={customImage}
					preserveAspectRatio="xMidYMid meet"
				/>
			</g>
		{/if}

		<g class="info-group">
			<!-- Background box -->
			<rect
				x={boxX}
				y={boxY}
				width={boxWidth}
				height={infoBoxHeight}
				fill="rgba(0, 0, 0, 0.85)"
				rx="2"
			/>

			<!-- Output resolution row -->
			<text
				x={boxX + width * 0.015}
				y={outRowY}
				text-anchor="start"
				dominant-baseline="middle"
				fill="#9ca3af"
				font-family="'Share Tech Mono', monospace"
				font-size={height * 0.016 * textScale}
				letter-spacing="0.1em"
				opacity="0.7"
			>
				{isScaled ? 'OUT' : 'RES'}
			</text>
			<text
				x={boxX + boxWidth - width * 0.015}
				y={outRowY}
				text-anchor="end"
				dominant-baseline="middle"
				fill={isScaled ? '#f59e0b' : '#e5e7eb'}
				font-family="'Share Tech Mono', monospace"
				font-size={height * 0.028 * textScale}
				letter-spacing="0.02em"
			>
				{width}×{height}
			</text>

			<!-- Native resolution row (only when scaled) -->
			{#if isScaled}
				<text
					x={boxX + width * 0.015}
					y={nativeRowY}
					text-anchor="start"
					dominant-baseline="middle"
					fill="#9ca3af"
					font-family="'Share Tech Mono', monospace"
					font-size={height * 0.016 * textScale}
					letter-spacing="0.1em"
					opacity="0.7"
				>
					NATIVE
				</text>
				<text
					x={boxX + boxWidth - width * 0.015}
					y={nativeRowY}
					text-anchor="end"
					dominant-baseline="middle"
					fill="#22c55e"
					font-family="'Share Tech Mono', monospace"
					font-size={height * 0.028 * textScale}
					letter-spacing="0.02em"
				>
					{nativeWidth}×{nativeHeight}
				</text>
			{/if}

			<!-- FPS row -->
			<text
				x={boxX + width * 0.015}
				y={fpsRowY}
				text-anchor="start"
				dominant-baseline="middle"
				fill="#9ca3af"
				font-family="'Share Tech Mono', monospace"
				font-size={height * 0.016 * textScale}
				letter-spacing="0.1em"
				opacity="0.7"
			>
				FPS
			</text>
			<text
				x={boxX + boxWidth - width * 0.015}
				y={fpsRowY}
				text-anchor="end"
				dominant-baseline="middle"
				fill="#22c55e"
				font-family="'Share Tech Mono', monospace"
				font-size={height * 0.028 * textScale}
				letter-spacing="0.02em"
			>
				{fps}
			</text>

			<!-- Time rows -->
			{#each displays as display, i}
				{@const rowY = boxY + height * 0.012 + rowHeight * (i + timeStartRow + 0.5)}
				<text
					x={boxX + width * 0.015}
					y={rowY}
					text-anchor="start"
					dominant-baseline="middle"
					fill={display.color}
					font-family="'Share Tech Mono', monospace"
					font-size={height * 0.016 * textScale}
					letter-spacing="0.1em"
					opacity="0.7"
				>
					{display.label}
				</text>
				<text
					x={boxX + boxWidth - width * 0.015}
					y={rowY}
					text-anchor="end"
					dominant-baseline="middle"
					fill={display.color}
					font-family="'Share Tech Mono', monospace"
					font-size={height * 0.028 * textScale}
					letter-spacing="0.02em"
				>
					{getTimecode(display.getTime(), display.isLocal)}
				</text>
			{/each}
		</g>

		{#if showSpinner}
			{@const flashLineWidth = Math.max(1, spinnerStroke * 0.55)}
			{@const starX = spinnerRadius * 0.18}
			{@const starY = spinnerRadius * 0.11}
			{@const starCore = spinnerRadius * 0.055}
			<g transform="translate({spinnerX} {spinnerY})">
				<defs>
					<linearGradient id="spinner-sweep-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
						<stop offset="0%" stop-color="#ffffff" stop-opacity="1" />
						<stop offset="8%" stop-color="#ffffff" stop-opacity="1" />
						<stop offset="100%" stop-color="#ffffff" stop-opacity="0" />
					</linearGradient>
					<linearGradient id="spinner-sweep-core" x1="0%" y1="0%" x2="100%" y2="0%">
						<stop offset="0%" stop-color="#ffffff" stop-opacity="1" />
						<stop offset="32%" stop-color="#ffffff" stop-opacity="0" />
					</linearGradient>
				</defs>
				<circle
					cx="0"
					cy="0"
					r={spinnerRadius}
					fill="none"
					stroke="#050505"
					stroke-width={spinnerStroke * 2.4}
					opacity="0.95"
				/>
				<circle
					cx="0"
					cy="0"
					r={spinnerRadius + spinnerStroke * 1.25}
					fill="none"
					stroke="#ffffff"
					stroke-width="2"
					opacity="1"
				/>
				<circle
					cx="0"
					cy="0"
					r={Math.max(1, spinnerRadius - spinnerStroke * 1.25)}
					fill="none"
					stroke="#ffffff"
					stroke-width="2"
					opacity="1"
				/>
				<g transform="rotate({spinnerAngle + spinnerStartAngle})">
					<circle
						cx="0"
						cy="0"
						r={spinnerRadius}
						fill="none"
						stroke="url(#spinner-sweep-gradient)"
						stroke-width={spinnerStroke * 2.1}
						stroke-dasharray={spinnerSweepDash}
						stroke-linecap="butt"
						opacity="1"
					/>
					<circle
						cx="0"
						cy="0"
						r={spinnerRadius}
						fill="none"
						stroke="url(#spinner-sweep-core)"
						stroke-width={spinnerStroke * 1.05}
						stroke-dasharray={spinnerSweepDash}
						stroke-linecap="butt"
						opacity="1"
					/>
				</g>

				{#if spinnerPhaseMs < spinnerFlashFrameMs}
					<!-- Horizontal crosshair line -->
					<line
						x1={-spinnerX}
						y1="0"
						x2={width - spinnerX}
						y2="0"
						stroke="#ffffff"
						stroke-width="1"
						opacity="0.9"
					/>
					<!-- 4-pointed starburst with curved edges -->
					<path
						d="M {starX},0 C {starCore},0 0,-{starCore} 0,-{starY} C 0,-{starCore} -{starCore},0 -{starX},0 C -{starCore},0 0,{starCore} 0,{starY} C 0,{starCore} {starCore},0 {starX},0 Z"
						fill="#ffffff"
						opacity="1"
					/>
				{/if}
			</g>
		{/if}
	{/if}

	<!-- SMPTE Safe Area Grid (ST 2046-1) -->
	{#if showGrid}
		<g class="safe-area-grid" fill="none" stroke-width="1">
			<!-- Action Safe (93%) - outer rectangle -->
			<rect
				x={width * actionSafe}
				y={height * actionSafe}
				width={width * (1 - 2 * actionSafe)}
				height={height * (1 - 2 * actionSafe)}
				stroke="#ff0000"
				stroke-dasharray="8,4"
			/>
			<!-- Title Safe (90%) - inner rectangle -->
			<rect
				x={width * titleSafe}
				y={height * titleSafe}
				width={width * (1 - 2 * titleSafe)}
				height={height * (1 - 2 * titleSafe)}
				stroke="#ffff00"
				stroke-dasharray="8,4"
			/>
			<!-- Center crosshairs -->
			<line
				x1={width * 0.5 - width * 0.03}
				y1={height * 0.5}
				x2={width * 0.5 + width * 0.03}
				y2={height * 0.5}
				stroke="#ffffff"
			/>
			<line
				x1={width * 0.5}
				y1={height * 0.5 - height * 0.03}
				x2={width * 0.5}
				y2={height * 0.5 + height * 0.03}
				stroke="#ffffff"
			/>
			<!-- Center circle -->
			<circle
				cx={width * 0.5}
				cy={height * 0.5}
				r={Math.min(width, height) * 0.02}
				stroke="#ffffff"
			/>
			<!-- Corner markers for Action Safe -->
			{#each [[0, 0], [1, 0], [0, 1], [1, 1]] as [cx, cy]}
				<line
					x1={width * actionSafe + (cx * width * (1 - 2 * actionSafe))}
					y1={height * actionSafe + (cy * height * (1 - 2 * actionSafe)) + (cy === 0 ? 0 : -height * 0.02)}
					x2={width * actionSafe + (cx * width * (1 - 2 * actionSafe))}
					y2={height * actionSafe + (cy * height * (1 - 2 * actionSafe)) + (cy === 0 ? height * 0.02 : 0)}
					stroke="#ff0000"
				/>
				<line
					x1={width * actionSafe + (cx * width * (1 - 2 * actionSafe)) + (cx === 0 ? 0 : -width * 0.02)}
					y1={height * actionSafe + (cy * height * (1 - 2 * actionSafe))}
					x2={width * actionSafe + (cx * width * (1 - 2 * actionSafe)) + (cx === 0 ? width * 0.02 : 0)}
					y2={height * actionSafe + (cy * height * (1 - 2 * actionSafe))}
					stroke="#ff0000"
				/>
			{/each}
		</g>

		<!-- Grid labels -->
		<text
			x={width * actionSafe + 5}
			y={height * actionSafe + height * 0.025}
			fill="#ff0000"
			font-family="'Share Tech Mono', monospace"
			font-size={height * 0.018}
		>
			ACTION SAFE 93%
		</text>
		<text
			x={width * titleSafe + 5}
			y={height * titleSafe + height * 0.025}
			fill="#ffff00"
			font-family="'Share Tech Mono', monospace"
			font-size={height * 0.018}
		>
			TITLE SAFE 90%
		</text>
	{/if}
</svg>

<style>
	.color-bars {
		display: block;
		image-rendering: pixelated;
		image-rendering: crisp-edges;
	}

	.bouncing-ball {
		filter: drop-shadow(0 0 10px rgba(255, 255, 255, 0.8));
	}
</style>
