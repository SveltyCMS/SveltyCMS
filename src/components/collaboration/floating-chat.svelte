<!--
@file src/components/collaboration/floating-chat.svelte
@component
**Draggable Floating Button for Collaboration and AI Assistant**

Provides a persistent, draggable UI element that opens the ActivityStream panel.
-->

<script lang="ts">
	import { fade, scale } from 'svelte/transition';
	import { collaboration } from '@src/stores/collaboration-store.svelte';
	import { screen } from '@src/stores/screen-size-store.svelte';
	import { ui } from '@src/stores/ui-store.svelte';
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';
	import { page } from '$app/state';

	// --- Derived ---
	const user = $derived(page.data.user);
	const isRtcEnabled = $derived(user?.preferences?.rtc?.enabled ?? true);
	const isOpen = $derived(ui.state.chatPanel !== 'hidden');

	// --- Constants ---
	const BUTTON_RADIUS = 28;
	const EDGE_MARGIN = 20;
	const DRAG_THRESHOLD = 5;

	// --- State ---
	let pos = $state({ x: 0, y: 0 });
	let isDragging = $state(false);

	// --- Logic ---
	function loadPosition() {
		if (!browser) {
			return;
		}
		try {
			const saved = localStorage.getItem('floatingChatPosition');
			if (saved) {
				pos = JSON.parse(saved);
			} else {
				// Default position: bottom-right
				const initialX = window.innerWidth - (BUTTON_RADIUS * 2 + EDGE_MARGIN);
				const initialY = window.innerHeight - (BUTTON_RADIUS * 2 + EDGE_MARGIN + 100);
				pos = { x: initialX, y: initialY };
			}
		} catch {
			pos = { x: 0, y: 0 };
		}
	}

	function savePosition() {
		if (browser) {
			localStorage.setItem('floatingChatPosition', JSON.stringify(pos));
		}
	}

	function drag(node: HTMLElement) {
		let startX: number, startY: number;
		let initialPos: { x: number; y: number };
		let moved = false;

		function handleDown(e: PointerEvent) {
			// Don't drag if clicking close button
			if ((e.target as HTMLElement).closest('.close-btn')) {
				return;
			}

			startX = e.clientX;
			startY = e.clientY;
			initialPos = { ...pos };
			moved = false;
			isDragging = true;

			node.setPointerCapture(e.pointerId);
			window.addEventListener('pointermove', handleMove);
			window.addEventListener('pointerup', handleUp);
		}

		function handleMove(e: PointerEvent) {
			const dx = e.clientX - startX;
			const dy = e.clientY - startY;

			if (!moved && Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
				moved = true;
			}

			if (moved) {
				pos = {
					x: initialPos.x + dx,
					y: initialPos.y + dy
				};
			}
		}

		function handleUp(_e: PointerEvent) {
			isDragging = false;
			window.removeEventListener('pointermove', handleMove);
			window.removeEventListener('pointerup', handleUp);

			if (moved) {
				// Snap to bounds
				pos.x = Math.max(EDGE_MARGIN, Math.min(pos.x, window.innerWidth - (BUTTON_RADIUS * 2 + EDGE_MARGIN)));
				pos.y = Math.max(EDGE_MARGIN, Math.min(pos.y, window.innerHeight - (BUTTON_RADIUS * 2 + EDGE_MARGIN)));
				savePosition();
			} else {
				collaboration.togglePanel();
			}
		}

		node.addEventListener('pointerdown', handleDown);
		return {
			destroy() {
				node.removeEventListener('pointerdown', handleDown);
			}
		};
	}

	onMount(() => {
		loadPosition();
	});

	// Handle mobile layout: center the panel if screen is small
	const panelStyle = $derived.by(() => {
		if (screen.isMobile) {
			return 'position: fixed; bottom: 80px; left: 10px; right: 10px; width: calc(100% - 20px); max-height: 70vh;';
		}
		return 'transform: translateY(-10px);';
	});
</script>

{#if isRtcEnabled}
	<!-- Panel Overlay (Mobile only) -->
	{#if isOpen && screen.isMobile}
		<div
			class="fixed inset-0 z-9999998 bg-black/50"
			onclick={() => collaboration.togglePanel()}
			onkeydown={(e) => e.key === 'Escape' && collaboration.togglePanel()}
			role="button"
			tabindex="-1"
			aria-label="Close collaboration panel"
			transition:fade
		></div>
	{/if}

	<div
		class="fixed z-9999999 flex flex-col items-end gap-4 transition-transform {isDragging ? '' : 'duration-300'}"
		style={screen.isMobile && isOpen ? '' : `left: ${pos.x}px; top: ${pos.y}px;`}
	>
		<!-- Activity Panel -->
		{#if isOpen}
			<div transition:scale={{ duration: 200, start: 0.9 }} class={screen.isMobile ? '' : 'origin-bottom-right mb-2'} style={panelStyle}>
				<ActivityStream />
			</div>
		{/if}

		<!-- Draggable Button -->
		{#if !(screen.isMobile && isOpen)}
			<div
				use:drag
				role="button"
				tabindex="0"
				aria-label="Toggle Collaboration Chat"
				class="relative flex items-center justify-center bg-primary-500 hover:bg-primary-600 text-white rounded-full shadow-lg cursor-grab active:cursor-grabbing transition-colors group"
				style="width: {BUTTON_RADIUS * 2}px; height: {BUTTON_RADIUS * 2}px;"
			>
				<iconify-icon icon={isOpen ? 'mdi:close' : 'material-symbols:Forum-outline'} width="32"></iconify-icon>

				<!-- Notification Badge -->
				{#if !isOpen && collaboration.activities.length > 0}
					<span
						class="absolute -top-1 -right-1 bg-error-500 text-white text-[10px] font-bold h-5 w-5 rounded-full flex items-center justify-center border-2 border-white"
						transition:fade
					>
						{Math.min(collaboration.activities.length, 99)}
					</span>
				{/if}

				<!-- Connected Status Pulse -->
				<span
					class="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-white {collaboration.isConnected
						? 'bg-primary-500'
						: 'bg-error-500'}"
				></span>
			</div>
		{/if}
	</div>
{/if}

<style lang="postcss">
	/* Ensure pointer capture works correctly */
	div {
		touch-action: none;
	}
</style>
