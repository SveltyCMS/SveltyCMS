<script lang="ts">
	import type { FieldInstance } from '@src/content/types';
	import type { Locale } from '@src/paraglide/runtime';
	import { tokenTarget } from '@src/services/token/tokenTarget';

	// Lucide Icons

	import type { Snippet } from 'svelte';

	interface Props {
		field: FieldInstance;
		icon?: Snippet;
		id: string;
		label: string;
		lang: Locale | 'default';
		maxLength?: number;
		onUpdate: (value: string) => void;
		optimalMax?: number;
		optimalMin?: number;
		placeholder?: string;
		rows?: number;
		translated?: boolean;
		translationPct?: number;
		type?: 'input' | 'textarea';
		value: string;
	}

	let {
		id,
		label,
		value = $bindable(),
		placeholder = '',
		type = 'input',
		rows = 3,
		maxLength,
		optimalMin = 0,
		optimalMax = 999,
		translated = false,
		lang,
		translationPct = 0,
		field,
		onUpdate,
		icon
	}: Props = $props();

	// Element references
	let inputRef = $state<HTMLInputElement | HTMLTextAreaElement | undefined>(undefined);

	const getLengthClass = () => {
		if (maxLength && value.length > maxLength) { return 'text-error-500'; }
		if (value.length >= optimalMin && value.length <= optimalMax) { return 'text-success-500'; }
		return 'text-surface-400';
	};
</script>

<div class="space-y-2">
	<div class="flex items-center justify-between mb-1">
		<div class="flex items-center gap-2">
			<label for={id} class="font-bold text-sm cursor-pointer">{label}</label>
			{@render icon?.()}
			<span class="text-surface-400 cursor-help" title={placeholder}> <iconify-icon icon="mdi:information-outline" width={16}></iconify-icon> </span>
		</div>
		<div class="flex items-center gap-3 text-xs">
			<button
				type="button"
				class=""
				title="Insert Token"
				onclick={() => {
					inputRef?.focus();
				}}
			>
				<iconify-icon icon="mdi:code-braces" width={24}></iconify-icon>
			</button>
			{#if maxLength}
				{#if type === 'input'}
					<span class={getLengthClass()}>({value.length}/{maxLength})</span>
				{:else}
					<span class={getLengthClass()}>({value.length}/{maxLength})</span>
				{/if}
			{/if}
			{#if translated}
				<div class="flex items-center gap-1 text-xs">
					<iconify-icon icon="bi:translate" width={24}></iconify-icon>
					<span class="font-medium text-tertiary-500 dark:text-primary-500">{lang.toUpperCase()}</span>
					<span class="font-medium text-surface-400">({translationPct}%)</span>
				</div>
			{/if}
		</div>
	</div>

	<div class="relative">
		{#if type === 'textarea'}
			<textarea
				bind:this={inputRef as HTMLTextAreaElement}
				{id}
				class="textarea pr-12 resize-y"
				{rows}
				{placeholder}
				bind:value
				oninput={(e) => onUpdate((e.currentTarget as HTMLTextAreaElement).value)}
				use:tokenTarget={{ name: field.db_fieldName, label: field.label, collection: field.collection as string }}
			></textarea>
		{:else}
			<input
				bind:this={inputRef as HTMLInputElement}
				{id}
				type="text"
				class="input pr-12"
				{placeholder}
				bind:value
				oninput={(e) => onUpdate((e.currentTarget as HTMLInputElement).value)}
				use:tokenTarget={{ name: field.db_fieldName, label: field.label, collection: field.collection as string }}
			>
		{/if}
	</div>
</div>
