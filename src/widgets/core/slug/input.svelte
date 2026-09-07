<!--
@file src/widgets/core/slug/input.svelte
@component
**Slug Widget Input** — URL-safe identifier with live normalization and optional
auto-generation from a source field (usually `title`).

@props
- `field`: Slug field instance (`targetField`, prefix/suffix, required)
- `value`: Bound slug string (or locale record when translated)

Features:
- Live slugify (lowercase, hyphens, a-z0-9)
- Auto-fill from `targetField` until the user edits the slug
- Native Input + admin tokens (no Skeleton remnants)
- Accessible name, required/invalid wiring, generate action
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import Input from '@components/ui/input.svelte';
	import { collectionValue } from '@src/stores/collection-store.svelte';
	import { app, validationStore } from '@src/stores/store.svelte';
	import { slugify } from '@utils/navigation';
	import { getFieldName } from '@utils/schema/field-utils';
	import { handleWidgetValidation } from '@widgets/widget-error-handler';
	import { parse } from 'valibot';
	import type { FieldType } from '.';
	import { createValidationSchema } from '.';

	interface Props {
		field: FieldType;
		value?: string | Record<string, string> | null | undefined;
	}

	let { field, value = $bindable() }: Props = $props();

	const LANGUAGE = $derived(field.translated ? app.contentLanguage : 'en');
	const fieldName = $derived(getFieldName(field));
	const sourceKey = $derived(((field as { targetField?: string }).targetField || 'title').trim());
	const prefix = $derived(String((field as { prefix?: string }).prefix || ''));
	const suffix = $derived(String((field as { suffix?: string }).suffix || ''));

	let userEdited = $state(false);
	let isTouched = $state(false);

	const safeValue = $derived.by(() => {
		if (field.translated && value && typeof value === 'object' && !Array.isArray(value)) {
			return (value as Record<string, string>)[LANGUAGE] || '';
		}
		return typeof value === 'string' ? value : '';
	});

	const validationError = $derived(validationStore.getError(fieldName));
	const shownError = $derived(isTouched || Boolean(safeValue) ? validationError : undefined);
	const validationSchema = $derived(createValidationSchema(field));

	function assignValue(next: string) {
		if (field.translated) {
			const current = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
			value = { ...current, [LANGUAGE]: next };
		} else {
			value = next;
		}
	}

	function readSourceText(): string {
		const raw = (collectionValue.value as Record<string, unknown> | null | undefined)?.[sourceKey];
		if (typeof raw === 'string') return raw;
		if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
			const rec = raw as Record<string, unknown>;
			const hit = rec[app.contentLanguage] ?? rec[Object.keys(rec)[0] ?? ''];
			return typeof hit === 'string' ? hit : '';
		}
		return '';
	}

	function validateSlug(next: string) {
		handleWidgetValidation(() => parse(validationSchema, field.translated ? (value ?? undefined) : next), {
			fieldName,
			updateStore: true,
			requireTouch: false,
			isTouched
		});
	}

	function applySlug(raw: string, fromUser: boolean) {
		const next = slugify(raw);
		if (fromUser) userEdited = true;
		assignValue(next);
		validateSlug(next);
	}

	function handleInput(e: Event & { currentTarget: HTMLInputElement }) {
		applySlug(e.currentTarget.value, true);
	}

	function generateFromSource() {
		userEdited = false;
		applySlug(readSourceText(), false);
	}

	$effect(() => {
		if (userEdited || safeValue) return;
		const source = readSourceText();
		if (!source) return;
		const next = slugify(source);
		if (next) {
			assignValue(next);
			validateSlug(next);
		}
	});
</script>

<div class="slug-widget flex w-full items-stretch gap-2" data-testid="slug-widget">
	<div class="min-w-0 flex-1">
		<Input
			type="text"
			id={field.db_fieldName}
			name={field.db_fieldName}
			value={safeValue}
			oninput={handleInput}
			onblur={() => {
				isTouched = true;
				validateSlug(safeValue);
			}}
			placeholder={(field.placeholder as string) || `${prefix}about-us${suffix}`}
			required={Boolean(field.required)}
			disabled={Boolean(field.disabled || field.readonly)}
			spellcheck={false}
			autocomplete="off"
			inputmode="text"
			title="Lowercase letters, numbers, and hyphens only"
			aria-label={field.label || 'URL slug'}
			aria-invalid={!!shownError}
			aria-required={Boolean(field.required)}
			aria-describedby={`${fieldName}-slug-hint`}
			error={shownError ?? undefined}
			data-testid="slug-input"
		>
			{#snippet pre()}
				<iconify-icon icon="mdi:link-variant" width="16" aria-hidden="true"></iconify-icon>
			{/snippet}
		</Input>
	</div>
	<p id={`${fieldName}-slug-hint`} class="sr-only">
		URL path. Lowercase letters, numbers, and hyphens only. Generate keeps it in sync with {sourceKey}.
	</p>
	{#if sourceKey}
		<Button
			variant="outline"
			type="button"
			size="sm"
			onclick={generateFromSource}
			aria-label="Generate slug from {sourceKey}"
			title="Generate a URL-safe slug from {sourceKey}"
			class="h-10 shrink-0"
		>
			<iconify-icon icon="mdi:auto-fix" width="18" aria-hidden="true"></iconify-icon>
			<span class="max-md:hidden">Generate</span>
		</Button>
	{/if}
</div>
