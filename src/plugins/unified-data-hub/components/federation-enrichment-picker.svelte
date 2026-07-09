<!--
  @file src/plugins/unified-data-hub/components/federation-enrichment-picker.svelte
  @component Collection Builder — configure native → virtual enrichment for entry sidebar preview.

  ### Props (collection_builder slot)
  - `isCollectionEditor` (boolean): shown only in collection editor permissions tab

  ### Features:
  - Lists virtual collections from /api/virtual-collections
  - Maps native db_fieldName → virtual slug
  - Persists to collection store (saved with collection on Submit)
-->
<script lang="ts">
  import Card from '@components/ui/card.svelte';
  import Button from '@components/ui/button.svelte';
  import Input from '@components/ui/input.svelte';
  import Select from '@components/ui/select.svelte';
  import Badge from '@components/ui/badge.svelte';
  import type { FederationEnrichment, FieldInstance } from '@src/content/types';
  import { collection, setCollection } from '@src/stores/collection-store.svelte';
  import { normalizeFederationEnrichments } from '@plugins/unified-data-hub/server/federation-enrichment-utils';

  interface Props {
    isCollectionEditor?: boolean;
  }

  const { isCollectionEditor = false }: Props = $props();

  interface VirtualOption {
    slug: string;
    name: string;
  }

  let virtualOptions = $state<VirtualOption[]>([]);
  let loadError = $state<string | null>(null);
  let loadingVirtual = $state(false);
  let enrichments = $state<FederationEnrichment[]>([]);
  let lastSyncedCollectionId = $state<string | null>(null);

  const nativeFieldOptions = $derived(
    ((collection.value?.fields ?? []) as FieldInstance[])
      .map((f) => f.db_fieldName)
      .filter((name): name is string => Boolean(name))
      .map((value) => ({ value, label: value })),
  );

  const collectionKey = $derived(
    String(collection.value?._id ?? collection.value?.name ?? ''),
  );

  const virtualSelectOptions = $derived(
    virtualOptions.map((v) => ({ value: v.slug, label: `${v.name} (${v.slug})` })),
  );

  function persist(next: FederationEnrichment[]) {
    const normalized = normalizeFederationEnrichments(next);
    enrichments = normalized;
    if (collection.value) {
      setCollection({ ...collection.value, federationEnrichments: normalized });
    }
  }

  function addEnrichment() {
    const firstField = nativeFieldOptions[0]?.value ?? '';
    const firstVirtual = virtualOptions[0]?.slug ?? '';
    persist([
      ...enrichments,
      {
        label: 'Virtual Preview',
        nativeField: firstField,
        virtualSlug: firstVirtual,
        virtualKeyField: 'id',
        displayFields: [],
      },
    ]);
  }

  function removeEnrichment(index: number) {
    persist(enrichments.filter((_, i) => i !== index));
  }

  function patchEnrichment(index: number, patch: Partial<FederationEnrichment>) {
    persist(enrichments.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  }

  async function loadVirtualCollections() {
    loadingVirtual = true;
    loadError = null;
    try {
      const res = await fetch('/api/virtual-collections', { credentials: 'include' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? body?.message ?? `HTTP ${res.status}`);
      }
      const body = await res.json();
      virtualOptions = (body.data ?? []).map((row: { slug: string; name: string }) => ({
        slug: row.slug,
        name: row.name,
      }));
    } catch (err) {
      loadError = err instanceof Error ? err.message : String(err);
      virtualOptions = [];
    } finally {
      loadingVirtual = false;
    }
  }

  $effect(() => {
    if (!isCollectionEditor) return;
    void loadVirtualCollections();
  });

  $effect(() => {
    if (!isCollectionEditor || !collectionKey) return;
    if (collectionKey === lastSyncedCollectionId) return;
    lastSyncedCollectionId = collectionKey;
    enrichments = normalizeFederationEnrichments(collection.value?.federationEnrichments);
  });
</script>

{#if isCollectionEditor}
  <Card data-testid="federation-enrichment-picker">
    <div class="mb-4 flex flex-wrap items-center justify-between gap-2">
      <div>
        <h3 class="text-base font-semibold text-surface-900 dark:text-surface-100">
          Virtual Enrichment Preview
        </h3>
        <p class="mt-1 text-xs text-surface-500 dark:text-surface-400">
          Link a native field to a virtual collection. Entry editor sidebar shows live federated data.
        </p>
      </div>
      <Badge variant="surface">Unified Data Hub</Badge>
    </div>

    {#if loadingVirtual}
      <p class="text-sm text-surface-500" role="status">Loading virtual collections…</p>
    {:else if loadError}
      <p class="text-sm text-warning-600 dark:text-warning-400" role="alert">
        {loadError}. Enable Unified Data Hub and configure at least one virtual collection.
      </p>
    {:else if virtualOptions.length === 0}
      <p class="text-sm text-surface-500">
        No virtual collections yet.
        <a href="/config?plugin=unified-data-hub" class="text-primary-500 underline" data-preload="hover" aria-label="Open Unified Hub workspace">
          Open Unified Hub
        </a>
      </p>
    {/if}

    <div class="space-y-3">
      {#each enrichments as enrichment, index (`${enrichment.nativeField}-${enrichment.virtualSlug}-${index}`)}
        <div
          class="rounded-lg border border-surface-200 p-3 dark:border-surface-700"
          data-testid="federation-enrichment-row"
        >
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input
              label="Sidebar label"
              value={enrichment.label}
              oninput={(e) =>
                patchEnrichment(index, { label: (e.currentTarget as HTMLInputElement).value })}
            />
            <Select
              label="Native field"
              options={nativeFieldOptions}
              value={enrichment.nativeField}
              onchange={(val) => patchEnrichment(index, { nativeField: val })}
            />
            <Select
              label="Virtual collection"
              options={virtualSelectOptions}
              value={enrichment.virtualSlug}
              onchange={(val) => patchEnrichment(index, { virtualSlug: val })}
            />
            <Input
              label="Virtual key field"
              value={enrichment.virtualKeyField ?? 'id'}
              oninput={(e) =>
                patchEnrichment(index, {
                  virtualKeyField: (e.currentTarget as HTMLInputElement).value,
                })}
            />
            <Input
              label="Display fields (comma-separated)"
              value={(enrichment.displayFields ?? []).join(', ')}
              oninput={(e) => {
                const raw = (e.currentTarget as HTMLInputElement).value;
                patchEnrichment(index, {
                  displayFields: raw
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean),
                });
              }}
            />
          </div>
          <div class="mt-3 flex justify-end">
            <Button
              variant="error"
              size="sm"
              type="button"
              aria-label="Remove enrichment"
              onclick={() => removeEnrichment(index)}
            >
              Remove
            </Button>
          </div>
        </div>
      {/each}
    </div>

    <div class="mt-4">
      <Button
        variant="outline"
        type="button"
        onclick={addEnrichment}
        disabled={nativeFieldOptions.length === 0}
        data-testid="add-federation-enrichment"
      >
        Add virtual enrichment
      </Button>
    </div>
  </Card>
{/if}