<!--
@file src/components/admin/import-export-manager.svelte
@description Import/Export Manager Component for Admin Dashboard

### Features:
- Export all collections data or individual collections
- Import data with validation and error reporting
- Support for JSON and CSV formats
- Progress tracking and detailed results
- File upload and download handling
-->

<script lang="ts">
	// Types

	import { Progress as ProgressBar } from '@skeletonlabs/skeleton-svelte';
	import Input from '@src/components/system/inputs/input.svelte';
	import Toggles from '@src/components/system/inputs/toggles.svelte';	import type { Schema } from '@src/content/types';
	// Utils
	import { getCollections } from '@utils/api-client';
	import { logger } from '@utils/logger';
	// Skeleton components
	import { showToast } from '@utils/toast';

	interface ExportOptions {
		collections: string[];
		format: 'json' | 'csv';
		includeMetadata: boolean;
		limit?: number;
	}

	interface ImportOptions {
		batchSize: number;
		format: 'json' | 'csv';
		overwrite: boolean;
		skipInvalid: boolean;
		validate: boolean;
	}

	interface ImportResult {
		message: string;
		results: any[];
		success: boolean;
		totalErrors: number;
		totalImported: number;
		totalSkipped: number;
	}

	// --- State using Svelte 5 Runes ---
	let collections = $state<Partial<Schema>[]>([]);
	let loading = $state(false);
	let showExportModal = $state(false);
	let showImportModal = $state(false);
	let showResultsModal = $state(false);

	// Export state
	const exportOptions = $state<ExportOptions>({
		format: 'json',
		collections: [],
		includeMetadata: true,
		limit: undefined
	});
	let exportProgress = $state(0);
	let exportUrl = $state('');
	let exportLimitString = $state('');

	// Import state
	const importOptions = $state<ImportOptions>({
		format: 'json',
		overwrite: false,
		validate: true,
		skipInvalid: true,
		batchSize: 100
	});
	let importFiles = $state<FileList | null>(null);
	let importProgress = $state(0);
	let importResult = $state<ImportResult | null>(null);
	let importBatchSizeString = $state('100');

	// Sync string and number values
	$effect(() => {
		const limitNum = Number.parseInt(exportLimitString, 10);
		exportOptions.limit = Number.isNaN(limitNum) ? undefined : limitNum;
	});

	$effect(() => {
		const batchSizeNum = Number.parseInt(importBatchSizeString, 10);
		importOptions.batchSize = Number.isNaN(batchSizeNum) ? 100 : batchSizeNum;
	});

	// --- Data Loading ---
	loadCollections();

	async function loadCollections() {
		try {
			loading = true;
			const response = await getCollections({ includeFields: false });

			if (response.success && response.data) {
				// Handle different response structures and map to our Collection interface
				let rawCollections: any[] = [];
				if (Array.isArray(response.data)) {
					rawCollections = response.data;
				} else if (response.data && typeof response.data === 'object' && 'collections' in response.data) {
					rawCollections = (response.data as any).collections || [];
				}

				// Map to our Collection interface
				collections = rawCollections.map((col) => ({
					id: col.id || col.name,
					name: col.name,
					label: col.label || col.name,
					description: col.description
				}));

				// Select all collections by default
				exportOptions.collections = collections.map((c) => String(c.id));
			} else {
				showAlertMessage('Failed to load collections', 'error');
			}
		} catch (error) {
			logger.error('Error loading collections:', error);
			showAlertMessage('Error loading collections', 'error');
		} finally {
			loading = false;
		}
	}

	// --- Export Functions ---
	async function exportAllData() {
		try {
			loading = true;
			exportProgress = 0;

			const progressInterval = setInterval(() => {
				exportProgress = Math.min(exportProgress + 10, 90);
			}, 200);

			const response = await fetch('/api/exportData', {
				method: 'GET'
			});

			clearInterval(progressInterval);
			exportProgress = 100;

			if (response.ok) {
				showAlertMessage('Data export completed successfully', 'success');
			} else {
				const error = await response.text();
				showAlertMessage(`Export failed: ${error}`, 'error');
			}
		} catch (error) {
			logger.error('Export error:', error);
			showAlertMessage('Export failed', 'error');
		} finally {
			loading = false;
			exportProgress = 0;
		}
	}

	async function exportSelectedCollections() {
		if (exportOptions.collections.length === 0) {
			showAlertMessage('Please select at least one collection to export', 'warning');
			return;
		}

		try {
			loading = true;
			exportProgress = 0;

			const progressInterval = setInterval(() => {
				exportProgress = Math.min(exportProgress + 10, 90);
			}, 100);

			// Export each collection individually
			const exportData: Record<string, any> = {};

			for (let i = 0; i < exportOptions.collections.length; i++) {
				const collectionId = exportOptions.collections[i];

				const params = new URLSearchParams({
					format: 'json',
					...(exportOptions.limit && { limit: exportOptions.limit.toString() })
				});

				const response = await fetch(`/api/collections/${collectionId}/export?${params}`);

				if (response.ok) {
					const data = await response.json();
					exportData[collectionId] = data.data;
				} else {
					logger.error(`Failed to export collection ${collectionId}`);
				}
			}

			clearInterval(progressInterval);
			exportProgress = 100;

			// Create download
			const blob = new Blob([JSON.stringify(exportData, null, 2)], {
				type: 'application/json'
			});
			exportUrl = URL.createObjectURL(blob);

			showAlertMessage(`Successfully exported ${exportOptions.collections.length} collections`, 'success');
		} catch (error) {
			logger.error('Export error:', error);
			showAlertMessage('Export failed', 'error');
		} finally {
			loading = false;
			exportProgress = 0;
			showExportModal = false;
		}
	}

	// --- Import Functions ---
	async function handleImport() {
		if (!importFiles || importFiles.length === 0) {
			showAlertMessage('Please select a file to import', 'warning');
			return;
		}

		try {
			loading = true;
			importProgress = 0;

			const file = importFiles[0];
			let importData: any = null;

			// Read file content
			if (importOptions.format === 'json') {
				const text = await file.text();
				importData = JSON.parse(text);
			} else {
				// CSV format
				const text = await file.text();
				importData = text;
			}

			const progressInterval = setInterval(() => {
				importProgress = Math.min(importProgress + 5, 90);
			}, 200);

			// Import data
			const response = await fetch('/api/importData', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					collections: importData,
					options: importOptions
				})
			});

			clearInterval(progressInterval);
			importProgress = 100;

			if (response.ok) {
				importResult = await response.json();
				showResultsModal = true;
				showImportModal = false;
			} else {
				const errorText = await response.text();
				showAlertMessage(`Import failed: ${errorText}`, 'error');
			}
		} catch (error) {
			logger.error('Import error:', error);
			showAlertMessage('Import failed', 'error');
		} finally {
			loading = false;
			importProgress = 0;
		}
	}

	// --- UI & Utility Functions ---

	function showAlertMessage(message: string, type: 'success' | 'error' | 'info' | 'warning') {
		showToast(message, type, 5000);
	}

	function downloadExport() {
		if (exportUrl) {
			const a = document.createElement('a');
			a.href = exportUrl;
			a.download = `collections-export-${new Date().toISOString().split('T')[0]}.json`;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(exportUrl);
			exportUrl = '';
		}
	}

	function toggleCollectionSelection(collectionId: string) {
		const index = exportOptions.collections.indexOf(collectionId);
		if (index > -1) {
			exportOptions.collections.splice(index, 1);
		} else {
			exportOptions.collections.push(collectionId);
		}
	}

	function selectAllCollections() {
		exportOptions.collections = collections.map((c) => String(c.id));
	}

	function clearCollectionSelection() {
		exportOptions.collections = [];
	}

	function handleKeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') {
			if (showExportModal) {
				showExportModal = false;
			}
			if (showImportModal) {
				showImportModal = false;
			}
			if (showResultsModal) {
				showResultsModal = false;
			}
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="import-export-manager">
	<div class="mb-6 flex items-center justify-between">
		<div>
			<h2 class="text-2xl font-bold text-gray-900 dark:text-white">Data Import & Export</h2>
			<p class="mt-1 text-gray-600 dark:text-gray-400">Backup and restore your collection data</p>
		</div>

		<div class="flex gap-3">
			<button onclick={() => (showExportModal = true)} class="preset-outlined-secondary-500 btn" disabled={loading}>
				<iconify-icon icon="mdi:export" width={24}></iconify-icon>
				Export Data
			</button>

			<button onclick={() => (showImportModal = true)} class="preset-outlined-primary-500 btn" disabled={loading}>
				<iconify-icon icon="mdi:import" width={24}></iconify-icon>
				Import Data
			</button>
		</div>
	</div>

	<div class="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2">
		<div class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
			<div class="mb-4 flex items-center">
				<div class="preset-filled-tertiary-500 btn-icon mr-3"><iconify-icon icon="mdi:database-export" width={24}></iconify-icon></div>
				<div>
					<h3 class="font-semibold text-gray-900 dark:text-white">Export All Data</h3>
					<p class="text-sm text-gray-600 dark:text-gray-400">Export all collections to file</p>
				</div>
			</div>

			<button onclick={exportAllData} disabled={loading} class="preset-outline-secondary-500 btn mt-4 w-full">Export Everything</button>
		</div>

		<div class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
			<div class="mb-4 flex items-center">
				<div class="preset-filled-primary-500 btn-icon mr-3"><iconify-icon icon="mdi:folder-multiple" width={24}></iconify-icon></div>
				<div>
					<h3 class="font-semibold text-gray-900 dark:text-white">Collections</h3>
					<p class="text-sm text-gray-600 dark:text-gray-400">
						<span class="font-semibold text-tertiary-500 dark:text-primary-500">{collections.length}</span>
						collections available
					</p>
				</div>
			</div>

			<div class="space-y-2">
				{#each collections.slice(0, 3) as collection (collection.id)}
					<div class="flex items-center justify-between text-sm">
						<span class="text-tertiary-500 dark:text-primary-500">{collection.label}</span>
						<iconify-icon icon="mdi:chevron-right" width={24}></iconify-icon>
					</div>
				{/each}
				{#if collections.length > 3}
					<p class="text-xs text-surface-300">...and {collections.length - 3} more</p>
				{/if}
			</div>
		</div>
	</div>

	{#if loading && (exportProgress > 0 || importProgress > 0)}
		<div class="mb-6">
			<div class="mb-2 flex justify-between text-sm">
				<span>{exportProgress > 0 ? 'Exporting...' : 'Importing...'}</span>
				<span>{Math.round(exportProgress || importProgress)}%</span>
			</div>
			<ProgressBar value={exportProgress || importProgress} />
		</div>
	{/if}

	{#if exportUrl}
		<div class="mb-6">
			<div class="alert preset-filled-success-500">
				<div class="flex items-center justify-between">
					<span>Export completed successfully!</span>
					<button onclick={downloadExport}>
						<iconify-icon icon="mdi:download" width={24}></iconify-icon>
						Download
					</button>
				</div>
			</div>
		</div>
	{/if}
</div>

{#if showExportModal}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
		role="dialog"
		aria-modal="true"
		aria-labelledby="export-modal-title"
	>
		<div class="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-lg bg-surface-50 shadow-xl dark:bg-surface-800">
			<div class="flex items-center justify-between border-b p-6">
				<h3 id="export-modal-title" class="text-lg font-semibold">Export Collections</h3>
				<button onclick={() => (showExportModal = false)} class="preset-outlined-surface-500 btn-icon" aria-label="Close export modal">
					<iconify-icon icon="mdi:close" width={24}></iconify-icon>
				</button>
			</div>
			<div class="max-h-[calc(80vh-140px)] space-y-6 overflow-y-auto p-6">
				<div>
					<label for="export-format" class="mb-2 block text-sm font-medium">Export Format</label>
					<select id="export-format" class="select" bind:value={exportOptions.format}>
						<option value="json">JSON</option>
						<option value="csv">CSV</option>
					</select>
				</div>

				<div>
					<div class="mb-3 flex items-center justify-between">
						<p class="block text-sm font-medium">Select Collections</p>
						<div class="space-x-2">
							<button onclick={selectAllCollections} class="preset-outlined-secondary-500 btn">Select All</button>
							<button onclick={clearCollectionSelection} class="preset-outlined-secondary-500 btn">Clear All</button>
						</div>
					</div>

					<div class="max-h-48 overflow-y-auto rounded-md border border-gray-200 p-3 dark:border-gray-700">
						{#each collections as collection (collection.id)}
							{@const inputId = `export-collection-${collection.id}`}
							<label for={inputId} class="flex cursor-pointer items-center space-x-3 py-2">
								<input
									id={inputId}
									type="checkbox"
									checked={exportOptions.collections.includes(String(collection.id))}
									onchange={() => toggleCollectionSelection(String(collection.id))}
									class="rounded"
								/>

								<div class="font-medium">
									{collection.label}

									{#if collection.description}
										<span class="ml-2 text-sm text-gray-500">{collection.description}</span>
									{/if}
								</div>
							</label>
						{/each}
					</div>
				</div>

				<div class="space-y-4">
					<Toggles bind:value={exportOptions.includeMetadata} label="Include Metadata" />
					<div>
						<label for="export-limit" class="mb-2 block text-sm font-medium">Limit (optional)</label>
						<Input type="text" bind:value={exportLimitString} placeholder="Leave empty for all records" />
					</div>
				</div>
			</div>

			<div class="flex justify-end space-x-3 border-t bg-surface-100 p-6 dark:bg-surface-700">
				<button onclick={() => (showExportModal = false)} class="preset-outlined-secondary-500 btn">Cancel</button>
				<button
					onclick={exportSelectedCollections}
					class="preset-filled-primary-500 btn"
					disabled={loading || exportOptions.collections.length === 0}
				>
					Export Selected
				</button>
			</div>
		</div>
	</div>
{/if}

{#if showImportModal}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
		role="dialog"
		aria-modal="true"
		aria-labelledby="import-modal-title"
	>
		<div class="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-lg bg-surface-50 shadow-xl dark:bg-surface-800">
			<div class="flex items-center justify-between border-b p-6">
				<h3 id="import-modal-title" class="text-lg font-semibold">Import Collections</h3>
				<button onclick={() => (showImportModal = false)} class="preset-outlined-surface-500 btn-icon" aria-label="Close import modal">
					<iconify-icon icon="mdi:close" width={24}></iconify-icon>
				</button>
			</div>
			<div class="max-h-[calc(80vh-140px)] space-y-6 overflow-y-auto p-6">
				<div>
					<label for="import-file" class="mb-2 block text-sm font-medium">Select File</label>
					<input
						id="import-file"
						type="file"
						bind:files={importFiles}
						accept=".json,.csv"
						class="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
					/>
					<p class="mt-1 text-xs text-gray-500">Supported formats: JSON, CSV</p>
				</div>

				<div>
					<label for="import-format" class="mb-2 block text-sm font-medium">Data Format</label>
					<select id="import-format" class="select" bind:value={importOptions.format}>
						<option value="json">JSON</option>
						<option value="csv">CSV</option>
					</select>
				</div>

				<div class="space-y-4">
					<Toggles bind:value={importOptions.overwrite} label="Overwrite Existing" />
					<Toggles bind:value={importOptions.validate} label="Validate Data" />
					<Toggles bind:value={importOptions.skipInvalid} label="Skip Invalid Entries" />
					<div>
						<label for="import-batch-size" class="mb-2 block text-sm font-medium">Batch Size</label>
						<Input type="text" bind:value={importBatchSizeString} placeholder="100" />
					</div>
				</div>
			</div>

			<div class="flex justify-end space-x-3 border-t bg-surface-100 p-6 dark:bg-surface-700">
				<button onclick={() => (showImportModal = false)} class="preset-outlined-secondary-500 btn">Cancel</button>
				<button onclick={handleImport} class="preset-filled-primary-500 btn" disabled={loading || !importFiles}>Import Data</button>
			</div>
		</div>
	</div>
{/if}

{#if showResultsModal && importResult}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
		<div class="max-h-[80vh] w-full max-w-4xl overflow-hidden rounded-lg bg-surface-50 shadow-xl dark:bg-surface-800">
			<div class="flex items-center justify-between border-b p-6">
				<h3 class="text-lg font-semibold">Import Results</h3>
				<button onclick={() => (showResultsModal = false)} class="preset-outlined-surface-500 btn-sm">
					<iconify-icon icon="mdi:close" width={24}></iconify-icon>
					mdi:close
				</button>
			</div>
			<div class="max-h-[calc(80vh-140px)] overflow-y-auto p-6">
				<div class="space-y-6">
					<div class="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
						<h3 class="mb-3 font-semibold">Import Summary</h3>
						<div class="grid grid-cols-3 gap-4 text-center">
							<div>
								<div class="text-2xl font-bold text-primary-500">{importResult.totalImported}</div>
								<div class="text-sm text-gray-600">Imported</div>
							</div>
							<div>
								<div class="text-waring-500 text-2xl font-bold">{importResult.totalSkipped}</div>
								<div class="text-sm text-gray-600">Skipped</div>
							</div>
							<div>
								<div class="text-2xl font-bold text-error-500">{importResult.totalErrors}</div>
								<div class="text-sm text-gray-600">Errors</div>
							</div>
						</div>
					</div>

					<div>
						<h3 class="mb-3 font-semibold">Collection Details</h3>
						<div class="max-h-64 space-y-3 overflow-y-auto">
							{#each importResult.results as result (result.collection)}
								<div class="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
									<div class="mb-2 flex items-center justify-between">
										<h4 class="font-medium">{result.collection}</h4>
										<div class="flex space-x-4 text-sm">
											<span class="text-primary-500">+{result.imported}</span>
											<span class="text-waring-500">~{result.skipped}</span>
											<span class="text-error-500">!{result.errors.length}</span>
										</div>
									</div>

									{#if result.errors.length > 0}
										<div class="text-sm">
											<details>
												<summary class="cursor-pointer text-red-600">{result.errors.length} errors</summary>
												<div class="mt-2 space-y-1">
													{#each result.errors.slice(0, 5) as error (error.index)}
														<div class="text-xs text-gray-600">Line {error.index + 1}: {error.error}</div>
													{/each}
													{#if result.errors.length > 5}
														<div class="text-xs text-gray-500">...and {result.errors.length - 5} more errors</div>
													{/if}
												</div>
											</details>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					</div>
				</div>
			</div>

			<div class="flex justify-end border-t bg-surface-100 p-6 dark:bg-surface-700">
				<button onclick={() => (showResultsModal = false)} class="variant-primary">Close</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.import-export-manager {
		max-width: 72rem;
		padding: 1.5rem;
		margin: 0 auto;
	}
</style>
