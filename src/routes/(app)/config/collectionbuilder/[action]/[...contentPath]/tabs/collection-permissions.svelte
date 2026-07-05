<!--
@file src/routes/(app)/config/collectionbuilder/[action]/[...contentPath]/tabs/collection-permissions.svelte
@component
**Collection Permissions & Special Settings tab**

### Features
- Collection status management (Published / Draft)
- Default sort order configuration
- Pagination settings (entries per page)
- API visibility toggle
- Role-based permission overview
-->

<script lang="ts">
  import { collection, setCollection } from "@src/stores/collection-store.svelte";
  import { collection_status } from "@src/paraglide/messages";
  import { StatusTypes } from "@src/content/types";
  import Card from "@src/components/ui/card.svelte";
  import Input from "@src/components/ui/input.svelte";
  import Select from "@src/components/ui/select.svelte";
  import Badge from "@src/components/ui/badge.svelte";
  import { untrack } from "svelte";

  let entriesPerPage = $state(20);
  let defaultSortField = $state("createdAt");
  let defaultSortDir = $state("desc");
  let apiVisible = $state(true);
  let status = $state(StatusTypes.unpublish);

  const sortFields = [
    { value: "createdAt", label: "Created Date" },
    { value: "updatedAt", label: "Updated Date" },
    { value: "title", label: "Title" },
    { value: "status", label: "Status" },
  ];

  const sortDirections = [
    { value: "desc", label: "Newest First" },
    { value: "asc", label: "Oldest First" },
  ];

  const statusOptions = [
    { value: StatusTypes.publish, label: "Published" },
    { value: StatusTypes.unpublish, label: "Draft" },
  ];

  function updateCollection(partial: Record<string, any>) {
    if (!collection.value) return;
    setCollection({ ...collection.value, ...partial });
  }

  $effect(() => {
    untrack(() => {
      updateCollection({ entriesPerPage, defaultSortField, defaultSortDir, apiVisible, status });
    });
  });
</script>

<div class="space-y-6 p-4 sm:p-6">
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
          onchange={(e: any) => status = e.target.value}
        />
      </div>
      <div>
        <span class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
          API Visibility
        </span>
        <button
          role="switch"
          aria-checked={apiVisible}
          aria-label="Toggle API visibility"
          data-testid="api-visibility-toggle"
          onclick={() => apiVisible = !apiVisible}
          class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 {apiVisible ? 'bg-primary-500' : 'bg-surface-300 dark:bg-surface-600'}"
        >
          <span class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 {apiVisible ? 'translate-x-6' : 'translate-x-1'}"></span>
        </button>
        <span class="ms-3 text-sm text-surface-600 dark:text-surface-400">
          {apiVisible ? "Visible" : "Hidden"}
        </span>
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
          onchange={(e: any) => defaultSortField = e.target.value}
        />
      </div>
      <div>
        <label for="sort-dir" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
          Direction
        </label>
        <Select
          options={sortDirections}
          value={defaultSortDir}
          onchange={(e: any) => defaultSortDir = e.target.value}
        />
      </div>
      <div>
        <label for="entries-per-page" class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
          Entries Per Page
        </label>
        <Input
          type="number"
          min="5"
          max="200"
          value={entriesPerPage}
          oninput={(e: any) => entriesPerPage = Math.max(5, Math.min(200, parseInt(e.target.value) || 20))}
        />
      </div>
    </div>
  </Card>

  <!-- Permissions Overview -->
  <Card>
    <h3 class="text-base font-semibold text-surface-900 dark:text-surface-100 mb-4">
      Access Permissions
    </h3>
    <p class="text-sm text-surface-500 dark:text-surface-400 mb-4">
      Role-based access control for this collection. For detailed role-permission matrix editing,
      use the
      <a href="/config/access-management" class="text-primary-600 dark:text-primary-400 underline hover:no-underline" aria-label="Go to Access Management page">
        Access Management
      </a>
      page which provides bulk actions, presets, undo/redo, and import/export.
    </p>
    <div class="space-y-3">
      <div class="flex items-center justify-between p-3 rounded-lg bg-surface-50 dark:bg-surface-800">
        <div>
          <span class="text-sm font-medium text-surface-700 dark:text-surface-300">Admin</span>
          <p class="text-xs text-surface-500">Full access — manage, create, delete, configure</p>
        </div>
        <Badge variant="success">Default</Badge>
      </div>
      <div class="flex items-center justify-between p-3 rounded-lg bg-surface-50 dark:bg-surface-800">
        <div>
          <span class="text-sm font-medium text-surface-700 dark:text-surface-300">Editor</span>
          <p class="text-xs text-surface-500">Create, edit, and manage entries</p>
        </div>
        <Badge variant="success">Default</Badge>
      </div>
      <div class="flex items-center justify-between p-3 rounded-lg bg-surface-50 dark:bg-surface-800">
        <div>
          <span class="text-sm font-medium text-surface-700 dark:text-surface-300">Viewer</span>
          <p class="text-xs text-surface-500">Read-only — view entries and media</p>
        </div>
        <Badge variant="success">Default</Badge>
      </div>
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
