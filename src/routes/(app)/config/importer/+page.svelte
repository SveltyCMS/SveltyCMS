<script lang="ts">
	/**
	 * @file src/routes/(app)/config/importer/+page.svelte
	 * @description Smart CMS Importer Page for migrating content from external sources.
	 */

	import { onMount } from "svelte";
	import { toast } from "@src/stores/toast.svelte";
	import { getCollections } from "@utils/api";
	import type { Schema } from "@src/content/types";

	let loading = $state(false);
	let collections = $state<Schema[]>([]);
	let sourceType = $state("drupal");
	let sourceUrl = $state("");
	let apiKey = $state("");
	let contentType = $state("");
	let targetCollection = $state("");
	let mapping = $state<Record<string, any>>({});
	let step = $state(1);
	let importResult = $state<any>(null);
	let progress = $state(0);

	const safeProgress = $derived(Math.min(Math.max(progress, 0), 100));

	onMount(async () => {
		const response = await getCollections({ includeFields: true });
		if (response.success && response.data) {
			collections = (response.data as any).collections || response.data;
		}
	});

	async function nextStep() {
		if (step === 1) {
			if (!sourceUrl || !contentType || !targetCollection) {
				toast.error("Please fill in all required fields");
				return;
			}
			step = 2;
			await runAIMapping();
		} else if (step === 2) {
			step = 3;
			await startImport();
		}
	}

	async function runAIMapping() {
		try {
			loading = true;
			const response = await fetch("/api/importer/external", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					sourceType,
					sourceUrl,
					apiKey,
					contentType,
					targetCollection,
					dryRun: true
				})
			});

			const result = await response.json();

			if (result.success) {
				mapping = result.mapping;
				toast.success("AI suggested field mappings!");
			} else {
				toast.error("Failed to get AI mapping: " + result.message);
			}
		} catch (err) {
			toast.error("Error connecting to AI service");
		} finally {
			loading = false;
		}
	}

	async function startImport() {
		try {
			loading = true;
			progress = 10;

			const response = await fetch("/api/importer/external", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					sourceType,
					sourceUrl,
					apiKey,
					contentType,
					targetCollection,
					mapping
				})
			});

			const result = await response.json();

			if (result.success) {
				importResult = result;
				progress = 100;
				toast.success(`Import complete! ${result.imported} items imported.`);
			} else {
				toast.error("Import failed");
			}
		} catch (err) {
			toast.error("Connection error during import");
		} finally {
			loading = false;
		}
	}

	function addMapping() {
		mapping = { ...mapping, "": "" };
	}

	function removeMapping(field: string) {
		const newMapping = { ...mapping };
		delete newMapping[field];
		mapping = newMapping;
	}

	async function handleScaffold() {
		try {
			loading = true;
			const name = prompt("Enter a name for the new collection:", contentType);
			if (!name) return;

			const response = await fetch("/api/importer/scaffold", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					sourceType,
					sourceUrl,
					apiKey,
					sourceTypeIdentifier: contentType,
					collectionName: name
				})
			});

			const result = await response.json();

			if (result.success) {
				toast.success(result.message);

				const collRes = await getCollections({ includeFields: true });
				if (collRes.success && collRes.data) {
					collections = (collRes.data as any).collections || collRes.data;
					targetCollection = result.slug;
				}
			} else {
				toast.error("Scaffold failed: " + result.message);
			}
		} catch (err) {
			toast.error("Error during scaffolding");
		} finally {
			loading = false;
		}
	}
</script>

<div class="container mx-auto max-w-4xl p-6">
	<div class="mb-8">
		<h1 class="mb-2 text-3xl font-bold">Smart CMS Importer</h1>
		<p class="text-surface-600 dark:text-surface-400">Migrate content from WordPress or Drupal with AI-powered field mapping.</p>
	</div>

	<div class="mb-8 flex items-center gap-4">
		<div class="flex items-center gap-2 {step >= 1 ? 'font-bold text-primary-500' : ''}">
			<div class="flex h-8 w-8 items-center justify-center rounded-full border-2 border-current">1</div>
			<span>Source</span>
		</div>
		<div class="h-0.5 w-12 bg-surface-300"></div>
		<div class="flex items-center gap-2 {step >= 2 ? 'font-bold text-primary-500' : ''}">
			<div class="flex h-8 w-8 items-center justify-center rounded-full border-2 border-current">2</div>
			<span>Mapping</span>
		</div>
		<div class="h-0.5 w-12 bg-surface-300"></div>
		<div class="flex items-center gap-2 {step >= 3 ? 'font-bold text-primary-500' : ''}">
			<div class="flex h-8 w-8 items-center justify-center rounded-full border-2 border-current">3</div>
			<span>Import</span>
		</div>
	</div>

	{#if step === 1}
		<div class="card space-y-6 bg-surface-50 p-6 dark:bg-surface-800">
			<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
				<label class="label">
					<span>Source Type</span>
					<select class="select" bind:value={sourceType}>
						<option value="drupal">Drupal (JSON:API)</option>
						<option value="wordpress">WordPress (REST API)</option>
					</select>
				</label>

				<label class="label">
					<span>Source Site URL</span>
					<input type="url" class="input" placeholder="https://drupal-site.com" bind:value={sourceUrl} />
				</label>

				<label class="label">
					<span>API Key / Secret (Optional)</span>
					<input type="password" class="input" placeholder="Bearer Token or Basic Auth" bind:value={apiKey} />
				</label>

				<label class="label">
					<span>Source Content Type / Bundle</span>
					<input type="text" class="input" placeholder="e.g. article, post" bind:value={contentType} />
				</label>

				<label class="label">
					<span>Target SveltyCMS Collection</span>
					<select class="select" bind:value={targetCollection}>
						<option value="">Select a collection</option>
						{#each collections as collection}
							<option value={collection.name}>{collection.label || collection.name}</option>
						{/each}
					</select>
				</label>
			</div>

			<div class="mt-6 flex gap-4">
				<button class="btn preset-filled-secondary-500 flex-1" onclick={handleScaffold} disabled={!sourceUrl || !contentType || loading}>
					✨ Instant Scaffold (AI)
				</button>

				<button class="btn preset-filled-primary-500 flex-1" onclick={nextStep} disabled={!sourceUrl || !contentType || !targetCollection || loading}>
					Next: Map Fields
				</button>
			</div>
		</div>
	{:else if step === 2}
		<div class="card space-y-6 bg-surface-50 p-6 dark:bg-surface-800">
			<div class="mb-4 flex items-center justify-between">
				<h3 class="text-xl font-semibold">Field Mapping</h3>
				<button class="btn preset-outlined-secondary-500" onclick={runAIMapping} disabled={loading}>✨ AI Re-Map</button>
			</div>

			<div class="space-y-4">
				<div class="grid grid-cols-12 gap-4 border-b pb-2 font-bold">
					<div class="col-span-5">Source Field</div>
					<div class="col-span-5">Target Field / Transform</div>
					<div class="col-span-2"></div>
				</div>

				{#each Object.entries(mapping) as [field, value]}
					<div class="grid grid-cols-12 items-center gap-4">
						<div class="col-span-5">
							<input type="text" class="input" value={field} readonly />
						</div>

						<div class="col-span-5">
							{#if typeof value === "object"}
								<div class="flex gap-2">
									<input type="text" class="input" bind:value={mapping[field].target} />
									<select class="select w-24" bind:value={mapping[field].transform}>
										<option value="">None</option>
										<option value="media">Media</option>
									</select>
								</div>
							{:else}
								<input type="text" class="input" bind:value={mapping[field]} />
							{/if}
						</div>

						<div class="col-span-2 flex justify-end">
							<button class="btn-icon preset-outlined-error-500" onclick={() => removeMapping(field)} aria-label="Remove mapping">
								<iconify-icon icon="mdi:close"></iconify-icon>
							</button>
						</div>
					</div>
				{/each}

				<button class="btn preset-outlined-surface-500 w-full" onclick={addMapping}>+ Add Custom Mapping</button>
			</div>

			<div class="mt-6 flex justify-between">
				<button class="btn preset-outlined-surface-500" onclick={() => (step = 1)}>Back</button>
				<button class="btn preset-filled-primary-500" onclick={nextStep}>Start Import</button>
			</div>
		</div>
	{:else if step === 3}
		<div class="card space-y-6 bg-surface-50 p-6 text-center dark:bg-surface-800">
			{#if loading}
				<div class="space-y-4 py-12">
					<h3 class="text-2xl">Importing Content...</h3>

					<div
						class="h-2 w-full overflow-hidden rounded-full bg-surface-200 dark:bg-surface-700"
						role="progressbar"
						aria-valuemin="0"
						aria-valuemax="100"
						aria-valuenow={Math.round(safeProgress)}
						aria-label="Import progress"
					>
						<div class="h-full rounded-full bg-primary-500 transition-[width] duration-300" style={`width: ${safeProgress}%`}></div>
					</div>

					<p>Fetching data and downloading media...</p>
				</div>
			{:else if importResult}
				<div class="space-y-6 py-12">
					<div class="text-5xl text-success-500">✅</div>
					<h3 class="text-2xl font-bold">Import Completed!</h3>

					<div class="mx-auto grid max-w-md grid-cols-3 gap-4">
						<div class="card bg-surface-100 p-4 dark:bg-surface-700">
							<div class="text-2xl font-bold">{importResult.imported}</div>
							<div class="text-sm opacity-60">Imported</div>
						</div>

						<div class="card bg-surface-100 p-4 dark:bg-surface-700">
							<div class="text-2xl font-bold">{importResult.errors}</div>
							<div class="text-sm opacity-60">Errors</div>
						</div>

						<div class="card bg-surface-100 p-4 dark:bg-surface-700">
							<div class="text-2xl font-bold">{importResult.total}</div>
							<div class="text-sm opacity-60">Total Items</div>
						</div>
					</div>

					<button class="btn preset-filled-primary-500" onclick={() => (step = 1)}>Start New Import</button>
				</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.card {
		border-radius: 0.5rem;
		border: 1px solid rgba(128, 128, 128, 0.2);
	}
</style>