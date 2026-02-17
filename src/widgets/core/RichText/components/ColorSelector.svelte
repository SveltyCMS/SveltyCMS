<!--
@file: /src/components/ColorSelector.svelte
@component
**Tiptp ColorSelector**

### Props
- `color`: string
- `show`: boolean
- `key`: string
- `active`: string
- `onChange`: (color: string) => void

### Features
- Click to edit
- Enter to save
- Escape to cancel
-->

<script lang="ts">
	import { onMount } from 'svelte';
	import ColorPicker, { ChromeVariant } from 'svelte-awesome-color-picker';

	interface Props {
		active?: string; // Tracks the currently active dropdown on the page
		color?: string;
		key?: string; // Unique key for this dropdown instance
		onChange?: (color: string) => void;
		show?: boolean;
	}

	let { color = $bindable(''), show = true, key = 'color-selector', active = $bindable(''), onChange }: Props = $props();

	let expanded = $state(false);
	let wrapperRef = $state<HTMLDivElement | null>(null);

	// Effect to call onChange when color changes
	$effect(() => {
		if (onChange) {
			onChange(color);
		}
	});

	// Effect to close this component if another one becomes active
	$effect(() => {
		if (key !== active) {
			expanded = false;
		}
	});

	function close() {
		expanded = false;
		if (active === key) {
			active = '';
		}
	}

	function toggle() {
		const wasExpanded = expanded;
		// Ensure other dropdowns are closed before opening this one
		if (!wasExpanded) {
			active = key;
		}
		expanded = !wasExpanded;

		// If we just closed it, clear the active key
		if (wasExpanded) {
			close();
		}
	}

	onMount(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (wrapperRef && !wrapperRef.contains(event.target as Node)) {
				close();
			}
		};

		const handleKeydown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				close();
			}
		};

		document.addEventListener('click', handleClickOutside);
		document.addEventListener('keydown', handleKeydown);

		return () => {
			document.removeEventListener('click', handleClickOutside);
			document.removeEventListener('keydown', handleKeydown);
		};
	});

	// Action to dynamically position the palette to avoid overflow
	function setPosition(node: HTMLDivElement) {
		if (!wrapperRef) return;
		const parent = wrapperRef.parentElement as HTMLElement;
		const { left: wrapperLeft } = wrapperRef.getBoundingClientRect();
		const { left: parentLeft, width: parentWidth } = parent.getBoundingClientRect();

		const leftPos = wrapperLeft - parentLeft;
		if (leftPos + node.offsetWidth > parentWidth) {
			node.style.left = 'auto';
			node.style.right = '0';
		} else {
			node.style.right = 'auto';
			node.style.left = '0'; // Position relative to the wrapper
		}
	}
</script>

<div class="wrapper" class:hidden={!show} bind:this={wrapperRef}>
	<button
		type="button"
		onclick={toggle}
		onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && toggle()}
		aria-label="Select color"
		aria-expanded={expanded}
		aria-controls="color-palette-{key}"
		class="selected btn-sm arrow"
		class:arrow_up={expanded}
	>
		<iconify-icon icon="fluent-mdl2:color-solid" width={24}></iconify-icon>
	</button>
	{#if expanded}
		<div id="color-palette-{key}" class="palette" use:setPosition>
			<ColorPicker bind:hex={color} components={ChromeVariant} sliderDirection="horizontal" isDialog={false} />
		</div>
	{/if}
</div>

<style>
	.selected {
		display: flex;
		gap: 5px;
		align-items: center;
		justify-content: center;
		width: 100%;
	}
	.wrapper {
		position: relative;
		z-index: 10;
		padding: 2px;
		cursor: pointer;
		border-radius: 4px;
		box-shadow: 0px 0px 3px 0px #bfbfbf;
	}
	.palette {
		position: absolute;
		top: 100%;
		padding: 10px;
		margin-top: 10px;
		cursor: pointer;
		background: #fff;
		border-radius: 5px;
		box-shadow: 0 0 10px rgba(0, 0, 0, 0.1);
	}
	.arrow::after {
		display: inline-block;
		padding: 3px;
		margin-left: auto;
		content: "";
		border: solid #6b6b6b;
		border-width: 0 2px 2px 0;
		transform: rotate(45deg);
		transition: transform 0.2s ease-in-out;
	}

	.arrow_up::after {
		transform: rotate(-135deg);
	}
</style>
