<!--
@file src/widgets/richText/components/ImageDescription.svelte
@component
**Image Description**

### Props
- `show`: boolean
- `value`: string
- `key`: string
- `active`: string
- `onSubmit`: (value: string) => void

### Features
- Click to edit
- Enter to save
- Escape to cancel
-->

<script lang="ts">
	interface Props {
		show?: boolean;
		value?: string;
		key?: string;
		active?: string;
		onSubmit?: (value: string) => void;
	}

	let { show = false, value: propValue = '', key = '', active = $bindable(''), onSubmit }: Props = $props();

	let _value = $state(''); // Initialize with a default value

	$effect(() => {
		// This effect runs when propValue changes, including initial render
		_value = propValue;
	});
	let show_input = $state(false);

	$effect(() => {
		if (key !== active) {
			show_input = false;
		}
	});

	$effect(() => {
		if (!show) {
			show_input = false;
		}
	});

	function handleKeydown(e: KeyboardEvent & { currentTarget: HTMLInputElement }) {
		if (e.key === 'Enter') {
			show_input = false;
			onSubmit?.(_value);
		}
	}

	function handleClick() {
		show_input = !show_input;
		active = key;
	}
</script>

<div class:hidden={!show} class="relative">
	<button onclick={handleClick} aria-label="Description" class="btn btn-sm flex items-center">
		<iconify-icon icon="material-symbols:description" width="20"></iconify-icon>
		<span class="hidden sm:inline">Description</span>
	</button>
	{#if show_input}
		<div class="description absolute top-full mt-2">
			<input type="text" bind:value={_value} onkeydown={handleKeydown} class="input" placeholder="Enter description" />
		</div>
	{/if}
</div>

<style>
	.description {
		left: 50%;
		transform: translate(-50%);
		width: 250px;
		z-index: 10;
	}
	input {
		border: 1px solid;
		width: 100%;
		padding: 5px;
		border-radius: 5px;
	}
</style>
