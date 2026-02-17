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
		active?: string;
		key?: string;
		onSubmit?: (value: string) => void;
		show?: boolean;
		value?: string;
	}

	let { show = false, value: propValue = '', key = '', active = $bindable(''), onSubmit }: Props = $props();

	let localValue = $state<string | undefined>(undefined);

	let _value = {
		get value() {
			return localValue ?? propValue;
		},

		set value(v: string) {
			localValue = v;
		}
	};

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

			onSubmit?.(_value.value as string);
		}
	}

	function handleClick() {
		show_input = !show_input;

		active = key;
	}
</script>

<div class:hidden={!show} class="relative">
	<button onclick={handleClick} aria-label="Description" class="btn-sm flex items-center">
		<iconify-icon icon="material-symbols:description" width={24}></iconify-icon>

		<span class="hidden sm:inline">Description</span>
	</button>

	{#if show_input}
		<div class="description absolute top-full mt-2">
			<input type="text" bind:value={_value.value} onkeydown={handleKeydown} class="input" placeholder="Enter description">
		</div>
	{/if}
</div>

<style>
	.description {
		left: 50%;
		z-index: 10;
		width: 250px;
		transform: translate(-50%);
	}
	input {
		width: 100%;
		padding: 5px;
		border: 1px solid;
		border-radius: 5px;
	}
</style>
