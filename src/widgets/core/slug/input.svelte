<!--
@file src/widgets/core/slug/input.svelte
@component
**Slug widget input.** Fills from the entry title or name until the editor types in the field.

### Props
- `field`: collection field (optional `targetField`)
- `value`: bindable slug string

### Features
- URL-safe slug from the sibling title or name
- Manual edits stop the automatic fill
- "From title" starts following the title again
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import Input from '@components/ui/input.svelte';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import { widget_slug_placeholder, widget_slug_from_title } from '@src/paraglide/messages';
	import type { FieldInstance } from '@src/content/types';
	import { collections } from '@src/stores/collection-store.svelte';
	import { locale } from '@src/stores/locale-store.svelte';
	import { slugify, slugifyTyping } from './slugify';

	let { field, value = $bindable() }: { field: FieldInstance; value?: string | null } = $props();

	const inputId = $props.id();

	let locked = $state(false);
	let generated = '';

	function plain(raw: unknown): string {
		if (typeof raw === 'string') return raw;
		if (!raw || typeof raw !== 'object') return '';
		const record = raw as Record<string, unknown>;
		const lang = locale.contentLanguage;
		const picked = record[lang] ?? record.en;
		if (typeof picked === 'string') return picked;
		for (const item of Object.values(record)) {
			if (typeof item === 'string' && item.trim()) return item;
		}
		return '';
	}

	function sourceText(): string {
		const data = collections.activeValue as Record<string, unknown> | undefined;
		if (!data) return '';
		const preferred =
			typeof (field as { targetField?: string }).targetField === 'string'
				? (field as { targetField?: string }).targetField
				: '';
		const keys = preferred ? [preferred, 'title', 'name'] : ['title', 'name'];
		for (const key of keys) {
			if (!key || key === field.db_fieldName) continue;
			const text = plain(data[key]);
			if (text.trim()) return text;
		}
		return '';
	}

	$effect(() => {
		const next = slugify(sourceText());
		const current = typeof value === 'string' ? value : '';
		if (locked) return;
		if (current && current !== generated) {
			locked = true;
			return;
		}
		if (!next || next === current) return;
		generated = next;
		value = next;
	});

	function onInput(event: Event) {
		locked = true;
		const target = event.currentTarget as HTMLInputElement;
		value = slugifyTyping(target.value);
	}

	function onBlur() {
		if (typeof value !== 'string') return;
		const trimmed = slugify(value);
		if (trimmed !== value) value = trimmed;
	}

	function fillFromTitle() {
		locked = false;
		const next = slugify(sourceText());
		generated = next;
		value = next;
	}

	function toggleLock() {
		if (locked) {
			fillFromTitle();
		} else {
			locked = true;
		}
	}
</script>

<div class="mb-4 flex flex-col gap-1.5">
	<div class="flex items-center justify-between">
		<label for={inputId} class="text-sm font-semibold text-(--admin-text-body)">
			{field.label || 'Slug'}
		</label>
		{#if !locked}
			<span
				class="inline-flex items-center gap-1 rounded border border-success-500/30 bg-success-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-success-500"
			>
				<iconify-icon icon="mdi:link-variant" width="12" aria-hidden="true"></iconify-icon>
				Auto-Linked
			</span>
		{:else}
			<span
				class="inline-flex items-center gap-1 rounded border border-surface-500/30 bg-surface-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-(--admin-text-muted)"
			>
				<iconify-icon icon="mdi:lock-outline" width="12" aria-hidden="true"></iconify-icon>
				Manual
			</span>
		{/if}
	</div>

	<div class="flex items-center gap-2">
		<div class="min-w-0 flex-1">
			<Input
				id={inputId}
				type="text"
				name={field.db_fieldName}
				aria-label={field.label || 'Slug'}
				placeholder={widget_slug_placeholder()}
				value={value ?? ''}
				oninput={onInput}
				onblur={onBlur}
				required={field.required}
				autocomplete="off"
				spellcheck={false}
				data-testid="slug-input"
			/>
		</div>
		<SystemTooltip
			title={!locked
				? 'Auto-linking active. Click to unlock and edit manually.'
				: 'Manual override active. Click to re-link with title/source.'}
		>
			<Button
				type="button"
				variant={!locked ? 'secondary' : 'ghost'}
				class="min-h-10 shrink-0 gap-1.5 px-3!"
				onclick={toggleLock}
				aria-label={!locked ? 'Unlink slug from source' : 'Link slug to source'}
			>
				<iconify-icon
					icon={!locked ? 'mdi:link-variant' : 'mdi:link-variant-off'}
					width="18"
					aria-hidden="true"
				></iconify-icon>
				<span class="hidden sm:inline">{!locked ? 'Linked' : widget_slug_from_title()}</span>
			</Button>
		</SystemTooltip>
	</div>
</div>
