<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import Input from '@components/ui/input.svelte';
	import Textarea from '@components/ui/textarea.svelte';
	import Tooltip from '@components/ui/tooltip.svelte';
	import { common_input, common_textarea } from '@src/paraglide/messages';
	import type { FieldInstance } from '@src/content/types';
	import type { Locale } from '@src/paraglide/runtime';
	import { tokenTarget } from '@src/services/token/token-target';
	import { insertTokenAtSelection, type TokenSelection } from '@src/services/token/insert-token';
	import { activeInput } from '@src/stores/active-input-store.svelte';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import HelpIcon from '@src/components/ui/help-icon.svelte';
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
	let inputRef = $state<HTMLInputElement | HTMLTextAreaElement | undefined>();
	// Caret captured when the picker opens — the modal steals focus, so the
	// selection has to be remembered to insert at the caret instead of replacing.
	let pendingSelection = $state<TokenSelection | null>(null);

	function tokenElement(): HTMLInputElement | HTMLTextAreaElement | null {
		return type === 'textarea'
			? (document.getElementById(id) as HTMLTextAreaElement | null)
			: (inputRef ?? null);
	}

	$effect(() => {
		const el = tokenElement();
		if (!el) return;
		const inst = tokenTarget(el, {
			name: field.db_fieldName,
			label: field.label,
			collection: field.collection as string,
			// Only the `{}` button opens the picker; typing into the field must not.
			openOnFocus: false,
			onInsert: (token: string) => insertToken(token)
		});
		return () => inst.destroy();
	});

	function insertToken(token: string) {
		const next = insertTokenAtSelection(value ?? '', token, pendingSelection);
		value = next.value;
		pendingSelection = null;
		onUpdate(next.value);
	}

	/**
	 * Caret to insert at, or append when the field never had one. An input that was
	 * never focused reports `0,0`, which would prepend the token to existing text.
	 */
	function caretSelection(
		el: HTMLInputElement | HTMLTextAreaElement,
		current: string
	): TokenSelection {
		const start = el.selectionStart;
		const end = el.selectionEnd;
		if (start === null || end === null || (start === 0 && end === 0 && current.length > 0)) {
			return { start: current.length, end: current.length };
		}
		return { start, end };
	}

	function openTokenPicker(e: MouseEvent) {
		e.preventDefault();
		e.stopPropagation();

		const el = tokenElement();
		const current = value ?? '';
		pendingSelection = el ? caretSelection(el, current) : null;
		if (el) {
			el.focus();
		}

		activeInput.set({
			element: el ?? null,
			field: {
				name: field.db_fieldName || id,
				label: label || field.label,
				collection: field.collection as string
			},
			onInsert: (tokenValue: string) => insertToken(tokenValue)
		});
	}

	// Reactive — recalculates whenever value/maxLength/optimalMin/optimalMax change
	const lengthClass = $derived(
		maxLength && value.length > maxLength
			? 'text-error-500'
			: value.length >= optimalMin && value.length <= optimalMax
				? 'text-success-500'
				: 'text-surface-400 dark:text-surface-400'
	);
</script>

<div class="space-y-1">
	<div class="mb-1 flex items-center justify-between gap-2 px-0.5 text-start field-label">
		<div class="flex min-w-0 items-center gap-1.5">
			{#if icon}
				{@render icon()}
			{/if}
			<p class="inline-block truncate font-semibold capitalize">
				{label}
			</p>
			{#if placeholder}
				<SystemTooltip
					title={placeholder}
					ariaLabel={placeholder}
					positioning={{ placement: 'top' }}
				>
					<HelpIcon ariaLabel={placeholder} />
				</SystemTooltip>
			{/if}
		</div>

		<div class="flex shrink-0 items-center gap-1">
			{#if maxLength}
				<span class="text-xs me-2 font-mono {lengthClass}">({value.length}/{maxLength})</span>
			{/if}

			{#if translated}
				<Tooltip
					title={translationPct === 100
						? `${lang.toUpperCase()} translation complete (100%)`
						: `${lang.toUpperCase()} translation present (${translationPct}%)`}
					positioning={{ placement: 'top', gutter: 4 }}
				>
					{#snippet children()}
						<div
							class="flex h-7 items-center gap-1 rounded-full px-1 text-xs font-medium text-black dark:text-white"
						>
							<iconify-icon
								icon="bi:translate"
								width="14"
								class="text-black dark:text-white"
								aria-hidden="true"
							></iconify-icon>
							<span class="font-semibold text-tertiary-600 dark:text-primary-500"
								>{lang.toUpperCase()}</span
							>
							<span
								class="text-[11px] font-medium {translationPct === 100
									? 'text-success-500'
									: translationPct > 0
										? 'text-warning-500'
										: 'text-surface-400'}"
							>
								{translationPct}%
							</span>
						</div>
					{/snippet}
				</Tooltip>
			{/if}

			<SystemTooltip title="Insert Token">
				<Button
					variant="transparent"
					size="sm"
					type="button"
					class="h-7 w-7 p-0"
					onclick={openTokenPicker}
					aria-label="Insert token into {label}"
					aria-haspopup="dialog"
					data-testid="insert-token-button"
				>
					<iconify-icon
						icon="mdi:code-braces"
						width="16"
						class="font-bold text-tertiary-500 dark:text-primary-500"
					></iconify-icon>
				</Button>
			</SystemTooltip>
		</div>
	</div>

	<div class="relative">
		{#if type === 'textarea'}
			<Textarea
				aria-label={common_textarea()}
				{id}
				class="space-y-0"
				textareaClass="pe-12 resize-y text-black dark:text-white"
				{rows}
				{placeholder}
				bind:value
				oninput={(e) => onUpdate((e.currentTarget as HTMLTextAreaElement).value)}
			/>
		{:else}
			<Input
				aria-label={common_input()}
				bind:inputRef={inputRef as HTMLInputElement}
				{id}
				type="text"
				class="space-y-0"
				inputClass="pe-12 text-black dark:text-white"
				{placeholder}
				bind:value
				oninput={(e) => onUpdate((e.currentTarget as HTMLInputElement).value)}
			/>
		{/if}
	</div>
</div>
