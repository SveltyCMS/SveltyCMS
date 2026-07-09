<!--
  @file src/plugins/unified-data-hub/components/virtual-entry-preview.svelte
  @component Entry editor sidebar — live virtual enrichment preview for native entries.

  ### Props (from entry_edit_sidebar slot)
  - `collection` (Schema): native collection with `federationEnrichments`
  - `currentEntry` (object): active entry values

  ### Features:
  - batch enrich via /api/virtual-collections/:slug/enrich
  - N+1 stitch warning banner when meta signals high key count
  - accessible loading and error states
-->
<script lang="ts">
  import Badge from '@components/ui/badge.svelte';
  import Button from '@components/ui/button.svelte';
  import type { FederationEnrichment, Schema } from '@src/content/types';
  import { mode } from '@src/stores/collection-store.svelte';

  interface FederatedRow {
    _id?: string;
    _source?: { connectorId?: string; sourceKey?: string };
    _relations?: Record<string, unknown>;
    [field: string]: unknown;
  }

  interface EnrichMeta {
    matched?: number;
    staleness?: string;
    stitchWarning?: boolean;
    nearBudget?: boolean;
    warningCode?: string;
    message?: string;
  }

  interface PreviewState {
    loading: boolean;
    error: string | null;
    row: FederatedRow | null;
    meta: EnrichMeta | null;
  }

  interface Props {
    collection?: Schema | null;
    currentEntry?: Record<string, unknown> | null;
  }

  const { collection = null, currentEntry = null }: Props = $props();

  const enrichments = $derived(
    (collection?.federationEnrichments ?? []) as FederationEnrichment[],
  );

  const currentMode = $derived(mode.value);
  const showPreview = $derived(currentMode === 'edit' && enrichments.length > 0);

  let previews = $state<Record<string, PreviewState>>({});
  let refreshing = $state(false);

  function previewKey(enrichment: FederationEnrichment): string {
    return `${enrichment.virtualSlug}:${enrichment.nativeField}`;
  }

  function displayFields(row: FederatedRow, enrichment: FederationEnrichment): [string, unknown][] {
    const skip = new Set(['_id', '_source', '_relations']);
    const preferred = enrichment.displayFields;
    const entries = Object.entries(row).filter(([k]) => !skip.has(k));
    if (preferred?.length) {
      return preferred
        .filter((f) => f in row)
        .map((f) => [f, row[f]]);
    }
    return entries.slice(0, 6);
  }

  async function loadEnrichment(enrichment: FederationEnrichment) {
    const key = previewKey(enrichment);
    const nativeValue = currentEntry?.[enrichment.nativeField];
    if (nativeValue === undefined || nativeValue === null || nativeValue === '') {
      previews[key] = { loading: false, error: null, row: null, meta: null };
      return;
    }

    previews[key] = { loading: true, error: null, row: null, meta: null };

    try {
      const virtualKeyField = enrichment.virtualKeyField ?? 'id';
      const params = new URLSearchParams({
        keys: String(nativeValue),
        field: virtualKeyField,
        bypassCache: 'true',
      });
      const res = await fetch(
        `/api/virtual-collections/${encodeURIComponent(enrichment.virtualSlug)}/enrich?${params}`,
        { credentials: 'include' },
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? body?.message ?? `Enrich failed (${res.status})`);
      }
      const body = await res.json();
      const stitchKey = String(nativeValue);
      const row = (body.data?.[stitchKey] ?? null) as FederatedRow | null;
      previews[key] = {
        loading: false,
        error: null,
        row,
        meta: (body.meta ?? null) as EnrichMeta | null,
      };
    } catch (err) {
      previews[key] = {
        loading: false,
        error: err instanceof Error ? err.message : String(err),
        row: null,
        meta: null,
      };
    }
  }

  async function loadAll(force = false) {
    if (!showPreview) return;
    if (force) refreshing = true;
    try {
      await Promise.all(enrichments.map((e) => loadEnrichment(e)));
    } finally {
      if (force) refreshing = false;
    }
  }

  async function refreshPreview() {
    await loadAll(true);
  }

  $effect(() => {
    if (!showPreview || !currentEntry) return;
    const signature = enrichments
      .map((e) => `${e.nativeField}:${currentEntry[e.nativeField] ?? ''}`)
      .join('|');
    void signature;
    loadAll();
  });
</script>

{#if showPreview}
  <section
    class="mt-4 border-t border-surface-300 pt-4 dark:border-surface-600"
    data-testid="virtual-entry-preview"
    aria-label="Virtual data preview"
  >
    <div class="flex items-center justify-between gap-2 border-b border-surface-300 pb-2 dark:border-surface-600">
      <h3 class="text-sm font-bold uppercase tracking-wide text-tertiary-500 dark:text-primary-500">
        Virtual Preview
      </h3>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Refresh virtual preview"
        data-testid="virtual-preview-refresh"
        disabled={refreshing}
        onclick={refreshPreview}
      >
        {refreshing ? 'Refreshing…' : 'Refresh'}
      </Button>
    </div>

    <div class="mt-3 space-y-4">
      {#each enrichments as enrichment (previewKey(enrichment))}
        {@const state = previews[previewKey(enrichment)]}
        <article class="rounded border border-surface-200 bg-surface-50 p-3 dark:border-surface-700 dark:bg-surface-900/40">
          <header class="mb-2 flex flex-wrap items-center justify-between gap-2">
            <span class="text-sm font-semibold text-tertiary-500 dark:text-primary-500">
              {enrichment.label}
            </span>
            <div class="flex flex-wrap items-center gap-1">
              {#if state?.meta?.staleness}
                <Badge
                  variant={state.meta.staleness === 'cache' ? 'warning' : 'success'}
                  class="text-[10px]"
                >
                  {state.meta.staleness}
                </Badge>
              {/if}
              <Badge variant="surface" class="text-xs">{enrichment.virtualSlug}</Badge>
            </div>
          </header>

          {#if state?.meta?.stitchWarning}
            <p
              class="mb-2 rounded border border-warning-500/40 bg-warning-50 px-2 py-1 text-xs text-warning-700 dark:bg-warning-900/20 dark:text-warning-400"
              role="status"
              data-testid="stitch-warning"
            >
              {state.meta.message ?? 'High stitch key count — batch enrich requests to avoid N+1 latency.'}
            </p>
          {/if}

          {#if !state || state.loading}
            <p class="text-xs text-surface-500" aria-live="polite">Loading virtual data…</p>
          {:else if state.error}
            <p class="text-xs text-error-600 dark:text-error-400" role="alert">{state.error}</p>
          {:else if !currentEntry?.[enrichment.nativeField]}
            <p class="text-xs text-surface-500">No linked value on this entry.</p>
          {:else if !state.row}
            <p class="text-xs text-surface-500">No matching virtual record found.</p>
          {:else}
            <dl class="space-y-1 text-xs">
              {#each displayFields(state.row, enrichment) as [field, value] (field)}
                <div class="flex justify-between gap-2">
                  <dt class="font-medium capitalize text-surface-600 dark:text-surface-400">{field}</dt>
                  <dd class="truncate text-end font-semibold text-tertiary-500 dark:text-primary-500">
                    {String(value ?? '—')}
                  </dd>
                </div>
              {/each}
            </dl>
            {#if state.meta?.staleness}
              <p class="mt-2 text-[10px] uppercase tracking-wide text-surface-500">
                {state.meta.staleness}{#if state.meta.matched !== undefined} · matched {state.meta.matched}{/if}
              </p>
            {/if}
          {/if}
        </article>
      {/each}
    </div>
  </section>
{/if}