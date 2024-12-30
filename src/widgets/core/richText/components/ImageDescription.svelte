<!--
@file src/widgets/richText/components/ImageDescription.svelte
@description - Image Description
-->

<script lang="ts">
	interface Props {
		show?: boolean;
		value?: string;
		key?: string;
		active?: string;
		onSubmit?: (value: string) => void;
	}

	let { show = false, value = '', key = '', active = $bindable(''), onSubmit }: Props = $props();

	let _value = $state(value);

	$effect(() => {
		_value = value;
	});

	$effect(() => {
		if (key !== active) {
			show_input = false;
		}
	});

	let show_input = $state(false);

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

<div class:hidden={!show}>
	<button onclick={handleClick} aria-label="Description" class="flex items-center">
		<iconify-icon icon="material-symbols:description" width="20"></iconify-icon>
		description
	</button>
	{#if show_input}
		<div class="description">
			<input type="text" bind:value={_value} onkeydown={handleKeydown} />
		</div>
	{/if}
</div>

<style lang="postcss">
	.description {
		position: fixed;
		top: 100%;
		margin-top: 20px;
		left: 50%;
		transform: translate(-50%);
	}
	input {
		border: 1px solid;
		width: 200%;
		padding: 5px;
		border-radius: 5px;
	}
</style>
