<!--
@file src/routes/(app)/config/api/visual-query-builder.svelte
@description Interactive Visual Query Builder for REST and GraphQL with live execution and code generation.
@component
@props {Array<{ id: string; name: string; icon?: string }>} collections - Available collections list
-->

<script lang="ts">
	import AdminCard from "@components/admin-card.svelte";
	import Button from "@components/ui/button.svelte";
	import Badge from "@components/ui/badge.svelte";
	import Input from "@components/ui/input.svelte";
	import Select from "@components/ui/select.svelte";
	import { toast } from "@src/stores/toast.svelte.ts";
	import { clientJsonHeaders } from "@utils/security/client-csrf";

	interface Props {
		collections: Array<{ id: string; name: string; icon?: string }>;
	}

	interface FilterRow {
		id: string;
		field: string;
		operator: "eq" | "ne" | "contains" | "gt" | "lt" | "in";
		value: string;
	}

	let { collections }: Props = $props();

	// Active configuration state
	let customCollection = $state<string | null>(null);
	const selectedCollection = $derived(customCollection ?? (collections[0]?.id || "posts"));
	let filters = $state<FilterRow[]>([

		{ id: "1", field: "status", operator: "eq", value: "published" },
	]);
	let sortField = $state<string>("createdAt");
	let sortOrder = $state<"desc" | "asc">("desc");
	let limit = $state<number>(20);
	let skip = $state<number>(0);

	// Execution state
	let isExecuting = $state(false);
	let executeResponse = $state<string | null>(null);
	let executeStatus = $state<number | null>(null);
	let executeDuration = $state<number | null>(null);

	// Generated REST query URL
	const generatedRestUrl = $derived.by(() => {
		const params = new URLSearchParams();
		for (const f of filters) {
			if (f.field.trim() && f.value.trim()) {
				if (f.operator === "eq") {
					params.set(`filter[${f.field}]`, f.value);
				} else {
					params.set(`filter[${f.field}][${f.operator}]`, f.value);
				}
			}
		}
		if (sortField) {
			params.set("sort", `${sortOrder === "desc" ? "-" : ""}${sortField}`);
		}
		if (limit) params.set("limit", String(limit));
		if (skip > 0) params.set("skip", String(skip));

		const query = params.toString();
		return `/api/collections/${selectedCollection}/entries${query ? `?${query}` : ""}`;
	});

	// Generated GraphQL query
	const generatedGraphql = $derived.by(() => {
		const filterArgs = filters
			.filter((f) => f.field.trim() && f.value.trim())
			.map((f) => `${f.field}: { ${f.operator}: "${f.value}" }`)
			.join(", ");

		return `query Get${selectedCollection.charAt(0).toUpperCase() + selectedCollection.slice(1)}Entries {
  ${selectedCollection}(
    filter: { ${filterArgs} }
    sort: { ${sortField}: ${sortOrder.toUpperCase()} }
    limit: ${limit}
    skip: ${skip}
  ) {
    _id
    status
    createdAt
    updatedAt
  }
}`;
	});

	function addFilter() {
		filters = [
			...filters,
			{
				id: Math.random().toString(36).substring(2, 9),
				field: "title",
				operator: "contains",
				value: "",
			},
		];
	}

	function removeFilter(id: string) {
		filters = filters.filter((f) => f.id !== id);
	}

	async function executeQuery() {
		isExecuting = true;
		executeResponse = null;
		executeStatus = null;
		executeDuration = null;
		const t0 = performance.now();

		try {
			const res = await fetch(generatedRestUrl, {
				method: "GET",
				headers: clientJsonHeaders(),
			});
			executeDuration = Math.round(performance.now() - t0);
			executeStatus = res.status;
			const text = await res.text();
			try {
				executeResponse = JSON.stringify(JSON.parse(text), null, 2);
			} catch {
				executeResponse = text;
			}
		} catch (err: unknown) {
			executeDuration = Math.round(performance.now() - t0);
			executeStatus = 500;
			executeResponse = err instanceof Error ? err.message : String(err);
		} finally {
			isExecuting = false;
		}
	}

	function copyToClipboard(text: string, label: string) {
		navigator.clipboard.writeText(text);
		toast.success(`${label} copied to clipboard`);
	}
</script>

<div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
	<!-- Left: Visual Query Builder Panel -->
	<div class="lg:col-span-7 space-y-6">
		<AdminCard>
			<div class="space-y-6">
				<div>
					<h3 class="text-base font-bold text-surface-900 dark:text-surface-100">
						Visual Query Builder
					</h3>
					<p class="text-xs text-surface-600 dark:text-surface-400">
						Configure collection filters, ordering, and pagination to generate reactive queries.
					</p>
				</div>

				<!-- Target Collection -->
				<div class="space-y-1.5">
					<label for="query-collection-select" class="block text-xs font-semibold text-surface-600 dark:text-surface-400">
						Target Collection
					</label>
					<Select
						id="query-collection-select"
						value={selectedCollection}
						options={collections.map((c) => ({ value: c.id, label: `${c.name} (${c.id})` }))}
						onchange={(val: string) => (customCollection = val)}
					/>

				</div>

				<!-- Filters Section -->
				<div class="space-y-3">
					<div class="flex items-center justify-between">
						<span class="text-xs font-bold uppercase tracking-wider text-surface-500">
							Filter Conditions
						</span>
						<Button variant="ghost" size="sm" class="text-xs" onclick={addFilter}>
							<iconify-icon icon="mdi:plus" width="16" class="me-1"></iconify-icon>
							Add Filter
						</Button>
					</div>

					<div class="space-y-2">
						{#each filters as filter (filter.id)}
							<div class="flex flex-wrap sm:flex-nowrap items-center gap-2 p-2.5 rounded-lg bg-surface-500/10 border border-surface-500/30">
								<Input
									bind:value={filter.field}
									placeholder="field (e.g. status)"
									class="text-xs font-mono"
								/>
								<Select
									value={filter.operator}
									options={[
										{ value: "eq", label: "= Equals" },
										{ value: "ne", label: "≠ Not Equals" },
										{ value: "contains", label: "∼ Contains" },
										{ value: "gt", label: "> Greater Than" },
										{ value: "lt", label: "< Less Than" },
										{ value: "in", label: "∈ In List" },
									]}
									onchange={(val: string) => (filter.operator = val as FilterRow["operator"])}
								/>
								<Input
									bind:value={filter.value}
									placeholder="value"
									class="text-xs"
								/>
								<Button
									variant="ghost"
									size="sm"
									class="text-error-500 hover:bg-error-500/10 shrink-0 p-1.5"
									onclick={() => removeFilter(filter.id)}
									aria-label="Remove filter"
								>
									<iconify-icon icon="mdi:trash-can-outline" width="18"></iconify-icon>
								</Button>
							</div>
						{/each}

						{#if filters.length === 0}
							<div class="p-4 text-center rounded-lg border border-dashed border-surface-500/30 text-xs text-surface-500">
								No active filters. All entries in the collection will be queried.
							</div>
						{/if}
					</div>
				</div>

				<!-- Sorting & Pagination -->
				<div class="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-surface-500/20">
					<div class="space-y-1.5">
						<label for="query-sort-field" class="block text-xs font-semibold text-surface-600 dark:text-surface-400">
							Sort Field
						</label>
						<Input id="query-sort-field" bind:value={sortField} class="text-xs font-mono" />
					</div>

					<div class="space-y-1.5">
						<label for="query-sort-order" class="block text-xs font-semibold text-surface-600 dark:text-surface-400">
							Order
						</label>
						<Select
							id="query-sort-order"
							value={sortOrder}
							options={[
								{ value: "desc", label: "Descending (Newest first)" },
								{ value: "asc", label: "Ascending (Oldest first)" },
							]}
							onchange={(val: string) => (sortOrder = val as "desc" | "asc")}
						/>
					</div>

					<div class="space-y-1.5">
						<label for="query-limit-input" class="block text-xs font-semibold text-surface-600 dark:text-surface-400">
							Limit (Max rows)
						</label>
						<Input
							id="query-limit-input"
							type="number"
							bind:value={limit}
							min={1}
							max={100}
							class="text-xs"
						/>
					</div>
				</div>

				<!-- Action Buttons -->
				<div class="flex items-center gap-3 pt-2">
					<Button
						variant="primary"
						disabled={isExecuting}
						onclick={executeQuery}
					>
						{#if isExecuting}
							<iconify-icon icon="mdi:loading" class="animate-spin me-2"></iconify-icon>
							Executing Query...
						{:else}
							<iconify-icon icon="mdi:play" width="18" class="me-1.5"></iconify-icon>
							Run Query Now
						{/if}
					</Button>
					<Button
						variant="outline"
						onclick={() => copyToClipboard(generatedRestUrl, "REST URL")}
					>
						<iconify-icon icon="mdi:content-copy" width="16" class="me-1.5"></iconify-icon>
						Copy REST URL
					</Button>
				</div>
			</div>
		</AdminCard>
	</div>

	<!-- Right: Live Output & Code Generation Panel -->
	<div class="lg:col-span-5 space-y-6">
		<!-- Generated Query Preview -->
		<AdminCard>
			<div class="space-y-4">
				<div class="flex items-center justify-between">
					<h3 class="text-sm font-bold text-surface-900 dark:text-surface-100">
						Generated REST Endpoint
					</h3>
					<Badge variant="tertiary" size="sm">GET</Badge>
				</div>

				<div class="p-3 rounded-lg bg-surface-900 text-xs font-mono text-surface-100 overflow-x-auto break-all">
					{generatedRestUrl}
				</div>

				<div class="flex items-center justify-between pt-2">
					<h3 class="text-sm font-bold text-surface-900 dark:text-surface-100">
						Equivalent GraphQL
					</h3>
					<button
						type="button"
						class="text-xs text-primary-500 hover:underline flex items-center gap-1"
						onclick={() => copyToClipboard(generatedGraphql, "GraphQL Query")}
					>
						<iconify-icon icon="mdi:content-copy" width="14"></iconify-icon>
						Copy
					</button>
				</div>

				<pre class="p-3 rounded-lg bg-surface-900 text-xs font-mono text-surface-100 overflow-x-auto">{generatedGraphql}</pre>
			</div>
		</AdminCard>

		<!-- Live Result Inspector -->
		<AdminCard>
			<div class="space-y-3">
				<div class="flex items-center justify-between">
					<h3 class="text-sm font-bold text-surface-900 dark:text-surface-100">
						Execution Response
					</h3>
					<div class="flex items-center gap-2">
						{#if executeStatus !== null}
							<Badge variant={executeStatus === 200 ? "success" : "error"} size="sm">
								HTTP {executeStatus}
							</Badge>
						{/if}
						{#if executeDuration !== null}
							<Badge variant="surface" size="sm">
								{executeDuration}ms
							</Badge>
						{/if}
						{#if executeResponse}
							<button
								type="button"
								onclick={() => copyToClipboard(executeResponse || "", "Response")}
								class="rounded p-1 text-surface-400 hover:bg-surface-500/10 focus-visible:ring-2 focus-visible:ring-primary-500"
								aria-label="Copy Response JSON"
							>
								<iconify-icon icon="mdi:content-copy" width="16"></iconify-icon>
							</button>
						{/if}
					</div>
				</div>

				<div class="p-3 rounded-lg bg-surface-900 text-xs font-mono text-surface-100 overflow-x-auto max-h-80">
					{#if isExecuting}
						<div class="flex items-center justify-center py-8 text-surface-400">
							<iconify-icon icon="mdi:loading" width="24" class="animate-spin"></iconify-icon>
						</div>
					{:else if executeResponse}
						<pre>{executeResponse}</pre>
					{:else}
						<div class="text-center py-8 text-surface-500 italic">
							Click "Run Query Now" to execute the query against your database.
						</div>
					{/if}
				</div>
			</div>
		</AdminCard>
	</div>
</div>
