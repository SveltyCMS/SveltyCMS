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
import { parseJsonSample, parseSqlDDL, type ParsedSchemaResult } from "./ddl-schema-parser";
import Button from "@components/ui/button.svelte";
import Badge from "@components/ui/badge.svelte";

interface Props {
	close?: (result?: { schema: ParsedSchemaResult } | null) => void;
}

const { close }: Props = $props();

let activeTab = $state<"sql" | "json" | "database">("sql");
let sqlInput = $state("");
let jsonInput = $state("");
let jsonCollectionName = $state("Imported Collection");
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
	jsonCollectionName = "Articles";
}

const parseOutcome = $derived.by<{ schema: ParsedSchemaResult | null; error: string | null }>(() => {
	if (activeTab === "sql") {
		if (!sqlInput.trim()) return { schema: null, error: null };
		try {
			return { schema: parseSqlDDL(sqlInput), error: null };
		} catch (err) {
			return { schema: null, error: err instanceof Error ? err.message : "Failed to parse SQL DDL" };
		}
	} else if (activeTab === "json") {
		if (!jsonInput.trim()) return { schema: null, error: null };
		try {
			return { schema: parseJsonSample(jsonInput, jsonCollectionName), error: null };
		} catch (err) {
			return { schema: null, error: err instanceof Error ? err.message : "Failed to parse JSON" };
		}
	}
	return { schema: null, error: null };
});

const parsedResult = $derived(parseOutcome.schema);
const parseError = $derived(parseOutcome.error);

function handleSubmit(e: Event) {
	e.preventDefault();
	if (!parsedResult) return;
	close?.({ schema: parsedResult });
}
</script>

<div class="space-y-4" data-testid="modal-schema-ingestion">
	<!-- Tab Bar -->
	<div class="flex border-b border-surface-500/20 gap-2">
		<button
			type="button"
			data-testid="ingest-tab-sql"
			class="px-4 py-2 text-sm font-semibold border-b-2 transition-colors {activeTab === 'sql' ? 'border-primary-500 text-primary-500' : 'border-transparent text-surface-500 hover:text-surface-600 dark:hover:text-surface-400'}"
			onclick={() => { activeTab = 'sql'; }}
		>
			<div class="flex items-center gap-1.5">
				<iconify-icon icon="mdi:database-arrow-right" width="18"></iconify-icon>
				<span>SQL DDL / Schema</span>
			</div>
		</button>
		<button
			type="button"
			data-testid="ingest-tab-json"
			class="px-4 py-2 text-sm font-semibold border-b-2 transition-colors {activeTab === 'json' ? 'border-primary-500 text-primary-500' : 'border-transparent text-surface-500 hover:text-surface-600 dark:hover:text-surface-400'}"
			onclick={() => { activeTab = 'json'; }}
		>
			<div class="flex items-center gap-1.5">
				<iconify-icon icon="mdi:code-json" width="18"></iconify-icon>
				<span>JSON Sample</span>
			</div>
		</button>
		<button
			type="button"
			data-testid="ingest-tab-database"
			class="px-4 py-2 text-sm font-semibold border-b-2 transition-colors {activeTab === 'database' ? 'border-primary-500 text-primary-500' : 'border-transparent text-surface-500 hover:text-surface-600 dark:hover:text-surface-400'}"
			onclick={() => { activeTab = 'database'; }}
		>
			<div class="flex items-center gap-1.5">
				<iconify-icon icon="mdi:server-network" width="18"></iconify-icon>
				<span>Live Database (SmartImporter)</span>
			</div>
		</button>
	</div>

	<!-- Tab 1: SQL DDL -->
	{#if activeTab === "sql"}
		<div class="space-y-3">
			<div class="flex items-center justify-between">
				<p class="text-xs text-surface-500">
					Paste a PostgreSQL, MySQL, or SQLite <code class="font-mono text-primary-500">CREATE TABLE</code> statement to automatically generate collection fields.
				</p>
				<Button variant="ghost" size="sm" type="button" onclick={loadSqlExample} data-testid="ingest-load-sql-example">
					Load Example
				</Button>
			</div>

			<textarea aria-label="SQL DDL Input"
				bind:value={sqlInput}
				rows="7"
				placeholder="CREATE TABLE products ( id INT PRIMARY KEY, title VARCHAR(255), price DECIMAL(10,2) ... );"
				class="w-full rounded-lg border border-surface-500/30 bg-surface-500/10 p-3 font-mono text-xs text-surface-900 focus:border-primary-500 focus:outline-hidden dark:border-surface-500/40 dark:bg-surface-900 dark:text-surface-100"
				data-testid="ingest-sql-textarea"
			></textarea>
		</div>
	{/if}

	<!-- Tab 2: JSON Sample -->
	{#if activeTab === "json"}
		<div class="space-y-3">
			<div class="flex items-center justify-between">
				<p class="text-xs text-surface-500">
					Paste a sample JSON payload from a REST API or database export to infer types and fields.
				</p>
				<Button variant="ghost" size="sm" type="button" onclick={loadJsonExample} data-testid="ingest-load-json-example">
					Load Example
				</Button>
			</div>

			<div>
				<label class="block mb-1 text-xs font-medium text-surface-600 dark:text-surface-400" for="json-col-name">
					Target Collection Name:
				</label>
				<input aria-label="Target Collection Name"
					id="json-col-name"
					type="text"
					bind:value={jsonCollectionName}
					placeholder="e.g. Products, Articles, Users"
					class="w-full rounded-lg border border-surface-500/30 bg-white px-3 py-1.5 text-sm text-surface-900 focus:border-primary-500 focus:outline-hidden dark:border-surface-500/40 dark:bg-surface-800 dark:text-white"
					data-testid="ingest-json-name-input"
				/>
			</div>

			<textarea aria-label="JSON Sample Input"
				bind:value={jsonInput}
				rows="6"
				placeholder="&#123; &quot;title&quot;: &quot;...&quot;, &quot;price&quot;: 99.99, &quot;published&quot;: true &#125;"
				class="w-full rounded-lg border border-surface-500/30 bg-surface-500/10 p-3 font-mono text-xs text-surface-900 focus:border-primary-500 focus:outline-hidden dark:border-surface-500/40 dark:bg-surface-900 dark:text-surface-100"
				data-testid="ingest-json-textarea"
			></textarea>
		</div>
	{/if}

	<!-- Tab 3: Live Database Introspection via SmartImporter -->
	{#if activeTab === "database"}
		<div class="rounded-xl border border-surface-500/30 bg-surface-500/10 p-4 dark:border-surface-500/40 dark:bg-surface-900/20 space-y-3">
			<div class="flex items-center gap-2">
				<iconify-icon icon="mdi:database-search" width="24" class="text-primary-500"></iconify-icon>
				<h4 class="font-semibold text-sm">Automated Legacy Database Migration & Introspection</h4>
			</div>
			<p class="text-xs text-surface-600 dark:text-surface-400 leading-relaxed">
				SveltyCMS includes an enterprise-grade <strong>SmartImporter</strong> engine capable of connecting directly to existing MySQL, PostgreSQL, SQLite, WordPress, Drupal, or Directus databases. It analyzes foreign key topologies, column types, and data distributions to generate type-safe collections.
			</p>
			<div class="pt-2">
				<Button
					variant="primary"
					size="md"
					href="/config/importer"
					leadingIcon="mdi:rocket-launch"
					onclick={() => close?.(null)}
				>
					Launch SmartImporter Migration Suite
				</Button>
			</div>
		</div>
	{/if}

	<!-- Error state -->
	{#if parseError}
		<div class="rounded-lg border border-error-500/30 bg-error-500/10 p-3 text-xs text-error-600 dark:text-error-400">
			<strong>Error:</strong> {parseError}
		</div>
	{/if}

	<!-- Parsed Preview -->
	{#if parsedResult}
		<div class="rounded-xl border border-surface-500/30 bg-surface-500/10 p-3 dark:border-surface-500/40 dark:bg-surface-900/20 space-y-2">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-2">
					<iconify-icon icon={parsedResult.icon} width="18" class="text-primary-500"></iconify-icon>
					<span class="font-bold text-sm">{parsedResult.name}</span>
					<span class="font-mono text-xs opacity-60">({parsedResult.slug})</span>
				</div>
				<Badge variant="tertiary" size="sm">
					{parsedResult.fields.length} {parsedResult.fields.length === 1 ? 'Field' : 'Fields'} Inferred
				</Badge>
			</div>

			<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto p-1">
				{#each parsedResult.fields as field (field.db_fieldName)}
					<div class="flex items-center justify-between rounded border border-surface-500/20 bg-white px-2.5 py-1.5 text-xs dark:bg-surface-800">
						<span class="font-medium truncate max-w-[120px]">{field.label}</span>
						<div class="flex items-center gap-1">
							<Badge variant="surface" size="sm" class="font-mono text-[10px]">
								{field.widgetKey}
							</Badge>
							{#if field.required}
								<span class="text-error-500 font-bold" title="Required">*</span>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Modal Actions Footer -->
	<footer class="flex justify-end pt-4 border-t border-surface-500/20 gap-2">
		<Button variant="outline" type="button" onclick={() => close?.(null)}>
			Cancel
		</Button>
		{#if activeTab !== "database"}
			<Button
				variant="primary"
				type="button"
				disabled={!parsedResult || parsedResult.fields.length === 0}
				onclick={handleSubmit}
				leadingIcon="mdi:check"
				data-testid="ingest-submit-button"
			>
				Create Collection from Schema
			</Button>
		{/if}
	</footer>
</div>
