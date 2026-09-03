<!--
@file src/widgets/custom/seo/components/seo-field.svelte
@component
**SEO field with character and SERP pixel guidance**

Accessible meta input used by the SEO widget for title, description, and related fields.

@props
- `id` {string} - Control id
- `label` {string} - Visible label
- `value` {string} - Field value
- `hint` {string} - Recommended-length helper under the control
- `maxLength` {number} - Hard character budget (matches widget validation)
- `optimalMin` / `optimalMax` {number} - Green range
- `measureKind` {'title' | 'description'} - Enables desktop/mobile pixel counters
- `translated` {boolean} - Show language badge
- `onUpdate` {function} - Persist value into SeoData

#### Features
- Character count with optimal / short / over-limit status
- Optional SERP pixel width vs desktop and mobile budgets
- Token insert affordance on hover/focus
- Backward-compatible: extra props are optional so existing callers keep working
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import Input from '@components/ui/input.svelte';
	import Textarea from '@components/ui/textarea.svelte';
	import type { FieldInstance } from '@src/content/types';
	import { tokenTarget } from '@src/services/token/token-target';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import {
		measureSerpWidth,
		SERP_DESC_DESKTOP_PX,
		SERP_DESC_MOBILE_PX,
		SERP_TITLE_DESKTOP_PX,
		SERP_TITLE_MOBILE_PX,
		type SerpSnippetKind
	} from '../seo-serp';
	import {
		widget_seo_suggestioncharacter,
		widget_seo_suggestionwidthdesktop,
		widget_seo_suggestionwidthmobile
	} from '@src/paraglide/messages';

	import type { Snippet } from 'svelte';

	interface Props {
		field: FieldInstance;
		hint?: string;
		icon?: Snippet;
		id: string;
		label: string;
		lang: string;
		maxLength?: number;
		measureKind?: SerpSnippetKind;
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
		icon,
		hint = '',
		measureKind
	}: Props = $props();

	let inputRef = $state<HTMLInputElement | HTMLTextAreaElement | undefined>();

	$effect(() => {
		const el =
			type === 'textarea'
				? (document.getElementById(id) as HTMLTextAreaElement | null)
				: inputRef;
		if (!el) return;
		const inst = tokenTarget(el, {
			name: field.db_fieldName,
			label: field.label,
			collection: field.collection as string
		});
		return () => inst.destroy();
	});

	const lengthStatus = $derived.by(() => {
		if (!maxLength) {
			return 'none' as const;
		}
		if (value.length > maxLength) {
			return 'over' as const;
		}
		if (value.length === 0) {
			return 'empty' as const;
		}
		if (value.length >= optimalMin && value.length <= optimalMax) {
			return 'optimal' as const;
		}
		return 'short' as const;
	});

	const lengthClass = $derived(
		lengthStatus === 'over'
			? 'text-error-500'
			: lengthStatus === 'optimal'
				? 'text-success-500'
				: lengthStatus === 'short'
					? 'text-warning-500'
					: 'text-surface-400 dark:text-surface-400'
	);

	const statusText = $derived(
		lengthStatus === 'over'
			? 'Too long for typical search results'
			: lengthStatus === 'optimal'
				? 'Optimal length'
				: lengthStatus === 'short'
					? 'A bit short'
					: ''
	);

	const barClass = $derived(
		lengthStatus === 'over'
			? 'bg-error-500'
			: lengthStatus === 'optimal'
				? 'bg-success-500'
				: lengthStatus === 'short'
					? 'bg-warning-500'
					: 'bg-surface-400'
	);

	const barWidth = $derived(
		maxLength ? Math.min(100, Math.round((value.length / maxLength) * 100)) : 0
	);

	const pixelWidth = $derived(measureKind ? measureSerpWidth(value || '', measureKind) : 0);
	const desktopPx = $derived(
		measureKind === 'title' ? SERP_TITLE_DESKTOP_PX : measureKind === 'description' ? SERP_DESC_DESKTOP_PX : 0
	);
	const mobilePx = $derived(
		measureKind === 'title' ? SERP_TITLE_MOBILE_PX : measureKind === 'description' ? SERP_DESC_MOBILE_PX : 0
	);

	const hintId = $derived(hint ? `${id}-hint` : undefined);
	const statusId = $derived(statusText ? `${id}-status` : undefined);
	const describedBy = $derived([hintId, statusId].filter(Boolean).join(' ') || undefined);
</script>

<div class="group space-y-1">
	<div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 mb-1">
		<div class="flex items-center gap-2">
			<label for={id} class="font-medium text-sm cursor-pointer dark:text-surface-50">{label}</label>
			{@render icon?.()}
		</div>

		<div class="flex flex-wrap items-center justify-end gap-x-2 gap-y-0.5 text-[11px] sm:text-xs">
			<SystemTooltip title="Insert Token">
				<Button variant="ghost"
					type="button"
					aria-label="Insert Token"
					class="min-w-0 p-1! opacity-0 group-hover:opacity-100 focus-visible:opacity-100 group-focus-within:opacity-100"
					onclick={() => inputRef?.focus()}
				>
					<iconify-icon icon="mdi:code-braces" width={16} class="dark:text-primary-500"></iconify-icon>
				</Button>
			</SystemTooltip>

			{#if maxLength}
				<span class={lengthClass}>
					{widget_seo_suggestioncharacter()}
					{value.length}/{maxLength}
				</span>
			{/if}

			{#if measureKind && desktopPx && mobilePx}
				<span class={lengthClass}>
					{widget_seo_suggestionwidthdesktop()}
					{pixelWidth}/{desktopPx}px
					{widget_seo_suggestionwidthmobile()}
					{pixelWidth}/{mobilePx}px
				</span>
			{/if}

			{#if translated}
				<span class="font-semibold uppercase text-tertiary-500 dark:text-primary-500">{lang.toUpperCase()}</span>
				{#if translationPct > 0}
					<span class="text-surface-400">({translationPct}%)</span>
				{/if}
			{/if}
		</div>
	</div>

	<div class="relative">
		{#if type === 'textarea'}
			<Textarea
				{id}
				class="space-y-0"
				textareaClass="pe-12 resize-y"
				{rows}
				{placeholder}
				bind:value
				aria-describedby={describedBy}
				oninput={(e) => onUpdate((e.currentTarget as HTMLTextAreaElement).value)}
				onchange={(e) => onUpdate((e.currentTarget as HTMLTextAreaElement).value)}
			/>
		{:else}
			<Input
				bind:inputRef={inputRef as HTMLInputElement}
				{id}
				type="text"
				class="space-y-0"
				inputClass="pe-12"
				{placeholder}
				bind:value
				aria-describedby={describedBy}
				oninput={(e) => onUpdate((e.currentTarget as HTMLInputElement).value)}
				onchange={(e) => onUpdate((e.currentTarget as HTMLInputElement).value)}
			/>
		{/if}
	</div>

	{#if maxLength}
		<div class="h-1 overflow-hidden rounded-full bg-surface-500/20" aria-hidden="true">
			<div class="h-full rounded-full transition-[width] {barClass}" style="width: {barWidth}%"></div>
		</div>
	{/if}

	{#if statusText}
		<p id={statusId} class="text-xs {lengthClass}" aria-live="polite">{statusText}</p>
	{/if}
	{#if hint}
		<p id={hintId} class="text-xs text-surface-400 dark:text-surface-400">{hint}</p>
	{/if}
</div>
