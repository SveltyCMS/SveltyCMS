<!--
  @file src/plugins/unified-data-hub/components/hub-workspace.svelte
  @component Unified Data Hub plugin workspace — connector & virtual collection management.

  Features:
  - Postgres, MariaDB, SQLite, MongoDB, and REST connector forms
  - Virtual collection mapping (SQL table, MongoDB collection, or WordPress REST preset)
  - Connector health test
  - Community tier limit display
-->
<script lang="ts">
  import AdminCard from '@components/admin-card.svelte';
  import Button from '@components/ui/button.svelte';
  import Input from '@components/ui/input.svelte';
  import Select from '@components/ui/select.svelte';
  import Checkbox from '@components/ui/checkbox.svelte';
  import UpgradePrompt from '@components/ui/upgrade-prompt.svelte';
  import { pluginWorkspace } from '@stores/plugin-workspace.svelte';

  let connectors = $state<any[]>([]);
  let collections = $state<any[]>([]);
  let limits = $state<any>(null);
  let loading = $state(true);
  let error = $state('');
  let savingConnector = $state(false);
  let savingCollection = $state(false);
  let testingId = $state('');

  let connName = $state('');
  type ConnectorKind = 'postgres' | 'mariadb' | 'sqlite' | 'mongodb' | 'rest';

  let connType = $state<ConnectorKind>('postgres');
  let connHost = $state('127.0.0.1');
  let connPort = $state('5432');
  let connDatabase = $state('sveltycms_test');
  let connSchema = $state('public');
  let connFilePath = $state('./data/federation.db');
  let connUser = $state('postgres');
  let connPassword = $state('');
  let connBaseUrl = $state('https://example.com');
  let connAllowedHosts = $state('example.com');
  let connWritesEnabled = $state(false);
  let connApiKey = $state('');

  let vcName = $state('');
  let vcSlug = $state('');
  let vcConnectorId = $state('');
  let vcTable = $state('');
  let vcSchema = $state('public');
  let vcPreset = $state<'sql-table' | 'mongodb-collection' | 'wordpress-posts'>('sql-table');
  let vcCollection = $state('');

  async function callAction(action: string, body: Record<string, unknown> = {}) {
    const res = await fetch(`/api/plugins/unified-data-hub?action=${action}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', 'x-plugin-action': action },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || data.message || res.statusText);
    return data;
  }

  async function refresh() {
    loading = true;
    error = '';
    try {
      const [c, v, l] = await Promise.all([
        callAction('listConnectors'),
        callAction('listVirtualCollections'),
        callAction('getTierLimits'),
      ]);
      connectors = c.connectors ?? [];
      collections = v.collections ?? [];
      limits = l.limits ?? null;
      if (!vcConnectorId && connectors.length > 0) {
        vcConnectorId = connectors[0]._id;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  }

  async function saveConnector() {
    savingConnector = true;
    error = '';
    try {
      const body: Record<string, unknown> = {
        name: connName.trim(),
        type: connType,
        enabled: true,
      };
      if (connType === 'rest') {
        body.config = { baseUrl: connBaseUrl.trim(), writesEnabled: connWritesEnabled };
        body.writesEnabled = connWritesEnabled;
        body.allowedHosts = connAllowedHosts
          .split(',')
          .map((h) => h.trim())
          .filter(Boolean);
        if (connApiKey.trim()) {
          body.credentials = { apiKey: connApiKey.trim() };
        }
      } else if (connType === 'sqlite') {
        body.config = { filePath: connFilePath.trim() };
      } else {
        const defaultPorts: Record<string, number> = {
          postgres: 5432,
          mariadb: 3306,
          mongodb: 27017,
        };
        body.config = {
          host: connHost.trim(),
          port: Number(connPort) || defaultPorts[connType] || 5432,
          database: connDatabase.trim(),
          ...(connType === 'postgres' ? { schema: connSchema.trim() || 'public' } : {}),
        };
        body.credentials = {
          username: connUser.trim(),
          password: connPassword,
        };
      }
      await callAction('saveConnector', body);
      connName = '';
      connPassword = '';
      await refresh();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      savingConnector = false;
    }
  }

  async function testConnector(connectorId: string) {
    testingId = connectorId;
    error = '';
    try {
      await callAction('testConnector', { connectorId });
      await refresh();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      testingId = '';
    }
  }

  async function saveCollection() {
    savingCollection = true;
    error = '';
    try {
      const body: Record<string, unknown> = {
        connectorId: vcConnectorId,
        enabled: true,
      };
      if (vcPreset === 'wordpress-posts') {
        body.wordpressResource = 'posts';
      } else if (vcPreset === 'mongodb-collection') {
        body.name = vcName.trim();
        body.slug = vcSlug.trim();
        body.source = { collection: vcCollection.trim() };
        body.fields = [
          { name: 'id', label: 'ID', sourceField: '_id', type: 'text' },
          { name: 'title', label: 'Title', sourceField: 'title', type: 'text' },
          { name: 'slug', label: 'Slug', sourceField: 'slug', type: 'text' },
        ];
      } else {
        body.name = vcName.trim();
        body.slug = vcSlug.trim();
        body.source = { table: vcTable.trim(), schema: vcSchema.trim() || 'public' };
        body.fields = [
          { name: 'id', label: 'ID', sourceField: 'id', type: 'number' },
          { name: 'title', label: 'Title', sourceField: 'title', type: 'text' },
          { name: 'slug', label: 'Slug', sourceField: 'slug', type: 'text' },
        ];
      }
      await callAction('saveVirtualCollection', body);
      vcName = '';
      vcSlug = '';
      vcTable = '';
      await refresh();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    } finally {
      savingCollection = false;
    }
  }

  const connectorOptions = $derived(
    connectors.map((c) => ({ value: c._id, label: `${c.name} (${c.type})` })),
  );

  const showUpgradePrompt = $derived.by(() => {
    if (!limits || limits.tier === 'pro') return false;
    const atConnectorCap =
      limits.maxConnectors !== null && limits.connectorCount >= limits.maxConnectors;
    const atCollectionCap =
      limits.maxVirtualCollections !== null &&
      limits.virtualCollectionCount >= limits.maxVirtualCollections;
    return atConnectorCap || atCollectionCap;
  });

  const tierLabel = $derived.by(() => {
    if (!limits) return '';
    const tier = limits.tier === 'pro' ? 'Pro' : 'Community';
    const conn =
      limits.maxConnectors === null
        ? `${limits.connectorCount} connectors`
        : `${limits.connectorCount}/${limits.maxConnectors} connectors`;
    const vc =
      limits.maxVirtualCollections === null
        ? `${limits.virtualCollectionCount} virtual collections`
        : `${limits.virtualCollectionCount}/${limits.maxVirtualCollections} virtual collections`;
    return `${tier} tier · ${conn} · ${vc}`;
  });

  $effect(() => {
    refresh();
  });
</script>

<div class="flex h-full flex-col gap-4 p-4 md:p-6" data-testid="udh-workspace">
  <div class="flex items-center justify-between gap-4">
    <div>
      <h2 class="text-lg font-semibold">Unified Data Hub</h2>
      <p class="text-sm text-surface-500">
        Federate Postgres, MariaDB, SQLite, MongoDB, and REST sources as governed virtual collections.
      </p>
      {#if tierLabel}
        <p class="mt-1 text-xs text-surface-400" data-testid="udh-tier-label">{tierLabel}</p>
      {/if}
    </div>
    <Button variant="ghost" onclick={() => pluginWorkspace.close()} aria-label="Close workspace">
      Close
    </Button>
  </div>

  {#if error}
    <p class="text-sm text-error-600" role="alert">{error}</p>
  {/if}

  {#if showUpgradePrompt}
    <UpgradePrompt
      extensionId="plugin:unified-data-hub"
      price="Pro — unlimited connectors & virtual collections"
      title="Community tier limit reached"
      message="Upgrade to Pro to add more connectors and virtual collections, plus priority SaaS connector packs."
    />
  {/if}

  <div class="grid gap-4 lg:grid-cols-2">
    <AdminCard title="Connectors">
      <form
        class="mb-4 space-y-3 border-b border-surface-100 pb-4 dark:border-surface-700"
        data-testid="udh-add-connector-form"
        onsubmit={(e) => {
          e.preventDefault();
          saveConnector();
        }}
      >
        <Input label="Name" bind:value={connName} required data-testid="udh-connector-name" />
        <Select
          label="Type"
          bind:value={connType}
          options={[
            { value: 'postgres', label: 'Postgres' },
            { value: 'mariadb', label: 'MariaDB / MySQL' },
            { value: 'sqlite', label: 'SQLite (file)' },
            { value: 'mongodb', label: 'MongoDB' },
            { value: 'rest', label: 'REST / OpenAPI' },
          ]}
        />
        {#if connType === 'sqlite'}}
          <Input
            label="File path"
            bind:value={connFilePath}
            data-testid="udh-connector-file-path"
          />
        {:else if connType !== 'rest'}
          <div class="grid gap-3 sm:grid-cols-2">
            <Input label="Host" bind:value={connHost} data-testid="udh-connector-host" />
            <Input label="Port" bind:value={connPort} data-testid="udh-connector-port" />
            <Input label="Database" bind:value={connDatabase} data-testid="udh-connector-database" />
            {#if connType === 'postgres'}
              <Input label="Schema" bind:value={connSchema} data-testid="udh-connector-schema" />
            {/if}
            <Input label="Username" bind:value={connUser} data-testid="udh-connector-user" />
            <Input
              label="Password"
              type="password"
              bind:value={connPassword}
              data-testid="udh-connector-password"
            />
          </div>
        {:else}
          <Input label="Base URL" bind:value={connBaseUrl} data-testid="udh-connector-base-url" />
          <Input
            label="Allowed hosts (comma-separated)"
            bind:value={connAllowedHosts}
            data-testid="udh-connector-allowed-hosts"
          />
          <Input
            label="API key (Bearer, optional)"
            type="password"
            bind:value={connApiKey}
            data-testid="udh-connector-api-key"
          />
          <Checkbox
            bind:checked={connWritesEnabled}
            label="Enable write-back (POST/PATCH/DELETE)"
            description="Off by default. Requires explicit allowlist hosts and collection:write RBAC."
          />
        {/if}
        <Button
          type="submit"
          variant="primary"
          disabled={savingConnector || !connName.trim()}
          aria-label="Save connector"
          data-testid="udh-save-connector"
        >
          {savingConnector ? 'Saving…' : 'Add connector'}
        </Button>
      </form>

      {#if loading}
        <p class="text-sm text-surface-500">Loading…</p>
      {:else if connectors.length === 0}
        <p class="text-sm text-surface-500">No connectors yet.</p>
      {:else}
        <ul class="space-y-2 text-sm">
          {#each connectors as c (c._id)}
            <li
              class="flex flex-wrap items-center justify-between gap-2 border-b border-surface-100 pb-2 dark:border-surface-700"
            >
              <span class="font-medium">{c.name}</span>
              <span class="flex items-center gap-2 text-surface-500">
                {c.type} · {c.health}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={testingId === c._id}
                  onclick={() => testConnector(c._id)}
                  aria-label="Test connector health"
                  data-testid="udh-test-connector"
                >
                  Test
                </Button>
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    </AdminCard>

    <AdminCard title="Virtual Collections">
      <form
        class="mb-4 space-y-3 border-b border-surface-100 pb-4 dark:border-surface-700"
        data-testid="udh-add-collection-form"
        onsubmit={(e) => {
          e.preventDefault();
          saveCollection();
        }}
      >
        <Select
          label="Preset"
          bind:value={vcPreset}
          options={[
            { value: 'sql-table', label: 'SQL table (Postgres / MariaDB / SQLite)' },
            { value: 'mongodb-collection', label: 'MongoDB collection' },
            { value: 'wordpress-posts', label: 'WordPress posts (REST)' },
          ]}
        />
        <Select
          label="Connector"
          bind:value={vcConnectorId}
          options={connectorOptions}
          disabled={connectorOptions.length === 0}
        />
        {#if vcPreset === 'sql-table' || vcPreset === 'mongodb-collection'}
          <Input label="Name" bind:value={vcName} required data-testid="udh-collection-name" />
          <Input label="Slug" bind:value={vcSlug} required data-testid="udh-collection-slug" />
          {#if vcPreset === 'mongodb-collection'}
            <Input
              label="Collection"
              bind:value={vcCollection}
              required
              data-testid="udh-collection-mongo"
            />
          {:else}
            <div class="grid gap-3 sm:grid-cols-2">
              <Input label="Table" bind:value={vcTable} required data-testid="udh-collection-table" />
              <Input label="Schema" bind:value={vcSchema} data-testid="udh-collection-schema" />
            </div>
          {/if}
        {/if}
        <Button
          type="submit"
          variant="primary"
          disabled={savingCollection || !vcConnectorId || ((vcPreset === 'sql-table' || vcPreset === 'mongodb-collection') && (!vcName.trim() || !vcSlug.trim() || (vcPreset === 'sql-table' ? !vcTable.trim() : !vcCollection.trim())))}
          aria-label="Save virtual collection"
          data-testid="udh-save-collection"
        >
          {savingCollection ? 'Saving…' : 'Add virtual collection'}
        </Button>
      </form>

      {#if loading}
        <p class="text-sm text-surface-500">Loading…</p>
      {:else if collections.length === 0}
        <p class="text-sm text-surface-500">No virtual collections configured.</p>
      {:else}
        <ul class="space-y-2 text-sm">
          {#each collections as vc (vc._id)}
            <li class="flex justify-between gap-2 border-b border-surface-100 pb-2 dark:border-surface-700">
              <span class="font-medium">{vc.name}</span>
              <span class="text-surface-500">{vc.slug}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </AdminCard>
  </div>

  <AdminCard title="Headless API">
    <p class="text-sm text-surface-600 dark:text-surface-400">
      Read via <code class="text-xs">GET /api/virtual-collections/:slug</code> or
      <code class="text-xs">cms.virtualCollections.find()</code>. Writable SQL/Mongo connectors support
      <code class="text-xs">POST/PATCH/DELETE</code> and <code class="text-xs">cms.virtualCollections.create/update/delete()</code>.
    </p>
  </AdminCard>
</div>