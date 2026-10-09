<!--
@file src/routes/(app)/config/collectionbuilder/nested-content/modal-schema-ingestion.svelte
@component
**Schema Ingestion & Database Introspection Modal**

Features:
- Reverse-engineers SQL CREATE TABLE statements into SveltyCMS collections and widgets
- Ingests JSON sample payloads from REST APIs or external sources
- Provides 1-click test examples for rapid prototyping
- Direct link to launch SmartImporter for full live database migrations
- Adheres to WCAG 2.2 AA and status-shade design tokens
-->
<script lang="ts">
	import type { ParsedSchemaResult, SchemaIngestionMode } from '../schema-ingestion';
	import {
		builder_ingest_create_collection,
		builder_ingest_create_table,
		builder_ingest_ddl_aria,
		builder_ingest_ddl_hint_part1,
		builder_ingest_ddl_hint_part2,
		builder_ingest_ddl_placeholder,
		builder_ingest_ddl_tab,
		builder_ingest_error_label,
		builder_ingest_fields_inferred,
		builder_ingest_field_inferred,
		builder_ingest_intro_part1,
		builder_ingest_intro_part2,
		builder_ingest_json_hint,
		builder_ingest_json_name_aria,
		builder_ingest_json_name_label,
		builder_ingest_json_name_placeholder,
		builder_ingest_json_placeholder,
		builder_ingest_json_aria,
		builder_ingest_json_tab,
		builder_ingest_launch_suite,
		builder_ingest_live_tab,
		builder_ingest_load_example,
		builder_ingest_smart_heading,
		builder_ingest_smart_intro,
		builder_required,
		button_cancel
	} from '@src/paraglide/messages';
	import Button from '@components/ui/button.svelte';
	import Badge from '@components/ui/badge.svelte';

	interface Props {
		close?: (result?: { schema: ParsedSchemaResult } | null) => void;
	}

	const { close }: Props = $props();

	let activeTab = $state<'sql' | 'json' | 'database'>('sql');
	let sqlInput = $state('');
	let jsonInput = $state('');
	let jsonCollectionName = $state('Imported Collection');
	const SQL_EXAMPLE = `CREATE TABLE products (
  id INT PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  description TEXT,
  in_stock BOOLEAN DEFAULT true,
  category_id INT REFERENCES categories(id),
  created_at TIMESTAMP
);`;

	const JSON_EXAMPLE = `{
  "title": "Getting Started with Headless CMS",
  "author": "Jane Developer",
  "price": 49.99,
  "published": true,
  "tags": ["cms", "svelte", "typescript"],
  "created_at": "2026-09-01T10:00:00Z"
}`;

	function loadSqlExample() {
		sqlInput = SQL_EXAMPLE;
	}

	function loadJsonExample() {
		jsonInput = JSON_EXAMPLE;
		jsonCollectionName = 'Articles';
	}

	let parsedResult = $state<ParsedSchemaResult | null>(null);
	let parseError = $state<string | null>(null);
	let isParsing = $state(false);

	// Server-side inference, debounced. Parsing runs in the `ingestSchema` remote
	// function (a SvelteKit server function) so relation targets resolve against
	// the live collection list — something a purely client-side parse cannot do.
	$effect(() => {
		const tab = activeTab;
		const payload = tab === 'sql' ? sqlInput : jsonInput;
		const collectionName = jsonCollectionName;

		if (tab === 'database' || !payload.trim()) {
			parsedResult = null;
			parseError = null;
			isParsing = false;
			return;
		}

		let cancelled = false;
		isParsing = true;

		const handle = setTimeout(async () => {
			try {
				// Lazy import keeps collectionbuilder.remote a split chunk — the other
				// consumers (+page, modal-category, modal-quick-start) import it
				// dynamically too (vite INEFFECTIVE_DYNAMIC_IMPORT parity).
				const { ingestSchema } =
					await import('@src/routes/(app)/config/collectionbuilder/collectionbuilder.remote');
				const result = await ingestSchema({
					mode: tab as SchemaIngestionMode,
					payload,
					collectionName
				});
				if (cancelled) return;
				parsedResult = result.schema;
				parseError = result.error;
			} catch (err) {
				if (cancelled) return;
				parsedResult = null;
				parseError = err instanceof Error ? err.message : 'Failed to parse schema';
			} finally {
				if (!cancelled) isParsing = false;
			}
		}, 300);

		return () => {
			cancelled = true;
			clearTimeout(handle);
		};
	});

	function handleSubmit(e: Event) {
		e.preventDefault();
		if (!parsedResult) return;
		close?.({ schema: parsedResult });
	}
</script>

<div class="space-y-4" data-testid="modal-schema-ingestion">
	<p class="text-sm text-surface-600 dark:text-surface-400 leading-relaxed">
		{builder_ingest_intro_part1()}{' '}
		<code class="font-mono text-tertiary-600 dark:text-primary-500"
			>{builder_ingest_create_table()}</code
		>{' '}
		{builder_ingest_intro_part2()}
	</p>

	<!-- Tab Bar -->
	<div class="flex border-b border-surface-500/20 gap-2">
		<button
			type="button"
			data-testid="ingest-tab-sql"
			class="px-4 py-2 text-sm font-semibold border-b-2 transition-colors {activeTab === 'sql'
				? 'border-tertiary-500 text-tertiary-600 dark:border-primary-500 dark:text-primary-500'
				: 'border-transparent text-surface-500 hover:text-surface-600 dark:hover:text-surface-400'}"
			onclick={() => {
				activeTab = 'sql';
			}}
		>
			<div class="flex items-center gap-1.5">
				<iconify-icon icon="mdi:database-arrow-right" width="18"></iconify-icon>
				<span>{builder_ingest_ddl_tab()}</span>
			</div>
		</button>
		<button
			type="button"
			data-testid="ingest-tab-json"
			class="px-4 py-2 text-sm font-semibold border-b-2 transition-colors {activeTab === 'json'
				? 'border-tertiary-500 text-tertiary-600 dark:border-primary-500 dark:text-primary-500'
				: 'border-transparent text-surface-500 hover:text-surface-600 dark:hover:text-surface-400'}"
			onclick={() => {
				activeTab = 'json';
			}}
		>
			<div class="flex items-center gap-1.5">
				<iconify-icon icon="mdi:code-json" width="18"></iconify-icon>
				<span>{builder_ingest_json_tab()}</span>
			</div>
		</button>
		<button
			type="button"
			data-testid="ingest-tab-database"
			class="px-4 py-2 text-sm font-semibold border-b-2 transition-colors {activeTab === 'database'
				? 'border-tertiary-500 text-tertiary-600 dark:border-primary-500 dark:text-primary-500'
				: 'border-transparent text-surface-500 hover:text-surface-600 dark:hover:text-surface-400'}"
			onclick={() => {
				activeTab = 'database';
			}}
		>
			<div class="flex items-center gap-1.5">
				<iconify-icon icon="mdi:server-network" width="18"></iconify-icon>
				<span>{builder_ingest_live_tab()}</span>
			</div>
		</button>
	</div>

	<!-- Tab 1: SQL DDL -->
	{#if activeTab === 'sql'}
		<div class="space-y-3">
			<div class="flex items-center justify-between">
				<p class="text-xs text-surface-500">
					{builder_ingest_ddl_hint_part1()}{' '}<code
						class="font-mono text-tertiary-600 dark:text-primary-500"
						>{builder_ingest_create_table()}</code
					>{' '}{builder_ingest_ddl_hint_part2()}
				</p>
				<Button
					variant="ghost"
					size="sm"
					type="button"
					onclick={loadSqlExample}
					data-testid="ingest-load-sql-example"
				>
					{builder_ingest_load_example()}
				</Button>
			</div>

			<textarea
				aria-label={builder_ingest_ddl_aria()}
				bind:value={sqlInput}
				rows="7"
				placeholder={builder_ingest_ddl_placeholder()}
				class="w-full rounded-lg border border-surface-500/30 bg-surface-500/10 p-3 font-mono text-xs text-surface-900 focus:border-tertiary-500 dark:focus:border-primary-500 focus:outline-hidden dark:border-surface-500/40 dark:bg-surface-900 dark:text-surface-100"
				data-testid="ingest-sql-textarea"></textarea>
		</div>
	{/if}

	<!-- Tab 2: JSON Sample -->
	{#if activeTab === 'json'}
		<div class="space-y-3">
			<div class="flex items-center justify-between">
				<p class="text-xs text-surface-500">
					{builder_ingest_json_hint()}
				</p>
				<Button
					variant="ghost"
					size="sm"
					type="button"
					onclick={loadJsonExample}
					data-testid="ingest-load-json-example"
				>
					{builder_ingest_load_example()}
				</Button>
			</div>

			<div>
				<label
					class="block mb-1 text-xs font-medium text-surface-600 dark:text-surface-400"
					for="json-col-name"
				>
					{builder_ingest_json_name_label()}
				</label>
				<input
					aria-label={builder_ingest_json_name_aria()}
					id="json-col-name"
					type="text"
					bind:value={jsonCollectionName}
					placeholder={builder_ingest_json_name_placeholder()}
					class="w-full rounded-lg border border-surface-500/30 bg-white px-3 py-1.5 text-sm text-surface-900 focus:border-tertiary-500 dark:focus:border-primary-500 focus:outline-hidden dark:border-surface-500/40 dark:bg-surface-800 dark:text-white"
					data-testid="ingest-json-name-input"
				/>
			</div>

			<textarea
				aria-label={builder_ingest_json_aria()}
				bind:value={jsonInput}
				rows="6"
				placeholder={builder_ingest_json_placeholder()}
				class="w-full rounded-lg border border-surface-500/30 bg-surface-500/10 p-3 font-mono text-xs text-surface-900 focus:border-tertiary-500 dark:focus:border-primary-500 focus:outline-hidden dark:border-surface-500/40 dark:bg-surface-900 dark:text-surface-100"
				data-testid="ingest-json-textarea"></textarea>
		</div>
	{/if}

	<!-- Tab 3: Live Database Introspection via SmartImporter -->
	{#if activeTab === 'database'}
		<div
			class="rounded-xl border border-surface-500/30 bg-surface-500/10 p-4 dark:border-surface-500/40 dark:bg-surface-900/20 space-y-3"
		>
			<div class="flex items-center gap-2">
				<iconify-icon
					icon="mdi:database-search"
					width="24"
					class="text-tertiary-500 dark:text-primary-500"
				></iconify-icon>
				<h4 class="font-semibold text-sm">{builder_ingest_smart_heading()}</h4>
			</div>
			<p class="text-xs text-surface-600 dark:text-surface-400 leading-relaxed">
				{builder_ingest_smart_intro()}
			</p>
			<div class="pt-2">
				<Button
					variant="tertiary"
					class="dark:preset-filled-primary-500"
					size="md"
					href="/config/importer"
					leadingIcon="mdi:rocket-launch"
					onclick={() => close?.(null)}
				>
					{builder_ingest_launch_suite()}
				</Button>
			</div>
		</div>
	{/if}

	<!-- Error state -->
	{#if parseError}
		<div
			class="rounded-lg border border-error-500/30 bg-error-500/10 p-3 text-xs text-error-600 dark:text-error-400"
		>
			<strong>{builder_ingest_error_label()}</strong>
			{parseError}
		</div>
	{/if}

	<!-- Parsed Preview -->
	{#if parsedResult}
		<div
			class="rounded-xl border border-surface-500/30 bg-surface-500/10 p-3 dark:border-surface-500/40 dark:bg-surface-900/20 space-y-2"
		>
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-2">
					<iconify-icon
						icon={parsedResult.icon}
						width="18"
						class="text-tertiary-500 dark:text-primary-500"
					></iconify-icon>
					<span class="font-bold text-sm">{parsedResult.name}</span>
					<span class="font-mono text-xs opacity-60">({parsedResult.slug})</span>
				</div>
				<Badge variant="tertiary" size="sm">
					{parsedResult.fields.length}
					{parsedResult.fields.length === 1
						? builder_ingest_field_inferred()
						: builder_ingest_fields_inferred()}
				</Badge>
			</div>

			<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto p-1">
				{#each parsedResult.fields as field (field.db_fieldName)}
					<div
						class="flex items-center justify-between rounded border border-surface-500/20 bg-white px-2.5 py-1.5 text-xs dark:bg-surface-800"
					>
						<span class="font-medium truncate max-w-30">{field.label}</span>
						<div class="flex items-center gap-1">
							<Badge variant="surface" size="sm" class="font-mono text-[10px]">
								{field.widgetKey}
							</Badge>
							{#if field.required}
								<span class="text-error-500 font-bold" title={builder_required()}>*</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Modal Actions Footer -->
	<footer class="flex justify-end pt-4 border-t border-surface-500/20 gap-2">
		<Button variant="outline" type="button" onclick={() => close?.(null)}>{button_cancel()}</Button>
		{#if activeTab !== 'database'}
			<Button
				variant="tertiary"
				class="dark:preset-filled-primary-500"
				type="button"
				disabled={isParsing || !parsedResult || parsedResult.fields.length === 0}
				onclick={handleSubmit}
				leadingIcon={isParsing ? 'mdi:loading' : 'mdi:check'}
				data-testid="ingest-submit-button"
			>
				{builder_ingest_create_collection()}
			</Button>
		{/if}
	</footer>
</div>
