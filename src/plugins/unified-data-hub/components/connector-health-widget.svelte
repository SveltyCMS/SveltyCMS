<!--
  @file src/plugins/unified-data-hub/components/connector-health-widget.svelte
  @component Dashboard widget showing federated connector health summary.
-->
<script lang="ts">
  import AdminCard from '@components/admin-card.svelte';
  import Badge from '@components/ui/badge.svelte';

  interface ConnectorSummary {
    id: string;
    name: string;
    health: string;
    type: string;
  }

  let summary = $state<{
    connectorCount: number;
    virtualCollectionCount: number;
    connectors: ConnectorSummary[];
  } | null>(null);

  let loading = $state(true);

  async function loadHealth() {
    loading = true;
    try {
      const res = await fetch('/api/plugins/unified-data-hub?action=getHealthSummary', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', 'x-plugin-action': 'getHealthSummary' },
        body: JSON.stringify({}),
      });
      if (res.ok) summary = await res.json();
    } catch {
      summary = null;
    } finally {
      loading = false;
    }
  }

  $effect(() => {
    loadHealth();
  });

  function healthVariant(h: string): 'success' | 'warning' | 'error' | 'surface' {
    if (h === 'ok') return 'success';
    if (h === 'degraded') return 'warning';
    if (h === 'down') return 'error';
    return 'surface';
  }
</script>

<AdminCard title="Unified Data Hub" icon="mdi:database-sync">
  {#if loading}
    <p class="text-sm text-surface-500">Loading connector health…</p>
  {:else if !summary}
    <p class="text-sm text-surface-500">Enable Unified Data Hub to view connectors.</p>
  {:else}
    <div class="flex flex-wrap gap-3 text-sm">
      <span>{summary.connectorCount} connectors</span>
      <span>{summary.virtualCollectionCount} virtual collections</span>
    </div>
    <ul class="mt-3 space-y-2">
      {#each summary.connectors as c (c.id)}
        <li class="flex items-center justify-between gap-2">
          <span class="truncate font-medium">{c.name}</span>
          <Badge variant={healthVariant(c.health)}>{c.health}</Badge>
        </li>
      {:else}
        <li class="text-sm text-surface-500">No connectors configured yet.</li>
      {/each}
    </ul>
  {/if}
</AdminCard>