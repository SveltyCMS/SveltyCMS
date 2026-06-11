<!--
@file src/components/admin/smart-importer.svelte
@component
**AI-Smart CMS Migration Importer UI with drag-and-drop upload,
format auto-detection, field mapping preview, and progress tracking.**

### Features:
- Drag-and-drop file upload area
- Format auto-detection display
- Field mapping preview (source → target) with ability to adjust
- Progress bar during import
- Results summary (imported, skipped, errors)
- Dry-run mode toggle
- ARIA-accessible keyboard navigation
-->
<script lang="ts">
	import { SmartImporter, type ImportProgress, type ImportResult, type FieldMapping } from "@src/services/smart-importer";
	import { toast } from "@src/stores/toast.svelte.ts";
	import { logger } from "@utils/logger";
	import { fade, slide } from "svelte/transition";
	import Button from "@components/ui/button.svelte";
	import Progress from "@components/ui/progress.svelte";
	import SystemTooltip from "@src/components/system/system-tooltip.svelte";

	interface Props {
		/** Called when import completes successfully */
		onComplete?: (result: ImportResult) => void;
		/** If provided, used to actually persist imported data (otherwise dry-run only) */
		dbAdapter?: unknown;
		tenantId?: string | null;
	}

	let { onComplete, dbAdapter, tenantId }: Props = $props();

	// State
	let file = $state<File | null>(null);
	let isDragging = $state(false);
	let detectedFormat = $state<string>("");
	let isImporting = $state(false);
	let dryRun = $state(true);
	let importResult = $state<ImportResult | null>(null);
	let fieldMappings = $state<FieldMapping[]>([]);
	let showFieldMapping = $state(false);

	// Progress
	let progressPercent = $state(0);
	let progressPhase = $state("");
	let progressCurrent = $state("");
	let progressProcessed = $state(0);
	let progressTotal = $state(0);

	// Adjusted mappings (user can modify)
	let adjustedMappings = $state<Map<string, string>>(new Map());

	const importer = $derived(new SmartImporter(dbAdapter, tenantId));

	const formatLabels: Record<string, string> = {
		wordpress: "WordPress (WXR XML)",
		strapi: "Strapi (JSON)",
		directus: "Directus (JSON)",
		drupal: "Drupal (YAML)",
		sveltycms: "SveltyCMS (JSON)",
		unknown: "Unknown",
	};

	const formatIcons: Record<string, string> = {
		wordpress: "mdi:wordpress",
		strapi: "mdi:headless-cms",
		directus: "mdi:rabbit",
		drupal: "mdi:drupal",
		sveltycms: "mdi:database-outline",
		unknown: "mdi:help-circle-outline",
	};

	// ============================================================================
	// Drag & Drop Handlers
	// ============================================================================

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		isDragging = true;
	}

	function handleDragLeave() {
		isDragging = false;
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		isDragging = false;
		const droppedFile = e.dataTransfer?.files?.[0];
		if (droppedFile) {
			selectFile(droppedFile);
		}
	}

	function handleFileInput(e: Event) {
		const input = e.target as HTMLInputElement;
		const selectedFile = input.files?.[0];
		if (selectedFile) {
			selectFile(selectedFile);
		}
	}

	async function selectFile(selectedFile: File) {
		file = selectedFile;
		importResult = null;
		fieldMappings = [];
		adjustedMappings = new Map();
		showFieldMapping = false;

		// Auto-detect format
		try {
			detectedFormat = await importer.detectFormat(selectedFile);
			logger.info(`Smart Importer: detected format "${detectedFormat}"`);
		} catch {
			detectedFormat = "unknown";
		}
	}

	function clearFile() {
		file = null;
		detectedFormat = "";
		importResult = null;
		fieldMappings = [];
		progressPercent = 0;
	}

	// ============================================================================
	// Import Handler
	// ============================================================================

	async function handleImport() {
		if (!file) return;

		try {
			isImporting = true;
			importResult = null;

			const result = await importer.import(file, {
				dryRun,
				batchSize: 100,
				onProgress: (progress: ImportProgress) => {
					progressPercent = progress.percentage;
					progressPhase = progress.phase;
					progressCurrent = progress.currentItem;
					progressProcessed = progress.processedItems;
					progressTotal = progress.totalItems;
				},
			});

			importResult = result;
			fieldMappings = result.fieldMappings;

			// Initialize adjusted mappings
			const map = new Map<string, string>();
			for (const m of result.fieldMappings) {
				map.set(m.sourceField, m.targetField);
			}
			adjustedMappings = map;

			if (result.success) {
				const mode = dryRun ? "dry-run" : "live";
				toast.success(`Import ${mode} complete: ${result.imported} items mapped`);
				onComplete?.(result);
			} else {
				toast.error(`Import failed: ${result.warnings.join(", ")}`);
			}
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			logger.error("Smart Importer error:", msg);
			toast.error(`Import error: ${msg}`);
		} finally {
			isImporting = false;
		}
	}

	// ============================================================================
	// Field Mapping Adjustments
	// ============================================================================

	function adjustMapping(sourceField: string, newTarget: string) {
		adjustedMappings = new Map(adjustedMappings.set(sourceField, newTarget));
	}

	function getConfidenceColor(confidence: string): string {
		switch (confidence) {
			case "high":
				return "text-tertiary-500 dark:text-primary-500";
			case "medium":
				return "text-warning-500";
			case "low":
				return "text-error-500";
			default:
				return "text-surface-500";
		}
	}

	function formatFileSize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
	}
</script>

<div class="smart-importer space-y-6">
	<!-- Header -->
	<div>
		<h2 class="text-xl font-bold text-surface-900 dark:text-white">AI-Smart Importer</h2>
		<p class="mt-1 text-sm text-surface-500">
			Import content from WordPress, Strapi, Directus, Drupal, or SveltyCMS exports with intelligent field mapping.
		</p>
	</div>

	<!-- Drop Zone -->
	{#if !file}
		<div
			class="relative rounded border-2 border-dashed p-10 text-center transition-all duration-200 {isDragging
				? 'border-tertiary-500 dark:border-primary-500 bg-tertiary-500/5 dark:bg-primary-500/5 scale-[1.02]'
				: 'border-surface-300 dark:border-surface-600 hover:border-surface-400 dark:hover:border-surface-500'}"
			ondragover={handleDragOver}
			ondragleave={handleDragLeave}
			ondrop={handleDrop}
			role="button"
			tabindex="0"
			aria-label="Drop your CMS export file here or click to browse"
			onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.getElementById('smart-importer-file-input')?.click(); } }}
			onclick={() => document.getElementById("smart-importer-file-input")?.click()}
		>
			<div class="flex flex-col items-center gap-4" in:fade={{ duration: 300 }}>
				<div class="flex h-16 w-16 items-center justify-center rounded-full bg-surface-100 dark:bg-surface-800">
					<iconify-icon icon="mdi:file-upload-outline" width="32" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
				</div>
				<div>
					<p class="font-medium text-surface-700 dark:text-surface-200">
						Drop your CMS export file here
					</p>
					<p class="mt-1 text-sm text-surface-500">
						Supports WXR XML, JSON, and YAML formats
					</p>
				</div>
				<Button variant="secondary" size="sm" rounded={true} aria-label="Browse files">
					Browse Files
				</Button>
			</div>
			<input
				id="smart-importer-file-input"
				type="file"
				accept=".xml,.wxr,.json,.yaml,.yml"
				class="hidden"
				onchange={handleFileInput}
				aria-label="Select a CMS export file to import"
			/>
		</div>
	{:else}
		<!-- File Info & Format Detection -->
		<div class="rounded border border-surface-200 bg-white p-5 dark:border-surface-700 dark:bg-surface-800/50" in:slide={{ duration: 300 }}>
			<div class="flex items-start justify-between">
				<div class="flex items-center gap-4">
					<!-- File icon -->
					<div class="flex h-12 w-12 items-center justify-center rounded bg-surface-100 dark:bg-surface-700">
						<iconify-icon
							icon={formatIcons[detectedFormat] || "mdi:file-outline"}
							width="24"
							class="text-tertiary-600 dark:text-primary-400"
							aria-hidden="true"
						></iconify-icon>
					</div>

					<div>
						<h3 class="font-semibold text-surface-900 dark:text-white">{file.name}</h3>
						<p class="text-sm text-surface-500">{formatFileSize(file.size)}</p>
						{#if detectedFormat && detectedFormat !== "unknown"}
							<span class="mt-1 inline-flex items-center gap-1 rounded-full bg-tertiary-500/10 px-2 py-0.5 text-xs font-medium text-tertiary-600 dark:bg-primary-500/10 dark:text-primary-400">
								<iconify-icon icon="mdi:check-circle" width="14" aria-hidden="true"></iconify-icon>
								Detected: {formatLabels[detectedFormat] || detectedFormat}
							</span>
						{:else if detectedFormat === "unknown"}
							<span class="mt-1 inline-flex items-center gap-1 rounded-full bg-warning-500/10 px-2 py-0.5 text-xs font-medium text-warning-600">
								<iconify-icon icon="mdi:alert-circle" width="14" aria-hidden="true"></iconify-icon>
								Unknown format
							</span>
						{/if}
					</div>
				</div>

				<button
					type="button"
					onclick={clearFile}
					class="btn-icon preset-outlined-secondary-500 rounded-full"
					disabled={isImporting}
					aria-label="Remove selected file"
				>
					<iconify-icon icon="mdi:close" width="20" aria-hidden="true"></iconify-icon>
				</button>
			</div>
		</div>

		<!-- Options -->
		<div class="flex flex-wrap items-center gap-4">
			<SystemTooltip title="Validate and map fields without actually importing data into the database">
				<label class="flex cursor-pointer items-center gap-2 text-sm" aria-label="Enable dry-run mode to preview import without saving data">
					<input
						type="checkbox"
						bind:checked={dryRun}
						class="h-4 w-4 rounded border-surface-300 text-tertiary-500 focus:ring-tertiary-500 dark:border-surface-600 dark:focus:ring-primary-500"
						disabled={isImporting}
					 />
					<span>Dry Run (preview only)</span>
				</label>
			</SystemTooltip>
		</div>

		<!-- Import Button -->
		<Button
			onclick={handleImport}
			variant="primary"
			size="lg"
			rounded={true}
			disabled={isImporting}
			class="w-full sm:w-auto"
			aria-label={dryRun ? "Start dry-run import preview" : "Start importing data"}
		>
			{#if isImporting}
				<iconify-icon icon="mdi:loading" width="20" class="animate-spin" aria-hidden="true"></iconify-icon>
				Importing...
			{:else}
				<iconify-icon icon="mdi:import" width="20" aria-hidden="true"></iconify-icon>
				{dryRun ? "Preview Import" : "Start Import"}
			{/if}
		</Button>

		<!-- Progress -->
		{#if isImporting}
			<div class="space-y-3 rounded border border-surface-200 bg-white p-5 dark:border-surface-700 dark:bg-surface-800/50" in:fade={{ duration: 200 }}>
				<div class="flex items-center justify-between text-sm">
					<span class="text-surface-600 dark:text-surface-300 capitalize">{progressPhase}</span>
					<span class="font-mono text-surface-500">{progressPercent}%</span>
				</div>
				<Progress value={progressPercent} max={100} aria-label="Import progress" />
				<p class="text-xs text-surface-500">
					{progressCurrent}
					{#if progressTotal > 0}
						<span class="font-mono">({progressProcessed}/{progressTotal})</span>
					{/if}
				</p>
			</div>
		{/if}

		<!-- Results Summary -->
		{#if importResult}
			<div class="space-y-4 rounded border border-surface-200 bg-white p-5 dark:border-surface-700 dark:bg-surface-800/50" in:slide={{ duration: 300 }}>
				<h3 class="font-semibold text-surface-900 dark:text-white">Import Results</h3>

				<!-- Stats -->
				<div class="grid grid-cols-3 gap-4">
					<div class="rounded bg-tertiary-500/10 p-3 text-center dark:bg-primary-500/10">
						<p class="text-2xl font-bold text-tertiary-600 dark:text-primary-400">{importResult.imported}</p>
						<p class="text-xs text-surface-500">Imported</p>
					</div>
					<div class="rounded bg-warning-500/10 p-3 text-center">
						<p class="text-2xl font-bold text-warning-600">{importResult.skipped}</p>
						<p class="text-xs text-surface-500">Skipped</p>
					</div>
					<div class="rounded bg-error-500/10 p-3 text-center">
						<p class="text-2xl font-bold text-error-600">{importResult.errors}</p>
						<p class="text-xs text-surface-500">Errors</p>
					</div>
				</div>

				<!-- Duration -->
				<p class="text-xs text-surface-500">
					Completed in {(importResult.durationMs / 1000).toFixed(2)}s
					{#if dryRun}
						<span class="ms-1 text-warning-500">(Dry Run)</span>
					{/if}
				</p>

				<!-- Warnings -->
				{#if importResult.warnings.length > 0}
					<div class="space-y-1 rounded bg-warning-500/5 p-3">
						{#each importResult.warnings as warning}
							<p class="text-xs text-warning-600">{warning}</p>
						{/each}
					</div>
				{/if}

				<!-- Field Mapping Preview -->
				{#if fieldMappings.length > 0}
					<div class="space-y-2">
						<button
							type="button"
							onclick={() => (showFieldMapping = !showFieldMapping)}
							class="flex items-center gap-1 text-sm font-medium text-tertiary-600 hover:text-tertiary-700 dark:text-primary-400 dark:hover:text-primary-300"
							aria-expanded={showFieldMapping}
							aria-label="Toggle field mapping preview"
						>
							<iconify-icon icon={showFieldMapping ? "mdi:chevron-up" : "mdi:chevron-down"} width="16" aria-hidden="true"></iconify-icon>
							Field Mapping ({fieldMappings.length} fields)
						</button>

						{#if showFieldMapping}
							<div class="max-h-80 overflow-y-auto rounded border border-surface-200 dark:border-surface-700" in:slide={{ duration: 200 }}>
								<table class="w-full text-sm" aria-label="Field mapping table showing source to target field conversions">
									<thead class="sticky top-0 bg-surface-50 dark:bg-surface-800">
										<tr>
											<th class="px-3 py-2 text-start text-xs font-medium text-surface-500">Source Field</th>
											<th class="px-3 py-2 text-start text-xs font-medium text-surface-500">→</th>
											<th class="px-3 py-2 text-start text-xs font-medium text-surface-500">Target Field</th>
											<th class="px-3 py-2 text-start text-xs font-medium text-surface-500">Confidence</th>
										</tr>
									</thead>
									<tbody class="divide-y divide-surface-100 dark:divide-surface-700">
										{#each fieldMappings as mapping (mapping.sourceField)}
											<tr>
												<td class="px-3 py-2 font-mono text-xs text-surface-700 dark:text-surface-300">{mapping.sourceField}</td>
												<td class="px-3 py-2 text-surface-400">→</td>
												<td class="px-3 py-2">
													<input
														type="text"
														value={adjustedMappings.get(mapping.sourceField) || mapping.targetField}
														oninput={(e) => adjustMapping(mapping.sourceField, (e.target as HTMLInputElement).value)}
														class="w-full rounded border border-surface-200 bg-transparent px-2 py-1 font-mono text-xs text-surface-700 focus:border-tertiary-500 focus:outline-none dark:border-surface-600 dark:text-surface-300 dark:focus:border-primary-500"
														aria-label="Adjust target field for {mapping.sourceField}"
													/>
												</td>
												<td class="px-3 py-2">
													<span class="text-xs font-medium {getConfidenceColor(mapping.confidence)}">
														{mapping.confidence}
													</span>
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}
					</div>
				{/if}
			</div>
		{/if}
	{/if}
</div>
