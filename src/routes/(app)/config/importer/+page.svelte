<script lang="ts">
/**
 * @file src/routes/(app)/config/importer/+page.svelte
 * @description Smart CMS Importer Page for migrating content from external sources.
 */

import { onMount } from "svelte";
import { toast } from "@src/stores/toast.svelte";
import { getCollections } from "@utils/api";
import type { Schema } from "@src/content/types";
import Progress from "@components/ui/progress.svelte";
	import AdminCard from '@components/admin-card.svelte';
	import AdminPageShell from '@components/admin-page-shell.svelte';
	import Button from '@components/ui/button.svelte';
	import Input from '@components/ui/input.svelte';
	import Loader from '@components/ui/loader.svelte';
	import Select from '@components/ui/select.svelte';
	import StickyActions from '@components/ui/sticky-actions.svelte';

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

const sourceTypeOptions = [
	{ value: 'drupal', label: 'Drupal (JSON:API)' },
	{ value: 'wordpress', label: 'WordPress (REST API)' },
];

const transformOptions = [
	{ value: '', label: 'None' },
	{ value: 'media', label: 'Media' },
];

const collectionOptions = $derived(
	collections.map((c) => ({ value: String(c.name), label: String(c.label || c.name) }))
);

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
				dryRun: true,
			}),
		});
		const result = await response.json();
		if (result.success) {
			mapping = result.mapping;
			toast.success("AI suggested field mappings!");
		} else {
			toast.error("Failed to get AI mapping: " + result.message);
		}
	} catch (_err) {
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
				mapping,
			}),
		});
		const result = await response.json();
		if (result.success) {
			importResult = result;
			progress = 100;
			toast.success(`Import complete! ${result.imported} items imported.`);
		} else {
			toast.error("Import failed");
		}
	} catch (_err) {
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
				collectionName: name,
			}),
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
	} catch (_err) {
		toast.error("Error during scaffolding");
	} finally {
		loading = false;
	}
}
</script>

<AdminPageShell
	title="Smart CMS Importer"
	icon="mdi:database-import-outline"
	description="Migrate content from WordPress or Drupal with AI-powered field mapping"
>
	<AdminCard class="border border-surface-200 bg-white p-6 shadow-xs backdrop-blur-md dark:border-surface-800 dark:bg-surface-900/40">
		<div class="mb-6 flex items-center gap-4">
			<div class="flex items-center gap-2 {step >= 1 ? 'font-bold text-tertiary-500 dark:text-primary-500' : ''}">
				<div class="flex h-8 w-8 items-center justify-center rounded-full border-2 border-current">1</div>
				<span>Source</span>
			</div>
			<div class="h-0.5 w-12 bg-surface-300"></div>
			<div class="flex items-center gap-2 {step >= 2 ? 'font-bold text-tertiary-500 dark:text-primary-500' : ''}">
				<div class="flex h-8 w-8 items-center justify-center rounded-full border-2 border-current">2</div>
				<span>Mapping</span>
			</div>
			<div class="h-0.5 w-12 bg-surface-300"></div>
			<div class="flex items-center gap-2 {step >= 3 ? 'font-bold text-tertiary-500 dark:text-primary-500' : ''}">
				<div class="flex h-8 w-8 items-center justify-center rounded-full border-2 border-current">3</div>
				<span>Import</span>
			</div>
		</div>

		{#if step === 1}
			<div class="space-y-6">
				<div class="grid grid-cols-1 gap-6 md:grid-cols-2">
					<Select label="Source Type" bind:value={sourceType} options={sourceTypeOptions} />
					<Input label="Source Site URL" type="url" placeholder="https://drupal-site.com" bind:value={sourceUrl} />
					<Input label="API Key / Secret (Optional)" type="password" placeholder="Bearer Token or Basic Auth" bind:value={apiKey} />
					<Input label="Source Content Type / Bundle" type="text" placeholder="e.g. article, post" bind:value={contentType} />
					<Select
						label="Target SveltyCMS Collection"
						bind:value={targetCollection}
						options={collectionOptions}
						placeholder="Select a collection"
					/>
				</div>
				<div class="mt-6 flex gap-4">
					<StickyActions>
						<Button variant="secondary" onclick={handleScaffold} disabled={!sourceUrl || !contentType || loading} class="flex-1">
							✨ Instant Scaffold (AI)
						</Button>
						<Button variant="tertiary" onclick={nextStep} disabled={!sourceUrl || !contentType || !targetCollection || loading} class="dark: flex-1">
							Next: Map Fields
						</Button>
					</StickyActions>
				</div>
			</div>
		{:else if step === 2}
			<div class="space-y-6">
				<div class="mb-4 flex items-center justify-between">
					<h3 class="text-xl font-semibold">Field Mapping</h3>
					<Button variant="outline" onclick={runAIMapping} disabled={loading}>
						✨ AI Re-Map
					</Button>
				</div>

				{#if loading}
					<div class="flex justify-center py-8">
						<Loader variant="text" lines={2} lastLineWidth="40%" ariaLabel="Generating field mappings" />
					</div>
				{/if}

				<div class="space-y-4">
					<div class="grid grid-cols-12 gap-4 border-b border-surface-200 pb-2 font-bold dark:border-surface-800">
						<div class="col-span-5">Source Field</div>
						<div class="col-span-5">Target Field / Transform</div>
						<div class="col-span-2"></div>
					</div>

					{#each Object.entries(mapping) as [field, value]}
						<div class="grid grid-cols-12 items-center gap-4">
							<div class="col-span-5">
								<Input type="text" value={field} readonly aria-label="Source field name" />
							</div>
							<div class="col-span-5">
								{#if typeof value === 'object'}
									<div class="flex gap-2">
										<Input bind:value={mapping[field].target} aria-label="Target field" class="flex-1" />
										<Select
											bind:value={mapping[field].transform}
											options={transformOptions}
											size="sm"
											class="w-24"
										/>
									</div>
								{:else}
									<Input bind:value={mapping[field]} aria-label="Target field mapping" />
								{/if}
							</div>
							<div class="col-span-2 flex justify-end">
								<Button variant="error" onclick={() => removeMapping(field)} aria-label="Remove mapping" class="p-0! min-w-0">
									<iconify-icon icon="mdi:close"></iconify-icon>
								</Button>
							</div>
						</div>
					{/each}

					<Button variant="outline" onclick={addMapping} class="w-full">+ Add Custom Mapping</Button>
				</div>

				<div class="mt-6 flex justify-between">
					<Button variant="outline" onclick={() => step = 1}>Back</Button>
					<StickyActions>
						<Button variant="tertiary" onclick={nextStep} class="dark:">Start Import</Button>
					</StickyActions>
				</div>
			</div>
		{:else if step === 3}
			<div class="space-y-6 text-center">
				{#if loading}
					<div class="space-y-4 py-12">
						<h3 class="text-2xl">Importing Content...</h3>
						<Progress value={progress} />
						<p>Fetching data and downloading media...</p>
						<Loader variant="text" lines={1} ariaLabel="Import in progress" />
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
						<StickyActions>
							<Button variant="tertiary" onclick={() => step = 1} class="dark:">Start New Import</Button>
						</StickyActions>
					</div>
				{/if}
			</div>
		{/if}
	</AdminCard>
</AdminPageShell>