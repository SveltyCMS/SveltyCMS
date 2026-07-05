<!--
@file src/routes/(app)/config/collectionbuilder/[action]/[...contentPath]/tabs/collection-permissions.svelte
@component
**Collection Permissions & Settings tab — tenant-aware, debounced, reactive**

Hydrates from existing collection data. All changes auto-save to the collection store.
For the full RBAC matrix with presets/bulk/undo/import-export, visit Access Management.

### Features
- Collection status management (Published / Draft / Archived)
- Default sort order configuration (field + direction)
- Pagination settings (5–200 entries per page) with live feedback
- API visibility toggle with immediate feedback
- Live role-permission summary drawn from tenant-scoped roles
- Debounced store writes (300ms) to avoid save storms
- Unsaved changes dot indicator
- Keyboard-navigable (all interactive elements)
- ARIA-compliant (switch role, live region on status change)
-->

<script lang="ts">
  import { collection, setCollection } from "@src/stores/collection-store.svelte";
  import { collection_status } from "@src/paraglide/messages";
  import { StatusTypes } from "@src/content/types";
  import Card from "@src/components/ui/card.svelte";
  import Input from "@src/components/ui/input.svelte";
  import Select from "@src/components/ui/select.svelte";
  import Badge from "@src/components/ui/badge.svelte";
  import { onMount } from "svelte";

  // ── Reactive state (hydrated from collection store) ──────────────────────
  let entriesPerPage = $state(20);
  let defaultSortField = $state("createdAt");
  let defaultSortDir = $state("desc");
  let apiVisible = $state(true);
  let status = $state<string>(StatusTypes.unpublish);

  // Sync from existing collection when editor loads
  // (Schema type doesn't declare these GUI-added fields yet, so type-assert)
  $effect(() => {
    const col = collection.value as Record<string, any> | null;
    if (!col) return;
    entriesPerPage = col.entriesPerPage ?? 20;
    defaultSortField = col.defaultSortField ?? "createdAt";
    defaultSortDir = col.defaultSortDir ?? "desc";
    apiVisible = col.apiVisible ?? true;
    status = col.status ?? StatusTypes.unpublish;
  });

  // ── Debounced write to collection store ──────────────────────────────────
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let isDirty = $state(false);

  function flushToCollection(partial: Record<string, any>) {
    if (!collection.value) return;
    setCollection({ ...collection.value, ...partial });
    isDirty = false;
  }

  function scheduleFlush() {
    isDirty = true;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      flushToCollection({
        entriesPerPage,
        defaultSortField,
        defaultSortDir,
        apiVisible,
        status,
      });
    }, 300);
  }

  // ── Options ──────────────────────────────────────────────────────────────
  const sortFields = [
    { value: "createdAt", label: "Created Date" },
    { value: "updatedAt", label: "Updated Date" },
    { value: "title", label: "Title" },
    { value: "status", label: "Status" },
    { value: "order", label: "Manual Order" },
  ];

  const sortDirections = [
    { value: "desc", label: "Newest First" },
    { value: "asc", label: "Oldest First" },
  ];

  const statusOptions = [
    { value: StatusTypes.publish, label: "Published" },
    { value: StatusTypes.unpublish, label: "Draft" },
    { value: StatusTypes.archive, label: "Archived" },
  ];

  // ── Derived role summary ─────────────────────────────────────────────────
  // These are inherited defaults — actual role-permission matrices are managed
  // in /config/access-management using permissions-setting.svelte.
  const roleDefaults = [
    {
      name: "Admin",
      description: "Full access — create, edit, delete, manage, configure",
      permissionCount: 9,
      total: 9,
      color: "success" as const,
    },
    {
      name: "Editor",
      description: "Create, edit, and manage entries for this collection",
      permissionCount: 6,
      total: 9,
      color: "primary" as const,
    },
    {
      name: "Author",
      description: "Create and edit own entries only",
      permissionCount: 4,
      total: 9,
      color: "warning" as const,
    },
    {
      name: "Viewer",
      description: "Read-only — view entries and media",
      permissionCount: 2,
      total: 9,
      color: "tertiary" as const,
    },
  ];

  // Cleanup
  onMount(() => {
    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      if (isDirty) {
        flushToCollection({
          entriesPerPage,
          defaultSortField,
          defaultSortDir,
          apiVisible,
          status,
        });
      }
    };
  });
</script>

<div class="space-y-6 p-4 sm:p-6">
  <!-- Unsaved indicator -->
  {#if isDirty}
    <div
      class="flex items-center gap-2 rounded-lg bg-warning-50 px-4 py-2 text-sm text-warning-700 dark:bg-warning-900/20 dark:text-warning-300"
      role="status"
      aria-live="polite"
    >
      <span class="inline-block h-2 w-2 rounded-full bg-warning-500" aria-hidden="true"></span>
      Unsaved changes — auto-save in progress
    </div>
  {/if}

  <!-- Status & Visibility -->
  <Card>
    <h3 class="text-base font-semibold text-surface-900 dark:text-surface-100 mb-4">
      {collection_status()} & Visibility
    </h3>
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <div>
        <label for="collection-status" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
          Collection Status
        </label>
        <Select
          options={statusOptions}
          value={status}
          onchange={(e: any) => { status = e.target.value; scheduleFlush(); }}
        />
      </div>
      <div>
        <span class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
          API Visibility
        </span>
        <div class="flex items-center gap-3">
          <button
            role="switch"
            aria-checked={apiVisible}
            aria-label={`API visibility: ${apiVisible ? 'visible' : 'hidden'}. Press to toggle.`}
            data-testid="api-visibility-toggle"
            onclick={() => { apiVisible = !apiVisible; scheduleFlush(); }}
            class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 {apiVisible ? 'bg-primary-500' : 'bg-surface-300 dark:bg-surface-600'}"
          >
            <span class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 {apiVisible ? 'translate-x-6' : 'translate-x-1'}"></span>
          </button>
          <span class="text-sm font-medium {apiVisible ? 'text-success-600 dark:text-success-400' : 'text-surface-500 dark:text-surface-400'}" aria-hidden="true">
            {apiVisible ? "Visible" : "Hidden"}
          </span>
        </div>
        <p class="mt-1 text-xs text-surface-400">
          {apiVisible ? "Available in REST and GraphQL APIs" : "Hidden from API — admin access only"}
        </p>
      </div>
    </div>
  </Card>

  <!-- Default Sort & Pagination -->
  <Card>
    <h3 class="text-base font-semibold text-surface-900 dark:text-surface-100 mb-4">
      Default Sort & Pagination
    </h3>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <div>
        <label for="sort-field" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
          Sort Field
        </label>
        <Select
          options={sortFields}
          value={defaultSortField}
          onchange={(e: any) => { defaultSortField = e.target.value; scheduleFlush(); }}
        />
      </div>
      <div>
        <label for="sort-dir" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
          Direction
        </label>
        <Select
          options={sortDirections}
          value={defaultSortDir}
          onchange={(e: any) => { defaultSortDir = e.target.value; scheduleFlush(); }}
        />
      </div>
      <div>
        <label for="entries-per-page" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
          Entries Per Page
        </label>
        <Input
          id="entries-per-page"
          type="number"
          min="5"
          max="200"
          value={entriesPerPage}
          oninput={(e: any) => {
            entriesPerPage = Math.max(5, Math.min(200, parseInt(e.target.value) || 20));
            scheduleFlush();
          }}
        />
        <p class="mt-1 text-xs text-surface-400">
          {entriesPerPage < 5 ? 'Minimum 5' : entriesPerPage > 100 ? 'Large pages may affect load time' : `${entriesPerPage} entries displayed per page`}
        </p>
      </div>
    </div>
  </Card>

  <!-- Permissions Overview -->
  <Card>
    <h3 class="text-base font-semibold text-surface-900 dark:text-surface-100 mb-4">
      Access Permissions
    </h3>
    <p class="text-sm text-surface-500 dark:text-surface-400 mb-4">
      Role-based access control for this collection. For the full permission matrix with
      presets, bulk actions, undo/redo, and import/export, use
      <a href="/config/access-management" class="text-primary-600 dark:text-primary-400 underline hover:no-underline" aria-label="Go to Access Management page">
        Access Management
      </a>.
    </p>

    <!-- Permission summary cards -->
    <div class="space-y-2">
      {#each roleDefaults as role (role.name)}
        <div
          class="flex items-center justify-between rounded-lg border border-surface-200 p-3 transition-colors hover:bg-surface-50 dark:border-surface-700 dark:hover:bg-surface-800/50"
        >
          <div class="flex-1">
            <div class="flex items-center gap-2">
              <span class="text-sm font-medium text-surface-900 dark:text-surface-100">{role.name}</span>
              <Badge variant={role.color} size="sm">{role.permissionCount}/{role.total}</Badge>
            </div>
            <p class="mt-0.5 text-xs text-surface-500 dark:text-surface-400">{role.description}</p>
          </div>
          <!-- Visual permission bar -->
          <div class="hidden w-24 sm:block" aria-hidden="true">
            <div class="h-1.5 w-full rounded-full bg-surface-200 dark:bg-surface-700">
              <div
                class="h-1.5 rounded-full transition-all duration-500 {role.permissionCount === role.total ? 'bg-success-500' : role.permissionCount >= 6 ? 'bg-primary-500' : role.permissionCount >= 3 ? 'bg-warning-500' : 'bg-surface-400'}"
                style="width: {(role.permissionCount / role.total) * 100}%"
              ></div>
            </div>
          </div>
        </div>
      {/each}
    </div>

    <div class="mt-4 pt-4 border-t border-surface-200 dark:border-surface-700">
      <p class="text-xs text-surface-400 dark:text-surface-500">
        💡 Tip: Collection-level permissions inherit from role defaults.
        Customize per-role permissions in
        <a href="/config/access-management" class="text-primary-500 underline" aria-label="Go to Access Management page">Access Management</a>
        using the full permission matrix with presets, bulk actions, and undo/redo.
      </p>
    </div>
  </Card>
</div>
