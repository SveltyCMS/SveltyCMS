<script lang="ts">
	// Color Picker
	import ColorPicker, { ChromeVariant } from 'svelte-awesome-color-picker';

	interface Props {
		color?: string;
		show?: boolean;
		key?: string;
		active?: string;
		onChange?: (color: string) => void;
	}

	let { color = $bindable(''), show = false, key = '', active = $bindable(''), onChange }: Props = $props();

	let expanded = $state(false);
	let header = $state<HTMLDivElement | null>(null);

	$effect(() => {
		if (key !== active) {
			expanded = false;
		}
	});

	$effect(() => {
		onChange?.(color);
	});

	function setPosition(node: HTMLDivElement) {
		if (!header) return;

		const parent = header.parentElement as HTMLElement;
		const left_pos = header.getBoundingClientRect().left - parent.getBoundingClientRect().left;
		if (left_pos + node.offsetWidth > parent.offsetWidth) {
			node.style.right = '0';
		} else {
			node.style.left = left_pos < 0 ? '0' : left_pos + 'px';
		}
	}

	function handleClick() {
		expanded = !expanded;
		active = key;
	}
</script>

<div class="wrapper" class:hidden={!show} bind:this={header}>
	<button type="button" onclick={handleClick} aria-label="Select color" class="selected arrow" class:arrow_up={expanded}>
		<iconify-icon icon="fluent-mdl2:color-solid" width="20"></iconify-icon>
	</button>
	{#if expanded}
		<div class="pallette" use:setPosition>
			<ColorPicker bind:hex={color} components={ChromeVariant} sliderDirection="horizontal" isDialog={false} />
		</div>
	{/if}
</div>

<style lang="postcss">
	.selected {
		display: flex;
		justify-content: center;
		align-items: center;
		gap: 5px;
		text-wrap: nowrap;
		text-overflow: ellipsis ' [..]';
	}
	.wrapper {
		z-index: 10;
		position: relative;
		width: 80px;
		box-shadow: 0px 0px 3px 0px #bfbfbf;
		padding: 10px;
		cursor: pointer;
		border-radius: 4px;
	}
	.pallette {
		position: fixed;
		top: 100%;
		padding: 10px;
		margin-top: 10px;
		cursor: pointer;
		display: flex;
		flex-direction: column;
		align-items: start;
		gap: 5px;
		text-wrap: nowrap;
	}
	.arrow::after {
		content: '';
		transform: translateY(-50%);
		border: solid #6b6b6b;
		border-width: 0 3px 3px 0;
		display: inline-block;
		padding: 3px;
		transform: rotate(45deg);
		margin-right: 10px;
		transition: transform 0.1s ease-in;
		margin-left: auto;
	}

	.arrow_up::after {
		transform: rotate(225deg);
	}
</style>
