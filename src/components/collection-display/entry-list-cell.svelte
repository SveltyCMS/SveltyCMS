<!--
@file src/components/collection-display/entry-list-cell.svelte
@component
**Read-only table cell using the widget Display pillar when available.**

Falls back to Sanitize/string rendering for system fields and legacy values.
-->

<script lang="ts">
	import Sanitize from '@src/utils/sanitize.svelte';
	import { widgets } from '@src/stores/widget-store.svelte';
	import { getCachedWidgetDisplayLoader } from '@widgets/widget-loader-registry';

	interface Props {
		widgetName?: string;
		fieldName: string;
		value: unknown;
		contentLanguage: string;
		compact?: boolean;
	}

	let { widgetName, fieldName, value, contentLanguage, compact = true }: Props = $props();

	let DisplayComponent = $state<any>(null);
	let loadFailed = $state(false);

	const LOCALE_KEY = /^[a-z]{2}(?:-[A-Za-z]{2})?$/;
	const isTitleField = $derived(/^(title|name)$/i.test(fieldName));

	function isLocaleMap(record: Record<string, unknown>): boolean {
		const keys = Object.keys(record);
		return keys.length > 0 && keys.every((key) => LOCALE_KEY.test(key));
	}

	const displayValue = $derived.by(() => {
		if (value === null || value === undefined || value === '') return isTitleField ? '' : '–';
		// Relation cells need the raw id (or SSR-hydrated { _id, displayField }).
		if (widgetName === 'Relation' || widgetName === 'RelationList') return value;
		let current: unknown = value;
		// Unwrap { en: … } maps, including accidental double-wraps from widgets
		// that also key by locale. Stop on structured payloads (SEO, rich text).
		for (let i = 0; i < 4; i++) {
			if (!current || typeof current !== 'object' || Array.isArray(current)) break;
			const record = current as Record<string, unknown>;
			if (!isLocaleMap(record)) return current;
			const langVal = record[contentLanguage];
			if (langVal !== undefined && langVal !== null && langVal !== '') {
				current = langVal;
				continue;
			}
			current = Object.values(record)[0] ?? (isTitleField ? '' : '–');
		}
		return current;
	});

	$effect(() => {
		const name = widgetName;
		const ready = widgets.isLoaded;
		if (!name) return;
		if (!ready) return;

		let cancelled = false;
		loadFailed = false;
		const loader = getCachedWidgetDisplayLoader(name, widgets.widgetFunctions);
		if (!loader) {
			loadFailed = true;
			return;
		}
		loader()
			.then((mod) => {
				if (!cancelled) DisplayComponent = mod.default;
			})
			.catch(() => {
				if (!cancelled) loadFailed = true;
			});
		return () => {
			cancelled = true;
		};
	});
</script>

{#if DisplayComponent && !loadFailed}
	{const Component = DisplayComponent}
	<Component
		field={{ db_fieldName: fieldName, label: fieldName, widget: { Name: widgetName } }}
		value={displayValue}
		{compact}
	/>
{:else if isTitleField && (displayValue === '' || displayValue === '–')}
	<span class="italic" style="color: var(--admin-text-muted)">Untitled</span>
{:else if typeof displayValue === 'string' || typeof displayValue === 'number'}
	<Sanitize html={String(displayValue)} profile="strict" />
{:else}
	<Sanitize html={String(displayValue ?? '–')} profile="strict" />
{/if}