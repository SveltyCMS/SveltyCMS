<script lang="ts">
	import type { FieldType } from './';
	import * as m from '@src/paraglide/messages';

	let { field, value, error }: { field: FieldType; value: string | null | undefined; error?: string | null } = $props();

	// If the value is initially null or undefined, default it to black.
	if (!value) {
		value = '#000000';
	}
</script>

<div class="container" class:invalid={error}>
	<div class="wrapper">
		<input type="color" id={field.db_fieldName} name={field.db_fieldName} bind:value class="swatch" aria-label="Color Picker Swatch" />

		<input type="text" bind:value placeholder={m.colorPicker_hex()} class="hex-input" aria-label="Hex Color Value" />
	</div>
	{#if error}
		<p class="error-message" role="alert">{error}</p>
	{/if}
</div>

<style lang="postcss">
	.container {
		position: relative;
		padding-bottom: 1.5rem;
	}
	.wrapper {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		border: 1px solid #ccc;
		border-radius: 4px;
		padding: 2px;
	}
	.container.invalid .wrapper {
		border-color: #ef4444;
	}
	.swatch {
		flex-shrink: 0;
		width: 2.25rem;
		height: 2.25rem;
		border: none;
		padding: 0;
		background: none;
		cursor: pointer;
	}
	.hex-input {
		flex-grow: 1;
		border: none;
		outline: none;
		background: none;
		font-family: monospace;
	}
	.error-message {
		position: absolute;
		bottom: 0;
		left: 0;
		width: 100%;
		text-align: center;
		font-size: 0.75rem;
		color: #ef4444;
	}
</style>
