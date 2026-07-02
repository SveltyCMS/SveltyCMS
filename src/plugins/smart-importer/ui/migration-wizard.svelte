<!--
  @file src/plugins/smart-importer/ui/migration-wizard.svelte
  @component
  **Smart AI-Driven Migration Pro — Visual Step Wizard**

  Five-step guided migration flow:
  1. Upload & Detect → Auto-detect format, AI field analysis
  2. Visual Mapping → TransformationTree with drag source→target fields
  3. Dry Run → Validate without writing
  4. Import → Streaming SSE progress per collection
  5. Review & Rollback → Summary with rollback capability

  ### Features:
  - multi-step wizard with step indicators
  - drag-drop file upload with auto-detection (36+ formats)
  - visual field mapping tree (confidence-coded)
  - SSE real-time progress streaming
  - dry-run validation before import
  - transaction rollback
-->
<script lang="ts">
  import { toast } from '@src/stores/toast.svelte';
  import { logger } from '@utils/logger';
  import { fade, slide } from 'svelte/transition';
  import AdminCard from '@components/admin-card.svelte';
  import AdminPageShell from '@components/admin-page-shell.svelte';
  import Button from '@components/ui/button.svelte';
  import Input from '@components/ui/input.svelte';
  import Progress from '@components/ui/progress.svelte';
  import StickyActions from '@components/ui/sticky-actions.svelte';
  import { inferTargetCollectionFromMigration } from '@plugins/smart-importer/infer-collection';
  import {
    postDetectAction,
    postDryRunAction,
    postRollbackAction,
  } from '@plugins/smart-importer/ui/migration-form-actions';

  // ============================================================================
  // Props & State
  // ============================================================================

  let step = $state(1);
  let file = $state<File | null>(null);
  let isDragging = $state(false);
  let detectedFormat = $state('');
  let estimatedCount = $state(0);
  let isProcessing = $state(false);
  let targetCollection = $state('');

  // Field mappings (from AI analysis)
  let fieldMappings = $state<Array<{ source: string; target: string; confidence: number; type: string }>>([]);

  // Selection state
  let selectedContentTypes = $state<Set<string>>(new Set());
  let availableContentTypes = $state<string[]>([]);

  // Import progress (SSE)
  let importPhase = $state('');
  let importPercent = $state(0);
  let importCurrent = $state(0);
  let importTotal = $state(0);
  let importLog = $state<Array<{ time: string; level: string; message: string }>>([]);

  // Results
  let importResult = $state<any>(null);
  let transactionToken = $state('');

  // Selection toggle state
  let selectAllContentTypes = $state(true);

  const formatLabels: Record<string, string> = {
    wordpress: 'WordPress (WXR XML)',
    drupal: 'Drupal (JSON:API / YAML / CSV)',
    strapi: 'Strapi (JSON)',
    directus: 'Directus (JSON)',
    sveltycms: 'SveltyCMS (JSON)',
    contentful: 'Contentful (JSON)',
    sanity: 'Sanity.io (NDJSON)',
    ghost: 'Ghost (JSON)',
    webflow: 'Webflow (CSV)',
    shopify: 'Shopify (JSON)',
    storyblok: 'Storyblok (JSON)',
    prismic: 'Prismic (JSON)',
    unknown: 'Unknown',
  };

  // ============================================================================
  // Step Navigation
  // ============================================================================

  function goToStep(n: number) {
    if (n < 1 || n > 5) return;
    if (n === 2 && !file) return;
    if (n === 3 && fieldMappings.length === 0) return;
    step = n;
  }

  // ============================================================================
  // Step 1: File Upload & AI Analysis
  // ============================================================================

  function handleDragOver(e: DragEvent) { e.preventDefault(); isDragging = true; }
  function handleDragLeave() { isDragging = false; }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    const f = e.dataTransfer?.files?.[0];
    if (f) selectFile(f);
  }

  function handleFileInput(e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    if (f) selectFile(f);
  }

  async function selectFile(f: File) {
    file = f;
    importResult = null;
    step = 1;

    try {
      const formData = new FormData();
      formData.set('file', f);

      const data = await postDetectAction(formData);

      if (data.success) {
        detectedFormat = data.format || '';
        estimatedCount = data.estimatedCount || 0;
        fieldMappings = data.fieldMappings || [];
        availableContentTypes = data.contentTypes || [];
        selectedContentTypes = new Set(availableContentTypes);
        if (data.suggestedTargetCollection) {
          targetCollection = data.suggestedTargetCollection;
        } else {
          targetCollection = inferTargetCollectionFromMigration({
            format: detectedFormat,
            contentTypes: availableContentTypes,
          });
        }
        logger.info(`Migration: detected "${detectedFormat}" with ${estimatedCount} items`);
      } else {
        toast.error(data.error || 'Format detection failed');
      }
    } catch (err) {
      toast.error('Failed to analyze file');
    }
  }

  function clearFile() {
    file = null;
    detectedFormat = '';
    step = 1;
    fieldMappings = [];
  }

  function syncTargetCollectionFromSelection() {
    if (!detectedFormat || selectedContentTypes.size === 0) return;
    targetCollection = inferTargetCollectionFromMigration({
      format: detectedFormat,
      contentTypes: availableContentTypes,
      selectedContentTypes: [...selectedContentTypes],
    });
  }

  function toggleContentType(type: string) {
    const next = new Set(selectedContentTypes);
    if (next.has(type)) next.delete(type); else next.add(type);
    selectedContentTypes = next;
    selectAllContentTypes = next.size === availableContentTypes.length;
    syncTargetCollectionFromSelection();
  }

  function toggleAllContentTypes() {
    if (selectAllContentTypes) {
      selectedContentTypes = new Set();
      selectAllContentTypes = false;
    } else {
      selectedContentTypes = new Set(availableContentTypes);
      selectAllContentTypes = true;
    }
    syncTargetCollectionFromSelection();
  }

  // ============================================================================
  // Step 2: Visual Mapping (delegates to TransformationTree)
  // ============================================================================

  function updateMapping(source: string, target: string) {
    fieldMappings = fieldMappings.map((m) =>
      m.source === source ? { ...m, target } : m,
    );
  }

  function getConfidenceColor(conf: number): string {
    if (conf >= 80) return 'text-tertiary-500 dark:text-primary-500';
    if (conf >= 50) return 'text-warning-500';
    return 'text-error-500';
  }

  // ============================================================================
  // Step 3: Dry Run
  // ============================================================================

  async function runDryRun() {
    if (!file) return;
    isProcessing = true;
    try {
      const formData = new FormData();
      formData.set('file', file);
      formData.set('format', detectedFormat);
      formData.set('targetCollection', targetCollection);
      formData.set('contentTypes', JSON.stringify([...selectedContentTypes]));
      formData.set('mappings', JSON.stringify(fieldMappings));

      const data = await postDryRunAction(formData);

      if (data.success) {
        toast.success(`Dry run: ${data.estimatedItems} items would be imported`);
        goToStep(4);
      } else {
        toast.error(data.error || 'Validation failed');
      }
    } catch (err) {
      toast.error('Dry run failed');
    } finally {
      isProcessing = false;
    }
  }

  // ============================================================================
  // Step 4: Import with SSE Progress
  // ============================================================================

  async function startImport() {
    if (!file) return;
    isProcessing = true;
    importLog = [];
    importPercent = 0;
    importPhase = 'Starting...';

    try {
      const formData = new FormData();
      formData.set('file', file);
      formData.set('format', detectedFormat);
      formData.set('targetCollection', targetCollection);
      formData.set('contentTypes', JSON.stringify([...selectedContentTypes]));
      formData.set('mappings', JSON.stringify(fieldMappings));

      addLog('info', 'Starting import (SSE stream)...');

      const response = await fetch('/api/migration/import', { method: 'POST', body: formData });
      if (!response.ok) {
        const errText = await response.text();
        addLog('error', errText || `HTTP ${response.status}`);
        toast.error(errText || 'Import failed');
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response stream');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() || '';

        for (const block of blocks) {
          const line = block.trim();
          if (!line.startsWith('data: ')) continue;

          const payload = JSON.parse(line.slice(6));

          if (payload.type === 'progress') {
            importPhase = payload.phase || 'processing';
            importCurrent = payload.current ?? importCurrent;
            importTotal = payload.total ?? importTotal;
            importPercent = payload.percent ?? (importTotal > 0 ? (importCurrent / importTotal) * 100 : 0);
          } else if (payload.type === 'complete') {
            importResult = payload;
            transactionToken = payload.transactionToken || '';
            importPercent = 100;
            importPhase = 'completed';
            if (payload.scaffold?.collectionId) {
              targetCollection = payload.scaffold.collectionId;
            }
            addLog('success', `Import complete: ${payload.imported || 0} imported, ${payload.failed || 0} failed`);
            toast.success(`Import complete! ${payload.imported || 0} items imported`);
            goToStep(5);
          } else if (payload.type === 'error') {
            addLog('error', payload.error || 'Import failed');
            toast.error(payload.error || 'Import failed');
          }
        }
      }
    } catch (err: any) {
      addLog('error', `Error: ${err.message}`);
      toast.error('Import failed');
    } finally {
      isProcessing = false;
    }
  }

  function addLog(level: string, message: string) {
    importLog = [...importLog, { time: new Date().toLocaleTimeString(), level, message }];
  }

  // ============================================================================
  // Step 5: Rollback
  // ============================================================================

  async function rollbackMigration() {
    if (!transactionToken) return;
    try {
      const formData = new FormData();
      formData.set('transactionToken', transactionToken);

      const data = await postRollbackAction(formData);

      if (data.success) {
        toast.success('Migration rolled back successfully');
        importResult = null;
        transactionToken = '';
        step = 2; // Go back to mapping
      } else {
        toast.error(data.message || data.error || 'Rollback failed');
      }
    } catch (err) {
      toast.error('Rollback failed');
    }
  }

  // ============================================================================
  // Helpers
  // ============================================================================

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const confidenceLabels: Record<string, string> = {
    wordpress: 'mdi:wordpress',
    drupal: 'mdi:drupal',
    strapi: 'mdi:headless-cms',
    directus: 'mdi:rabbit',
    sveltycms: 'mdi:database-outline',
    contentful: 'mdi:file-document-outline',
    sanity: 'mdi:file-document-outline',
    ghost: 'mdi:ghost',
    webflow: 'mdi:web',
    shopify: 'mdi:shopping',
    storyblok: 'mdi:view-dashboard',
    prismic: 'mdi:file-code',
    unknown: 'mdi:help-circle-outline',
  };
</script>

<AdminPageShell
  title="Smart AI-Driven Migration Pro"
  icon="mdi:database-import-outline"
  description="Visual 5-step migration wizard — upload, map fields, validate, import with live progress, and rollback."
  showBackButton={true}
  backUrl="/config"
>
  <AdminCard class="border border-surface-200 bg-white p-6 shadow-xs dark:border-surface-800 dark:bg-surface-900/40">
    <div class="space-y-6">

      <!-- Step Indicators -->
      <div class="flex items-center justify-center gap-2 text-sm" aria-label="Migration wizard steps">
        {#each ['Upload', 'Map Fields', 'Validate', 'Import', 'Review'] as label, i (i)}
          {@const s = i + 1}
          <button
            onclick={() => goToStep(s)}
            disabled={s > step + 1 || (s === 2 && !file) || (s >= 3 && fieldMappings.length === 0)}
            class="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all text-xs font-medium
              {step === s
                ? 'bg-tertiary-500 text-white dark:bg-primary-500'
                : step > s
                  ? 'bg-tertiary-500/20 text-tertiary-600 dark:bg-primary-500/20 dark:text-primary-400 cursor-pointer'
                  : 'bg-surface-100 text-surface-400 dark:bg-surface-800 dark:text-surface-600'}"
            aria-label="Step {s}: {label}"
            aria-current={step === s ? 'step' : undefined}
          >
            <span class="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold
              {step > s ? 'bg-tertiary-500 text-white dark:bg-primary-500' : step === s ? 'bg-white/20' : 'bg-surface-300 dark:bg-surface-700'}">
              {step > s ? '✓' : s}
            </span>
            {label}
          </button>
          {#if i < 4}
            <span class="text-surface-300 dark:text-surface-600">→</span>
          {/if}
        {/each}
      </div>

      <!-- ================================================================ -->
      <!-- STEP 1: Upload & Detect -->
      <!-- ================================================================ -->
      {#if step === 1}
        {#if !file}
          <!-- Drop Zone -->
          <div
            class="relative rounded border-2 border-dashed p-10 text-center transition-all duration-200 cursor-pointer {isDragging
              ? 'border-tertiary-500 dark:border-primary-500 bg-tertiary-500/5 scale-[1.02]'
              : 'border-surface-300 dark:border-surface-600 hover:border-surface-400'}"
            ondragover={handleDragOver}
            ondragleave={handleDragLeave}
            ondrop={handleDrop}
            role="button"
            tabindex="0"
            aria-label="Drop your CMS export file here or click to browse"
            onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.getElementById('migration-file-input')?.click(); } }}
            onclick={() => document.getElementById('migration-file-input')?.click()}
          >
            <div class="flex flex-col items-center gap-4" in:fade={{ duration: 300 }}>
              <div class="flex h-16 w-16 items-center justify-center rounded-full bg-surface-100 dark:bg-surface-800">
                <iconify-icon icon="mdi:file-upload-outline" width="32" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
              </div>
              <div>
                <p class="font-medium text-surface-700 dark:text-surface-200">Drop your CMS export file here</p>
                <p class="mt-1 text-sm text-surface-500">36+ platforms: WXR, JSON, YAML, CSV, NDJSON</p>
              </div>
              <Button variant="secondary" size="sm" rounded={true} aria-label="Browse files">Browse Files</Button>
            </div>
            <input id="migration-file-input" type="file" accept=".xml,.wxr,.json,.yaml,.yml,.csv,.ndjson" class="hidden" onchange={handleFileInput} aria-label="Select a CMS export file to import" />
          </div>
        {:else}
          <!-- File Detected -->
          <div class="rounded border border-surface-200 bg-surface-50 p-6 dark:border-surface-700 dark:bg-surface-800/50" in:slide={{ duration: 300 }}>
            <div class="flex items-start justify-between">
              <div class="flex items-center gap-4">
                <div class="flex h-14 w-14 items-center justify-center rounded-xl bg-tertiary-500/10 dark:bg-primary-500/10">
                  <iconify-icon icon={confidenceLabels[detectedFormat] || 'mdi:file-outline'} width="28" class="text-tertiary-600 dark:text-primary-400" aria-hidden="true"></iconify-icon>
                </div>
                <div>
                  <h3 class="text-lg font-semibold text-surface-900 dark:text-white">{file.name}</h3>
                  <p class="text-sm text-surface-500">{formatFileSize(file.size)}</p>
                  {#if detectedFormat !== 'unknown'}
                    <span class="mt-2 inline-flex items-center gap-1 rounded-full bg-tertiary-500/10 px-2.5 py-1 text-xs font-medium text-tertiary-600 dark:bg-primary-500/10 dark:text-primary-400">
                      <iconify-icon icon="mdi:check-circle" width="14" aria-hidden="true"></iconify-icon>
                      {formatLabels[detectedFormat] || detectedFormat}
                    </span>
                    {#if estimatedCount > 0}
                      <span class="ms-2 text-xs text-surface-500">~{estimatedCount.toLocaleString()} entries</span>
                    {/if}
                  {/if}
                </div>
              </div>
              <Button variant="outline" type="button" onclick={clearFile} class="p-0! min-w-0 rounded-full" aria-label="Remove file">
                <iconify-icon icon="mdi:close" width="20" aria-hidden="true"></iconify-icon>
              </Button>
            </div>

            <!-- Content Type Selection -->
            {#if availableContentTypes.length > 1}
              <div class="mt-5 border-t border-surface-200 pt-4 dark:border-surface-700">
                <div class="flex items-center justify-between mb-2">
                  <h4 class="text-sm font-semibold text-surface-700 dark:text-surface-300">Content Types Found</h4>
                  <button aria-label="Start migration" onclick={toggleAllContentTypes} class="text-xs text-tertiary-500 hover:underline">
                    {selectAllContentTypes ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div class="flex flex-wrap gap-2">
                  {#each availableContentTypes as ct (ct)}
                    <button
                      onclick={() => toggleContentType(ct)}
                      class="px-3 py-1.5 rounded-lg text-xs font-medium transition-all border
                        {selectedContentTypes.has(ct)
                          ? 'border-tertiary-500 bg-tertiary-500/10 text-tertiary-600 dark:border-primary-500 dark:bg-primary-500/10 dark:text-primary-400'
                          : 'border-surface-200 bg-surface-50 text-surface-500 dark:border-surface-700 dark:bg-surface-800'}"
                      aria-pressed={selectedContentTypes.has(ct)}
                      aria-label="Toggle {ct}"
                    >
                      {ct}
                    </button>
                  {/each}
                </div>
              </div>
            {/if}

            <!-- Target Collection -->
            <div class="mt-4">
              <Input label="Target Collection" type="text" placeholder="Auto-detected from source content type (e.g. post, page)" bind:value={targetCollection} />
            </div>

            <div class="mt-5 flex justify-end">
              <Button variant="primary" onclick={() => goToStep(2)} disabled={fieldMappings.length === 0}>
                Next: Map Fields →
              </Button>
            </div>
          </div>
        {/if}

      <!-- ================================================================ -->
      <!-- STEP 2: Visual Field Mapping -->
      <!-- ================================================================ -->
      {:else if step === 2}
        <div class="space-y-4">
          <div class="flex items-center justify-between">
            <div>
              <h3 class="text-lg font-semibold text-surface-900 dark:text-white">Field Mapping</h3>
              <p class="text-sm text-surface-500">{fieldMappings.length} fields detected — adjust targets below</p>
            </div>
            <div class="flex gap-2 text-xs">
              <span class="px-2 py-1 rounded bg-tertiary-500/10 text-tertiary-600 dark:bg-primary-500/10 dark:text-primary-400">
                🟢 {fieldMappings.filter(m => m.confidence >= 80).length} High
              </span>
              <span class="px-2 py-1 rounded bg-warning-500/10 text-warning-600">
                🟡 {fieldMappings.filter(m => m.confidence >= 50 && m.confidence < 80).length} Medium
              </span>
              <span class="px-2 py-1 rounded bg-error-500/10 text-error-600">
                🔴 {fieldMappings.filter(m => m.confidence < 50).length} Low
              </span>
            </div>
          </div>

          <!-- Mapping Table -->
          <div class="max-h-96 overflow-y-auto rounded border border-surface-200 dark:border-surface-700">
            <table class="w-full text-sm" aria-label="Field mapping table">
              <thead class="sticky top-0 bg-surface-50 dark:bg-surface-800">
                <tr>
                  <th class="px-4 py-2 text-start text-xs font-medium text-surface-500 w-[40%]">Source Field</th>
                  <th class="px-2 py-2 text-center text-xs font-medium text-surface-500 w-8">→</th>
                  <th class="px-4 py-2 text-start text-xs font-medium text-surface-500 w-[40%]">Target Field</th>
                  <th class="px-4 py-2 text-center text-xs font-medium text-surface-500">Confidence</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-surface-100 dark:divide-surface-700">
                {#each fieldMappings as mapping (mapping.source)}
                  <tr class="hover:bg-surface-50 dark:hover:bg-surface-800/50">
                    <td class="px-4 py-2.5 font-mono text-xs text-surface-700 dark:text-surface-300">{mapping.source}</td>
                    <td class="px-2 py-2.5 text-center text-surface-400">→</td>
                    <td class="px-4 py-2.5">
                      <input aria-label="Source URL"
                        type="text"
                        value={mapping.target}
                        oninput={(e) => updateMapping(mapping.source, (e.target as HTMLInputElement).value)}
                        class="w-full rounded border border-surface-200 bg-transparent px-2 py-1 font-mono text-xs text-surface-800 focus:border-tertiary-500 focus:outline-none dark:border-surface-600 dark:text-surface-200 dark:focus:border-primary-500"
                        aria-label="Target field for {mapping.source}"
                      />
                    </td>
                    <td class="px-4 py-2.5 text-center">
                      <span class="inline-flex items-center gap-1 text-xs font-medium {getConfidenceColor(mapping.confidence)}">
                        {mapping.confidence}%
                      </span>
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>

          <StickyActions>
            <Button variant="outline" onclick={() => goToStep(1)}>← Back</Button>
            <Button variant="primary" onclick={() => goToStep(3)} disabled={fieldMappings.length === 0}>
              Next: Validate →
            </Button>
          </StickyActions>
        </div>

      <!-- ================================================================ -->
      <!-- STEP 3: Dry Run Validation -->
      <!-- ================================================================ -->
      {:else if step === 3}
        <div class="text-center space-y-6 py-8">
          <div class="flex h-20 w-20 items-center justify-center rounded-full bg-warning-500/10 mx-auto">
            <iconify-icon icon="mdi:shield-check-outline" width="40" class="text-warning-500" aria-hidden="true"></iconify-icon>
          </div>
          <div>
            <h3 class="text-xl font-semibold text-surface-900 dark:text-white">Validate Before Import</h3>
            <p class="mt-2 text-sm text-surface-500 max-w-md mx-auto">
              Dry run validates {estimatedCount.toLocaleString()} entries without writing to the database.
              {availableContentTypes.length > 0 ? ` Checking ${selectedContentTypes.size} content type(s).` : ''}
            </p>
          </div>

          <div class="flex justify-center gap-3">
            <Button variant="outline" onclick={() => goToStep(2)}>← Back to Mapping</Button>
            <Button variant="primary" onclick={runDryRun} disabled={isProcessing}>
              {isProcessing ? 'Validating...' : 'Run Dry Run'}
            </Button>
          </div>

          {#if isProcessing}
            <div class="flex justify-center py-4">
              <div class="h-6 w-6 animate-spin rounded-full border-2 border-tertiary-500 border-t-transparent"></div>
            </div>
          {/if}
        </div>

      <!-- ================================================================ -->
      <!-- STEP 4: Import with Progress -->
      <!-- ================================================================ -->
      {:else if step === 4}
        <div class="space-y-6">
          <div class="text-center">
            <h3 class="text-xl font-semibold text-surface-900 dark:text-white">
              {importResult ? 'Import Complete!' : 'Ready to Import'}
            </h3>
            <p class="mt-1 text-sm text-surface-500">
              {estimatedCount.toLocaleString()} entries → {targetCollection || 'detecting…'}
            </p>
          </div>

          <!-- Progress Bar -->
          <div class="space-y-2">
            <div class="flex items-center justify-between text-sm">
              <span class="text-surface-600 dark:text-surface-300 capitalize">{importPhase || 'Ready'}</span>
              <span class="font-mono text-surface-500">{Math.round(importPercent)}%</span>
            </div>
            <Progress value={importPercent} max={100} aria-label="Import progress" />
            {#if importCurrent > 0}
              <p class="text-xs text-surface-500">{importCurrent.toLocaleString()} / {importTotal.toLocaleString()}</p>
            {/if}
          </div>

          <!-- Log -->
          {#if importLog.length > 0}
            <div class="max-h-48 overflow-y-auto rounded border border-surface-200 bg-surface-50 p-3 font-mono text-xs dark:border-surface-700 dark:bg-surface-900/50">
              {#each importLog as entry (entry.time + entry.message)}
                <div class="flex gap-2 {entry.level === 'error' ? 'text-error-500' : entry.level === 'success' ? 'text-tertiary-500' : 'text-surface-500'}">
                  <span class="shrink-0 text-surface-400">{entry.time}</span>
                  <span>{entry.message}</span>
                </div>
              {/each}
            </div>
          {/if}

          <div class="flex justify-center gap-3">
            {#if !importResult}
              <Button variant="outline" onclick={() => goToStep(3)}>← Back</Button>
              <Button variant="primary" onclick={startImport} disabled={isProcessing}>
                {isProcessing ? 'Importing...' : 'Start Import'}
              </Button>
            {:else}
              <Button variant="primary" onclick={() => goToStep(5)}>
                View Results →
              </Button>
            {/if}
          </div>
        </div>

      <!-- ================================================================ -->
      <!-- STEP 5: Review & Rollback -->
      <!-- ================================================================ -->
      {:else if step === 5}
        <div class="space-y-6">
          <div class="text-center">
            <div class="flex h-16 w-16 items-center justify-center rounded-full bg-tertiary-500/10 mx-auto mb-3">
              <iconify-icon icon="mdi:check-all" width="32" class="text-tertiary-500 dark:text-primary-500" aria-hidden="true"></iconify-icon>
            </div>
            <h3 class="text-xl font-semibold text-surface-900 dark:text-white">Migration Complete</h3>
            <p class="mt-1 text-sm text-surface-500">All entries imported as drafts for review</p>
          </div>

          <!-- Stats Grid -->
          <div class="grid grid-cols-3 gap-4">
            <div class="rounded-lg bg-tertiary-500/10 p-4 text-center dark:bg-primary-500/10">
              <p class="text-2xl font-bold text-tertiary-600 dark:text-primary-400">{importResult?.imported || 0}</p>
              <p class="text-xs text-surface-500">Imported</p>
            </div>
            <div class="rounded-lg bg-warning-500/10 p-4 text-center">
              <p class="text-2xl font-bold text-warning-600">{importResult?.failed || 0}</p>
              <p class="text-xs text-surface-500">Failed</p>
            </div>
            <div class="rounded-lg bg-surface-100 p-4 text-center dark:bg-surface-800">
              <p class="text-2xl font-bold text-surface-600 dark:text-surface-300">{estimatedCount}</p>
              <p class="text-xs text-surface-500">Total</p>
            </div>
          </div>

          <!-- Transaction Info -->
          {#if transactionToken}
            <div class="rounded border border-surface-200 bg-surface-50 p-4 dark:border-surface-700 dark:bg-surface-800/50">
              <p class="text-xs font-mono text-surface-500">Transaction: {transactionToken}</p>
              <p class="mt-1 text-xs text-surface-500">All entries are in <strong class="text-warning-500">Draft</strong> status. Review before publishing.</p>
            </div>
          {/if}

          <!-- Actions -->
          <StickyActions>
            <Button variant="outline" onclick={() => goToStep(2)}>← Adjust & Re-import</Button>
            <Button variant="primary" onclick={() => { file = null; step = 1; importResult = null; transactionToken = ''; }}>
              Start New Migration
            </Button>
            {#if transactionToken}
              <Button variant="error" onclick={rollbackMigration}>
                ↩ Rollback This Migration
              </Button>
            {/if}
          </StickyActions>
        </div>
      {/if}
    </div>
  </AdminCard>
</AdminPageShell>
