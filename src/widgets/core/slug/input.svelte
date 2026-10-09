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
	import { widget_slug_placeholder, widget_slug_from_title } from '@src/paraglide/messages';
	import type { FieldInstance } from '@src/content/types';
	import { collections } from '@src/stores/collection-store.svelte';
	import { locale } from '@src/stores/locale-store.svelte';
	import { validationStore } from '@src/stores/validation-store.svelte';
	import { getFieldName } from '@utils/schema/field-utils';
	import { slugify, slugifyTyping } from './slugify';

	let { field, value = $bindable() }: { field: FieldInstance; value?: string | null } = $props();

	const inputId = $props.id();
	const fieldName = $derived(getFieldName(field));
	const validationError = $derived(validationStore.getError(fieldName));

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
</script>

<div class="mb-4 flex items-end gap-2">
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
			error={validationError || ''}
			required={field.required}
			autocomplete="off"
			spellcheck={false}
			data-testid="slug-input"
		/>
	</div>
	<Button type="button" variant="ghost" class="min-h-10" onclick={fillFromTitle}
		>{widget_slug_from_title()}</Button
	>
</div>
