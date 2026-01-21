<script lang="ts">
	import type { Locale } from '@src/paraglide/runtime';
	import { tokenTarget } from '@src/services/token/tokenTarget';

	// Lucide Icons
	import Info from '@lucide/svelte/icons/info';
	import CircleQuestionMark from '@lucide/svelte/icons/circle-question-mark';

	import type { Snippet } from 'svelte';

	interface Props {
		id: string;
		label: string;
		value: string;
		placeholder?: string;
		type?: 'input' | 'textarea';
		rows?: number;
		maxLength?: number;
		optimalMin?: number;
		optimalMax?: number;
		translated?: boolean;
		lang: Locale | 'default';
		translationPct?: number;
		field: any;
		onUpdate: (value: string) => void;
		icon?: Snippet;
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
		if (maxLength && value.length > maxLength) return 'text-error-500';
		if (value.length >= optimalMin && value.length <= optimalMax) return 'text-success-500';
		return 'text-surface-400';
	};
</script>

<div class="space-y-2">
	<div class="flex items-center justify-between mb-1">
		<div class="flex items-center gap-2">
			<span class="font-bold text-sm">{label}</span>
			{@render icon?.()}
			<span class="text-surface-400 cursor-help" title={placeholder}>
				<Info size={16} />
			</span>
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
				<CircleQuestionMark size={24} />
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
					<CircleQuestionMark size={24} />
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
				use:tokenTarget={{ name: field.db_fieldName, label: field.label, collection: field.collection }}
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
				use:tokenTarget={{ name: field.db_fieldName, label: field.label, collection: field.collection }}
			/>
		{/if}
	</div>
</div>
