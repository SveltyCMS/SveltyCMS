<!--
@file src\components\image-editor\widgets\focal-point\tool.svelte
@component
**FocalPoint Tool**

Allows users to set the focal point using svelte-canvas compatible state.
Store values are in percentage (0-100) range for consistency with UI controls.
-->

<script lang="ts">
	import { imageEditorStore } from '@components/image-editor/image-editor-store.svelte';
	import { Layer } from 'svelte-canvas';
	import FocalPointControls from './controls.svelte';
	import FocalPointControlsMobile from './controls-mobile.svelte';

	const storeState = imageEditorStore.state;
	let isDraggingFocal = $state(false);

	// Convert percentage (0-100) to decimal (0-1) for internal calculations
	function pctToDecimal(pct: number): number {
		return pct / 100;
	}

	// Convert decimal (0-1) to percentage (0-100) for display
	function decimalToPct(dec: number): number {
		return Math.round(dec * 100);
	}

	function isFocalToolbarComponent(component: unknown): boolean {
		return component === FocalPointControls || component === FocalPointControlsMobile;
	}

	function updateToolbar() {
		const isMobile = imageEditorStore.state.viewportWidth < imageEditorStore.mobileBreakpoint;
		const ControlsComponent = isMobile ? FocalPointControlsMobile : FocalPointControls;
		const fp = storeState.focalPoint ?? { x: 50, y: 50 };

		const baseProps = {
			focalX: fp.x,
			focalY: fp.y,
			onReset: () => {
				storeState.focalPoint = { x: 50, y: 50 };
			},
			onPointChange: (nextPoint: { x: number; y: number }) => {
				storeState.focalPoint = {
					x: Math.max(0, Math.min(100, Math.round(nextPoint.x))),
					y: Math.max(0, Math.min(100, Math.round(nextPoint.y)))
				};
			}
		};

		imageEditorStore.setToolbarControls({
			component: ControlsComponent,
			props: isMobile
				? { ...baseProps, onPointCommit: () => imageEditorStore.takeSnapshot() }
				: baseProps
		});
	}

	// --- Lifecycle $effect ---
	$effect(() => {
		const activeState = imageEditorStore.state.activeState;

		if (activeState === 'focalpoint') {
			void imageEditorStore.state.viewportWidth;
			void storeState.focalPoint?.x;
			void storeState.focalPoint?.y;
			updateToolbar();
		} else if (
			!activeState &&
			isFocalToolbarComponent(imageEditorStore.state.toolbarControls?.component)
		) {
			imageEditorStore.setToolbarControls(null);
		}
	});

	// Hit testing
	export function handleMouseDown(e: MouseEvent, width: number, height: number) {
		const { zoom, translateX, translateY, imageElement } = storeState;
		if (!imageElement) {
			return;
		}

		const rect = (
			(e.currentTarget as HTMLElement) ?? (e.target as HTMLElement)
		).getBoundingClientRect();
		const offsetX = e.clientX - rect.left;
		const offsetY = e.clientY - rect.top;

		const centerX = width / 2 + translateX;
		const centerY = height / 2 + translateY;

		const ix = (offsetX - centerX) / zoom + imageElement.width / 2;
		const iy = (offsetY - centerY) / zoom + imageElement.height / 2;

		if (ix >= 0 && ix <= imageElement.width && iy >= 0 && iy <= imageElement.height) {
			// Store uses percentage (0-100)
			storeState.focalPoint = {
				x: decimalToPct(ix / imageElement.width),
				y: decimalToPct(iy / imageElement.height)
			};
			isDraggingFocal = true;
		}
	}

	export function handleMouseMove(e: MouseEvent, width: number, height: number) {
		if (!isDraggingFocal) {
			return;
		}

		const { zoom, translateX, translateY, imageElement } = storeState;
		if (!imageElement) {
			return;
		}

		const rect = (
			(e.currentTarget as HTMLElement) ?? (e.target as HTMLElement)
		).getBoundingClientRect();
		const offsetX = e.clientX - rect.left;
		const offsetY = e.clientY - rect.top;
		const centerX = width / 2 + translateX;
		const centerY = height / 2 + translateY;

		const ix = (offsetX - centerX) / zoom + imageElement.width / 2;
		const iy = (offsetY - centerY) / zoom + imageElement.height / 2;

		storeState.focalPoint = {
			x: Math.max(0, Math.min(100, decimalToPct(ix / imageElement.width))),
			y: Math.max(0, Math.min(100, decimalToPct(iy / imageElement.height)))
		};
	}

	export function handleMouseUp() {
		if (isDraggingFocal) {
			imageEditorStore.takeSnapshot();
		}
		isDraggingFocal = false;
	}

	const renderFocalPoint = ({
		context,
		width,
		height
	}: {
		context: CanvasRenderingContext2D;
		width: number;
		height: number;
	}) => {
		if (imageEditorStore.state.activeState !== 'focalpoint') {
			return;
		}

		const { zoom, translateX, translateY, imageElement, focalPoint } = storeState;
		if (!imageElement) {
			return;
		}

		context.save();
		context.translate(width / 2 + translateX, height / 2 + translateY);
		context.scale(zoom, zoom);

		const offsetX = -imageElement.width / 2;
		const offsetY = -imageElement.height / 2;
		// Store uses percentage (0-100), convert to decimal (0-1) for positioning
		const fp = focalPoint || { x: 50, y: 50 };
		const fx = offsetX + imageElement.width * pctToDecimal(fp.x);
		const fy = offsetY + imageElement.height * pctToDecimal(fp.y);

		// --- PROFESSIONAL FOCUS RETICLE (Camera / Lightroom Style) ---
		// Dynamic accent color based on theme primary
		const reticleColor = 'oklch(62% 0.22 250)'; // High-visibility precision cyan-blue
		const dropShadow = 'rgba(0, 0, 0, 0.5)';

		// 1. Subtle soft focus zone ring (proportional guide)
		context.lineWidth = 1 / zoom;
		context.strokeStyle = 'rgba(255, 255, 255, 0.25)';
		context.beginPath();
		context.arc(fx, fy, 22 / zoom, 0, Math.PI * 2);
		context.stroke();

		// 2. Camera focus square brackets (4 corner ticks)
		const boxR = 14 / zoom;
		const arm = 5 / zoom;

		context.save();
		context.shadowColor = dropShadow;
		context.shadowBlur = 4 / zoom;
		context.lineWidth = 1.75 / zoom;
		context.strokeStyle = '#ffffff';
		context.beginPath();

		// Top-Left corner
		context.moveTo(fx - boxR, fy - boxR + arm);
		context.lineTo(fx - boxR, fy - boxR);
		context.lineTo(fx - boxR + arm, fy - boxR);

		// Top-Right corner
		context.moveTo(fx + boxR - arm, fy - boxR);
		context.lineTo(fx + boxR, fy - boxR);
		context.lineTo(fx + boxR, fy - boxR + arm);

		// Bottom-Right corner
		context.moveTo(fx + boxR, fy + boxR - arm);
		context.lineTo(fx + boxR, fy + boxR);
		context.lineTo(fx + boxR - arm, fy + boxR);

		// Bottom-Left corner
		context.moveTo(fx - boxR + arm, fy + boxR);
		context.lineTo(fx - boxR, fy + boxR);
		context.lineTo(fx - boxR, fy + boxR - arm);

		context.stroke();
		context.restore();

		// 3. Precision Center Pin (Clean dual-ring dot with micro cross)
		// Dark outline underlay for contrast against bright images
		context.lineWidth = 2.5 / zoom;
		context.strokeStyle = 'rgba(0, 0, 0, 0.6)';
		context.beginPath();
		context.arc(fx, fy, 3.5 / zoom, 0, Math.PI * 2);
		context.stroke();

		// Clean white inner pip
		context.fillStyle = '#ffffff';
		context.beginPath();
		context.arc(fx, fy, 2.5 / zoom, 0, Math.PI * 2);
		context.fill();

		// Micro center accent pip
		context.fillStyle = reticleColor;
		context.beginPath();
		context.arc(fx, fy, 1.2 / zoom, 0, Math.PI * 2);
		context.fill();

		// Micro axis ticks (subtle crosshair offset from center)
		context.strokeStyle = 'rgba(255, 255, 255, 0.85)';
		context.lineWidth = 1 / zoom;
		context.beginPath();
		// North tick
		context.moveTo(fx, fy - 22 / zoom);
		context.lineTo(fx, fy - 16 / zoom);
		// South tick
		context.moveTo(fx, fy + 16 / zoom);
		context.lineTo(fx, fy + 22 / zoom);
		// West tick
		context.moveTo(fx - 22 / zoom, fy);
		context.lineTo(fx - 16 / zoom, fy);
		// East tick
		context.moveTo(fx + 16 / zoom, fy);
		context.lineTo(fx + 22 / zoom, fy);
		context.stroke();

		context.restore();
	};

	export function saveState() {}
	export function beforeExit() {}
</script>

<Layer render={renderFocalPoint} />
