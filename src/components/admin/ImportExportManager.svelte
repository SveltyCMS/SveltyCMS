<!--
@file src/components/admin/ImportExportManager.svelte
@description Import/Export Manager Component for Admin Dashboard
@features
- Export all collections data or individual collections
- Import data with validation and error reporting
- Support for JSON and CSV formats
- Progress tracking and detailed results
- File upload and download handling
-->

<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';

	// Icons
	import Icon from '@iconify/svelte';

	// Components
	import Button from '@components/system/buttons/Button.svelte';
	import Input from '@components/system/inputs/Input.svelte';
	import Toggles from '@components/system/inputs/Toggles.svelte';
	import ProgressBar from '@components/system/ProgressBar.svelte';

	// Skeleton components
	import { getModalStore, getToastStore } from '@skeletonlabs/skeleton';

	// Utils
	import { logger } from '@utils/logger.svelte';
	import { getCollections } from '@utils/apiClient';

	// Types
	interface Collection {
		id: string;
		name: string;
		label: string;
		description?: string;
	}

	interface ExportOptions {
		format: 'json' | 'csv';
		collections: string[];
		includeMetadata: boolean;
		limit?: number;
	}

	interface ImportOptions {
		format: 'json' | 'csv';
		overwrite: boolean;
		validate: boolean;
		skipInvalid: boolean;
		batchSize: number;
	}

	interface ImportResult {
		success: boolean;
		message: string;
		totalImported: number;
		totalSkipped: number;
		totalErrors: number;
		results: Array<{
			collection: string;
			imported: number;
			skipped: number;
			errors: Array<{ index: number; error: string }>;
		}>;
	}

	// State
	let collections: Collection[] = [];
	let loading = false;
	let showExportModal = false;
	let showImportModal = false;
	let showResultsModal = false;

	// Export state
	let exportOptions: ExportOptions = {
		format: 'json',
		collections: [],
		includeMetadata: true,
		limit: undefined
	};
	let exportProgress = 0;
	let exportUrl = '';

	// Import state
	let importOptions: ImportOptions = {
		format: 'json',
		overwrite: false,
		validate: true,
		skipInvalid: true,
		batchSize: 100
	};
	let importFiles: FileList | null = null;
	let importProgress = 0;
	let importResult: ImportResult | null = null;

	onMount(async () => {
		await loadCollections();
	});

	async function loadCollections() {
		try {
			loading = true;
			const response = await getCollections({ includeFields: false });

			if (response.success && response.data) {
				collections = response.data.collections || [];
				// Select all collections by default
				exportOptions.collections = collections.map((c) => c.id);
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

	// Export Functions
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
			const exportData = {};

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

	// Import Functions
	async function handleImport() {
		if (!importFiles || importFiles.length === 0) {
			showAlertMessage('Please select a file to import', 'warning');
			return;
		}

		try {
			loading = true;
			importProgress = 0;

			const file = importFiles[0];
			let importData;

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

	// Toast store
	const toastStore = getToastStore();

	function showAlertMessage(message: string, type: 'success' | 'error' | 'info' | 'warning') {
		// Show as toast
		const background =
			type === 'success'
				? 'variant-filled-success'
				: type === 'error'
					? 'variant-filled-error'
					: type === 'warning'
						? 'variant-filled-warning'
						: 'variant-filled-secondary';

		toastStore.trigger({
			message,
			background,
			timeout: 5000
		});
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
		if (exportOptions.collections.includes(collectionId)) {
			exportOptions.collections = exportOptions.collections.filter((id) => id !== collectionId);
		} else {
			exportOptions.collections = [...exportOptions.collections, collectionId];
		}
	}

	function selectAllCollections() {
		exportOptions.collections = collections.map((c) => c.id);
	}

	function clearCollectionSelection() {
		exportOptions.collections = [];
	}
</script>

<div class="import-export-manager">
	<!-- Header -->
	<div class="mb-6 flex items-center justify-between">
		<div>
			<h2 class="text-2xl font-bold text-gray-900 dark:text-white">Data Import & Export</h2>
			<p class="mt-1 text-gray-600 dark:text-gray-400">Backup and restore your collection data</p>
		</div>

		<div class="flex gap-3">
			<Button on:click={() => (showExportModal = true)} variant="secondary" disabled={loading}>
				<Icon icon="mdi:export" class="mr-2 h-4 w-4" />
				Export Data
			</Button>

			<Button on:click={() => (showImportModal = true)} variant="primary" disabled={loading}>
				<Icon icon="mdi:import" class="mr-2 h-4 w-4" />
				Import Data
			</Button>
		</div>
	</div>

	<!-- Quick Actions -->
	<div class="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2">
		<!-- Export All Data -->
		<div class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
			<div class="mb-4 flex items-center">
				<div class="mr-3 rounded-lg bg-blue-100 p-2 dark:bg-blue-900">
					<Icon icon="mdi:database-export" class="h-6 w-6 text-blue-600 dark:text-blue-400" />
				</div>
				<div>
					<h3 class="font-semibold text-gray-900 dark:text-white">Export All Data</h3>
					<p class="text-sm text-gray-600 dark:text-gray-400">Export all collections to file</p>
				</div>
			</div>

			<Button on:click={exportAllData} variant="outline" disabled={loading} class="w-full">Export Everything</Button>
		</div>

		<!-- Collections Overview -->
		<div class="rounded-lg border border-gray-200 bg-white p-6 dark:border-gray-700 dark:bg-gray-800">
			<div class="mb-4 flex items-center">
				<div class="mr-3 rounded-lg bg-green-100 p-2 dark:bg-green-900">
					<Icon icon="mdi:folder-multiple" class="h-6 w-6 text-green-600 dark:text-green-400" />
				</div>
				<div>
					<h3 class="font-semibold text-gray-900 dark:text-white">Collections</h3>
					<p class="text-sm text-gray-600 dark:text-gray-400">
						{collections.length} collections available
					</p>
				</div>
			</div>

			<div class="space-y-2">
				{#each collections.slice(0, 3) as collection}
					<div class="flex items-center justify-between text-sm">
						<span class="text-gray-700 dark:text-gray-300">{collection.label}</span>
						<Icon icon="mdi:chevron-right" class="h-4 w-4 text-gray-400" />
					</div>
				{/each}
				{#if collections.length > 3}
					<p class="text-xs text-gray-500 dark:text-gray-500">
						...and {collections.length - 3} more
					</p>
				{/if}
			</div>
		</div>
	</div>

	<!-- Progress Bar -->
	{#if loading && (exportProgress > 0 || importProgress > 0)}
		<div class="mb-6">
			<ProgressBar value={exportProgress || importProgress} label={exportProgress > 0 ? 'Exporting...' : 'Importing...'} />
		</div>
	{/if}

	<!-- Download Link -->
	{#if exportUrl}
		<div class="mb-6">
			<div class="alert variant-filled-success">
				<div class="flex items-center justify-between">
					<span>Export completed successfully!</span>
					<Button on:click={downloadExport} variant="primary" size="sm">
						<Icon icon="mdi:download" class="mr-2 h-4 w-4" />
						Download
					</Button>
				</div>
			</div>
		</div>
	{/if}
</div>

<!-- Export Modal -->
{#if showExportModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
		<div class="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-lg bg-surface-50 shadow-xl dark:bg-surface-800">
			<div class="flex items-center justify-between border-b p-6">
				<h3 class="text-lg font-semibold">Export Collections</h3>
				<button on:click={() => (showExportModal = false)} class="variant-ghost btn btn-sm">
					<Icon icon="mdi:close" class="h-5 w-5" />
				</button>
			</div>
			<div class="max-h-[calc(80vh-140px)] space-y-6 overflow-y-auto p-6">
				<!-- Format Selection -->
				<div>
					<label class="mb-2 block text-sm font-medium">Export Format</label>
					<select class="select" bind:value={exportOptions.format}>
						<option value="json">JSON</option>
						<option value="csv">CSV</option>
					</select>
				</div>

				<!-- Collection Selection -->
				<div>
					<div class="mb-3 flex items-center justify-between">
						<label class="block text-sm font-medium">Select Collections</label>
						<div class="space-x-2">
							<Button on:click={selectAllCollections} variant="ghost" size="sm">Select All</Button>
							<Button on:click={clearCollectionSelection} variant="ghost" size="sm">Clear All</Button>
						</div>
					</div>

					<div class="max-h-48 overflow-y-auto rounded-md border border-gray-200 p-3 dark:border-gray-700">
						{#each collections as collection}
							<label class="flex items-center space-x-3 py-2">
								<input
									type="checkbox"
									checked={exportOptions.collections.includes(collection.id)}
									on:change={() => toggleCollectionSelection(collection.id)}
									class="rounded"
								/>
								<div>
									<div class="font-medium">{collection.label}</div>
									{#if collection.description}
										<div class="text-sm text-gray-500">{collection.description}</div>
									{/if}
								</div>
							</label>
						{/each}
					</div>
				</div>

				<!-- Options -->
				<div class="space-y-4">
					<Toggles bind:value={exportOptions.includeMetadata} label="Include Metadata" helper="Include schema and field information" />

					<div>
						<label class="mb-2 block text-sm font-medium">Limit (optional)</label>
						<Input bind:value={exportOptions.limit} type="number" placeholder="Leave empty for all records" />
					</div>
				</div>
			</div>

			<div class="flex justify-end space-x-3 border-t bg-surface-100 p-6 dark:bg-surface-700">
				<Button on:click={() => (showExportModal = false)} variant="ghost">Cancel</Button>
				<Button on:click={exportSelectedCollections} variant="primary" disabled={loading || exportOptions.collections.length === 0}>
					Export Selected
				</Button>
			</div>
		</div>
	</div>
{/if}

<!-- Import Modal -->
{#if showImportModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
		<div class="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-lg bg-surface-50 shadow-xl dark:bg-surface-800">
			<div class="flex items-center justify-between border-b p-6">
				<h3 class="text-lg font-semibold">Import Collections</h3>
				<button on:click={() => (showImportModal = false)} class="variant-ghost btn btn-sm">
					<Icon icon="mdi:close" class="h-5 w-5" />
				</button>
			</div>
			<div class="max-h-[calc(80vh-140px)] space-y-6 overflow-y-auto p-6">
				<!-- File Upload -->
				<div>
					<label class="mb-2 block text-sm font-medium">Select File</label>
					<input
						type="file"
						bind:files={importFiles}
						accept=".json,.csv"
						class="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
					/>
					<p class="mt-1 text-xs text-gray-500">Supported formats: JSON, CSV</p>
				</div>

				<!-- Format Selection -->
				<div>
					<label class="mb-2 block text-sm font-medium">Data Format</label>
					<select class="select" bind:value={importOptions.format}>
						<option value="json">JSON</option>
						<option value="csv">CSV</option>
					</select>
				</div>

				<!-- Import Options -->
				<div class="space-y-4">
					<Toggles bind:value={importOptions.overwrite} label="Overwrite Existing" helper="Replace existing entries with same ID" />

					<Toggles bind:value={importOptions.validate} label="Validate Data" helper="Validate entries against schema" />

					<Toggles bind:value={importOptions.skipInvalid} label="Skip Invalid Entries" helper="Continue import if validation fails" />

					<div>
						<label class="mb-2 block text-sm font-medium">Batch Size</label>
						<Input bind:value={importOptions.batchSize} type="number" min="1" max="1000" />
					</div>
				</div>
			</div>

			<div class="flex justify-end space-x-3 border-t bg-surface-100 p-6 dark:bg-surface-700">
				<Button on:click={() => (showImportModal = false)} variant="ghost">Cancel</Button>
				<Button on:click={handleImport} variant="primary" disabled={loading || !importFiles}>Import Data</Button>
			</div>
		</div>
	</div>
{/if}

<!-- Results Modal -->
{#if showResultsModal}
	<div class="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
		<div class="max-h-[80vh] w-full max-w-4xl overflow-hidden rounded-lg bg-surface-50 shadow-xl dark:bg-surface-800">
			<div class="flex items-center justify-between border-b p-6">
				<h3 class="text-lg font-semibold">Import Results</h3>
				<button on:click={() => (showResultsModal = false)} class="variant-ghost btn btn-sm">
					<Icon icon="mdi:close" class="h-5 w-5" />
				</button>
			</div>
			<div class="max-h-[calc(80vh-140px)] overflow-y-auto p-6">
				{#if importResult}
					<div class="space-y-6">
						<!-- Summary -->
						<div class="rounded-lg bg-gray-50 p-4 dark:bg-gray-800">
							<h3 class="mb-3 font-semibold">Import Summary</h3>
							<div class="grid grid-cols-3 gap-4 text-center">
								<div>
									<div class="text-2xl font-bold text-green-600">{importResult.totalImported}</div>
									<div class="text-sm text-gray-600">Imported</div>
								</div>
								<div>
									<div class="text-2xl font-bold text-yellow-600">{importResult.totalSkipped}</div>
									<div class="text-sm text-gray-600">Skipped</div>
								</div>
								<div>
									<div class="text-2xl font-bold text-red-600">{importResult.totalErrors}</div>
									<div class="text-sm text-gray-600">Errors</div>
								</div>
							</div>
						</div>

						<!-- Collection Results -->
						<div>
							<h3 class="mb-3 font-semibold">Collection Details</h3>
							<div class="max-h-64 space-y-3 overflow-y-auto">
								{#each importResult.results as result}
									<div class="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
										<div class="mb-2 flex items-center justify-between">
											<h4 class="font-medium">{result.collection}</h4>
											<div class="flex space-x-4 text-sm">
												<span class="text-green-600">+{result.imported}</span>
												<span class="text-yellow-600">~{result.skipped}</span>
												<span class="text-red-600">!{result.errors.length}</span>
											</div>
										</div>

										{#if result.errors.length > 0}
											<div class="text-sm">
												<details>
													<summary class="cursor-pointer text-red-600">
														{result.errors.length} errors
													</summary>
													<div class="mt-2 space-y-1">
														{#each result.errors.slice(0, 5) as error}
															<div class="text-xs text-gray-600">
																Line {error.index + 1}: {error.error}
															</div>
														{/each}
														{#if result.errors.length > 5}
															<div class="text-xs text-gray-500">
																...and {result.errors.length - 5} more errors
															</div>
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
				{/if}
			</div>

			<div class="flex justify-end border-t bg-surface-100 p-6 dark:bg-surface-700">
				<Button on:click={() => (showResultsModal = false)} variant="primary">Close</Button>
			</div>
		</div>
	</div>
{/if}

<style>
	.import-export-manager {
		@apply mx-auto max-w-6xl p-6;
	}
</style>
