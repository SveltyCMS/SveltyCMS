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
	import { unwrapLocaleLayers } from '@utils/locale-map';
	import { m } from '@src/paraglide/messages';

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

	const isTitleField = $derived(/^(title|name)$/i.test(fieldName));
	/** Empty title/name cells read "Untitled"; every other empty cell is an en dash. */
	const emptyCell = $derived(isTitleField ? '' : '–');

	/** Sentinel so a stored literal en dash is never mistaken for an empty cell. */
	const EMPTY = Symbol('empty');

	const resolvedValue = $derived.by(() => {
		if (value === null || value === undefined || value === '') return EMPTY;
		// Relation cells need the raw id (or SSR-hydrated { _id, displayField }).
		if (widgetName === 'Relation' || widgetName === 'RelationList') return value;
		const current = unwrapLocaleLayers(value, contentLanguage, {
			// Stop at structured payloads so rich-text/SEO objects aren't flattened.
			stop: (layer) =>
				Boolean(
					layer &&
					typeof layer === 'object' &&
					!Array.isArray(layer) &&
					('title' in layer || 'content' in layer || 'blocks' in layer)
				)
		});
		if (current === null || current === undefined || current === '') return EMPTY;
		return current;
	});

	const displayValue = $derived(resolvedValue === EMPTY ? emptyCell : resolvedValue);
	/** Non-title empty cells render a placeholder; the en dash is decorative. */
	const isEmptyCell = $derived(!isTitleField && resolvedValue === EMPTY);

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

{#if isEmptyCell}
	<span aria-label={m.table_no_value()}><span aria-hidden="true">–</span></span>
{:else if DisplayComponent && !loadFailed}
	{const Component = DisplayComponent}
	<Component
		field={{ db_fieldName: fieldName, label: fieldName, widget: { Name: widgetName } }}
		value={displayValue}
		{compact}
	/>
{:else if isTitleField && displayValue === ''}
	<span class="italic" style="color: var(--admin-text-muted)">Untitled</span>
{:else if typeof displayValue === 'string' || typeof displayValue === 'number'}
	<Sanitize html={String(displayValue)} profile="strict" />
{:else}
	<Sanitize html={String(displayValue ?? '–')} profile="strict" />
{/if}
