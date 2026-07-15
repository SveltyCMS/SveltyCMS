<!--
 @file src/routes/(app)/config/collectionbuilder/[action]/[...contentPath]/tabs/collection-widget/modal-widget-form.svelte
 @component 3-tab widget edit modal: Default, Settings, Permissions
-->
<script lang="ts">
  import Tabs from "@components/ui/tabs.svelte";
  import Button from "@components/ui/button.svelte";
  import Input from "@components/ui/input.svelte";
  import IconifyIconsPicker from "@components/iconify-icons-picker.svelte";
  import InputSwitch from "@src/components/system/builder/input-switch.svelte";
  import {
    button_cancel,
    button_delete,
    button_save,
  } from "@src/paraglide/messages";
  import {
    setTargetWidget,
  } from "@src/stores/collection-store.svelte";
  import { widgets } from "@src/stores/widget-store.svelte.ts";
  import { modalState } from "@utils/modal.svelte";
  import type { Role } from "@src/databases/auth/types";
  import { SvelteSet } from "svelte/reactivity";

  // --- Props ---
  interface Props {
    title?: string;
    body?: string;
    value: any;
    response?: (r: any) => void;
    roles?: Role[];
  }

  const {
    value,
    response,
    roles: rolesProp = [],
  }: Props = $props() as Props;

  // --- Tab state ---
  let activeTab = $state("default");

  const tabDefs = [
    { id: "default", label: "Default", icon: "mdi:text-box-outline" },
    { id: "settings", label: "Settings", icon: "mdi:tune" },
    { id: "permissions", label: "Permissions", icon: "mdi:shield-lock-outline" },
  ];

  // --- Local working copy ---
  let local = $state<any>(null);

  $effect(() => {
    if (value) {
      local = JSON.parse(JSON.stringify(value));
    } else {
      local = { label: "", db_fieldName: "", icon: "", required: false, permissions: {}, widget: {} };
    }
  });

  // --- Widget metadata ---
  const widgetKey = $derived(
    local?.widget?.key || (local?.widget?.Name?.toLowerCase() as string) || "",
  );
  const widgetFn = $derived(widgets.widgetFunctions?.[widgetKey]);
  const guiSchema = $derived(
    (widgetFn?.GuiSchema as Record<string, { widget: any }>) || {},
  );

  // --- Filter default vs specific fields from GuiSchema ---
  const DEFAULT_KEYS = new Set([
    "label", "db_fieldName", "required", "translated",
    "icon", "helper", "width", "permissions", "display",
    "placeholder", "default",
  ]);

  const specificKeys = $derived(
    Object.keys(guiSchema).filter((k) => !DEFAULT_KEYS.has(k)),
  );

  // --- Auto-generate db_fieldName from label ---
  function labelToDbName(label: string): string {
    return label
      .trim()
      .toLowerCase()
      .replace(/\s+/g, "_")
      .replace(/[^a-z0-9_]/g, "") || "field";
  }

  $effect(() => {
    if (local && !local.db_fieldName && local.label) {
      local.db_fieldName = labelToDbName(local.label);
    }
  });

  // --- Field update helper ---
  function updateField(key: string, val: any) {
    if (!local) return;
    local = { ...local, [key]: val };
  }

  // --- Save ---
  function handleSave() {
    if (!local) return;
    // Sync local back to store
    setTargetWidget(local);
    if (response) {
      response(local);
    }
    modalState.close();
  }

  // --- Delete ---
  function handleDelete() {
    if (!local) return;
    const confirmMsg = "Are you sure you want to delete this widget?";
    if (!confirm(confirmMsg)) return;
    if (response) {
      response({ ...local, __delete: true });
    }
    modalState.close();
  }

  // --- Duplicate ---
  function handleDuplicate() {
    if (!local) return;
    if (response) {
      response({ ...local, __duplicate: true });
    }
    modalState.close();
  }

  // --- Cancel ---
  function handleCancel() {
    modalState.close();
  }

  // --- Permissions helpers ---
  // Derive local permissions (support both matrix and WidgetFieldPermissions shapes)
  const DEFAULT_PERMISSIONS = {
    visibility: "public" as const,
    requiredAuth: false,
    readRoles: [] as string[],
    writeRoles: [] as string[],
  };

  function normalizePermissions(raw: unknown) {
    if (!raw || typeof raw !== "object") return { ...DEFAULT_PERMISSIONS };
    const o = raw as Record<string, unknown>;
    // New shape
    if ("visibility" in o || "readRoles" in o || "writeRoles" in o) {
      return {
        visibility: (o.visibility as string) ?? DEFAULT_PERMISSIONS.visibility,
        requiredAuth: (o.requiredAuth as boolean) ?? false,
        readRoles: Array.isArray(o.readRoles) ? [...o.readRoles as string[]] : [],
        writeRoles: Array.isArray(o.writeRoles) ? [...o.writeRoles as string[]] : [],
      };
    }
    // Legacy matrix shape: { [roleId]: { view: true, edit: true } }
    const matrix = raw as Record<string, Record<string, boolean>>;
    const readRoles: string[] = [];
    const writeRoles: string[] = [];
    for (const [roleId, perms] of Object.entries(matrix)) {
      if (perms?.view || perms?.read) readRoles.push(roleId);
      if (perms?.edit || perms?.write) writeRoles.push(roleId);
    }
    return {
      visibility: "public" as const,
      requiredAuth: false,
      readRoles,
      writeRoles,
    };
  }

  const localPerms = $derived(normalizePermissions(local?.permissions));

  function updatePerms(partial: Record<string, unknown>) {
    if (!local) return;
    const merged = { ...localPerms, ...partial };
    local = { ...local, permissions: merged };
  }

  function toggleRoleView(roleId: string) {
    const set = new SvelteSet(localPerms.readRoles);
    if (set.has(roleId)) set.delete(roleId);
    else set.add(roleId);
    updatePerms({ readRoles: [...set] });
  }

  function toggleRoleEdit(roleId: string) {
    const set = new SvelteSet(localPerms.writeRoles);
    if (set.has(roleId)) set.delete(roleId);
    else set.add(roleId);
    updatePerms({ writeRoles: [...set] });
  }
</script>

{#if local}
  <div class="flex flex-col w-full" style="min-width: 640px; max-width: 900px; min-height: 500px;">
    <!-- Header -->
    <div class="border-b border-surface-200 dark:border-surface-800 px-6 py-4">
      <h2 class="text-lg font-bold text-surface-900 dark:text-white">
        Edit Field: <span class="text-primary-500">{local.label || "Unnamed"}</span>
      </h2>
      <p class="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
        Widget type: {widgetKey || "unknown"}
      </p>
    </div>

    <!-- Tabs -->
    <div class="px-6 pt-4">
      <Tabs tabs={tabDefs} bind:activeTab variant="underline" />
    </div>

    <!-- Tab Content -->
    <div class="flex-1 overflow-y-auto px-6 py-5 space-y-5">
      {#if activeTab === "default"}
        <!-- Tab 1: Default -->
        <div class="space-y-4">
          <Input
            label="Field Label"
            bind:value={local.label}
            placeholder="e.g. Profile Picture"
            oninput={() => {
              if (!local.db_fieldName) {
                local.db_fieldName = labelToDbName(local.label);
              }
            }}
          />

          <div>
            <span class="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1.5">
              Icon
            </span>
            <IconifyIconsPicker bind:icon={local.icon} />
          </div>

          <Input
            label="Database Field Name"
            bind:value={local.db_fieldName}
            placeholder="e.g. profile_picture"
          />

          <Input
            label="Placeholder"
            bind:value={local.placeholder}
            placeholder="Placeholder text shown when field is empty"
          />

          <Input
            label="Default Value"
            bind:value={local.default}
            placeholder="Default value for this field"
          />

          <div class="flex items-center justify-between p-3 rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900/50">
            <div>
              <p class="text-sm font-semibold text-surface-800 dark:text-surface-200">Required</p>
              <p class="text-xs text-surface-500 dark:text-surface-400">Must be filled to save content</p>
            </div>
            <input
              type="checkbox"
              bind:checked={local.required}
              class="h-5 w-5 rounded border-surface-300 text-primary-600 focus:ring-primary-500 dark:bg-surface-800 dark:border-surface-600"
            />
          </div>

          <Input
            label="Help Text / Description"
            bind:value={local.helper}
            placeholder="Help text shown below the field"
          />

          <Input
            label="Width"
            bind:value={local.width}
            placeholder="e.g. 1/2, 1/3, full"
          />
        </div>

      {:else if activeTab === "settings"}
        <!-- Tab 2: Settings (widget-specific GuiFields) -->
        {#if specificKeys.length > 0}
          <div class="space-y-3">
            <p class="text-xs font-bold uppercase tracking-widest text-surface-500 dark:text-surface-400">
              {widgetKey} Settings
            </p>
            {#each specificKeys as key (key)}
              <InputSwitch
                value={local[key]}
                icon={local.icon as string}
                widget={guiSchema[key]?.widget}
                {key}
                onupdate={(e: { value: any }) => updateField(key, e.value)}
              />
            {/each}
          </div>
        {:else}
          <div class="flex flex-col items-center justify-center py-12 text-surface-400 dark:text-surface-500 space-y-2">
            <iconify-icon icon="mdi:tune" width="40" class="opacity-20"></iconify-icon>
            <p class="text-sm">No specific settings for this widget type</p>
            <p class="text-xs">The <span class="font-semibold">{widgetKey || "selected"}</span> widget has no additional configuration options.</p>
          </div>
        {/if}

      {:else if activeTab === "permissions"}
        <!-- Tab 3: Permissions (role-based view/edit matrix) -->
        <div class="space-y-5">
          <!-- Visibility toggle -->
          <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900/30 p-4">
            <h4 class="mb-2 text-xs font-bold uppercase tracking-[0.24em] text-surface-500 dark:text-surface-400">Visibility</h4>
            <button
              type="button"
              class="flex w-full items-center justify-between rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 px-4 py-3 text-left hover:border-primary-500/50 transition-colors"
              onclick={() => updatePerms({ visibility: localPerms.visibility === "public" ? "private" : "public" })}
            >
              <span class="font-semibold text-surface-800 dark:text-surface-200">
                {localPerms.visibility === "public" ? "Public" : "Private"}
              </span>
              <iconify-icon
                icon={localPerms.visibility === "public" ? "mdi:eye" : "mdi:eye-off"}
                width="20"
                class="text-surface-400"
              ></iconify-icon>
            </button>
            <p class="mt-2 text-xs text-surface-500 dark:text-surface-400">
              {localPerms.visibility === "public"
                ? "Field is visible to everyone by default."
                : "Field is restricted; only allowed roles can access."}
            </p>
          </div>

          <!-- Require auth -->
          <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900/30 p-4">
            <label class="flex cursor-pointer items-center gap-3 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 p-3">
              <input
                type="checkbox"
                class="h-4 w-4 rounded border-surface-300 text-primary-600 focus:ring-primary-500 dark:bg-surface-800 dark:border-surface-600"
                checked={localPerms.requiredAuth}
                onchange={(e) => updatePerms({ requiredAuth: (e.target as HTMLInputElement).checked })}
              />
              <span class="text-sm font-semibold text-surface-800 dark:text-surface-200">Require authentication</span>
            </label>
            <p class="mt-2 text-xs text-surface-500 dark:text-surface-400">
              When enabled, user must be logged in to access this field.
            </p>
          </div>

          <!-- Role matrix -->
          {#if rolesProp.length > 0}
            <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-900/30 p-4">
              <h4 class="mb-3 text-xs font-bold uppercase tracking-[0.24em] text-surface-500 dark:text-surface-400">
                Role-Based Access — Per-Field Matrix
              </h4>
              <p class="mb-4 text-xs text-surface-500 dark:text-surface-400">
                Configure which roles can view or edit this specific field.
                Empty selection means no role restriction (follows visibility setting).
              </p>

              <!-- Table header -->
              <div class="grid grid-cols-[1fr_60px_60px] gap-2 mb-2 px-2">
                <span class="text-xs font-semibold text-surface-600 dark:text-surface-400">Role</span>
                <span class="text-xs font-semibold text-surface-600 dark:text-surface-400 text-center">View</span>
                <span class="text-xs font-semibold text-surface-600 dark:text-surface-400 text-center">Edit</span>
              </div>

              <div class="space-y-1">
                {#each rolesProp as role (role._id)}
                  <div class="grid grid-cols-[1fr_60px_60px] gap-2 items-center rounded-lg px-3 py-2 hover:bg-surface-100 dark:hover:bg-surface-800/50 transition-colors">
                    <span class="text-sm text-surface-800 dark:text-surface-200 truncate">
                      {role.name ?? role._id}
                    </span>
                    <div class="flex justify-center">
                      <input
                        type="checkbox"
                        checked={localPerms.readRoles.includes(role._id)}
                        onchange={() => toggleRoleView(role._id)}
                        class="h-4 w-4 rounded border-surface-300 text-primary-600 focus:ring-primary-500 dark:bg-surface-800 dark:border-surface-600"
                        aria-label="View permission for {role.name}"
                      />
                    </div>
                    <div class="flex justify-center">
                      <input
                        type="checkbox"
                        checked={localPerms.writeRoles.includes(role._id)}
                        onchange={() => toggleRoleEdit(role._id)}
                        class="h-4 w-4 rounded border-surface-300 text-primary-600 focus:ring-primary-500 dark:bg-surface-800 dark:border-surface-600"
                        aria-label="Edit permission for {role.name}"
                      />
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {:else}
            <div class="rounded-xl border border-dashed border-surface-200 dark:border-surface-700 bg-surface-50/30 dark:bg-surface-900/10 p-6 text-center">
              <iconify-icon icon="mdi:shield-account-outline" width="32" class="text-surface-400 opacity-30 mb-2"></iconify-icon>
              <p class="text-sm text-surface-500 dark:text-surface-400">
                No roles defined. Configure roles in Access Management to restrict by role.
              </p>
            </div>
          {/if}
        </div>
      {/if}
    </div>

    <!-- Footer -->
    <div class="flex items-center justify-between border-t border-surface-200 dark:border-surface-800 px-6 py-4 bg-surface-50 dark:bg-surface-900/50">
      <div class="flex gap-2">
        <Button variant="error" type="button" onclick={handleDelete}>
          <iconify-icon icon="mdi:trash-can-outline" width="18"></iconify-icon>
          <span class="hidden sm:inline ml-1">{button_delete()}</span>
        </Button>
        <Button variant="tertiary" type="button" onclick={handleDuplicate}>
          <iconify-icon icon="mdi:content-copy" width="18"></iconify-icon>
          <span class="hidden sm:inline ml-1">Duplicate</span>
        </Button>
      </div>

      <div class="flex gap-3">
        <Button variant="outline" type="button" onclick={handleCancel}>
          {button_cancel()}
        </Button>
        <Button variant="tertiary" type="button" onclick={handleSave}>
          <iconify-icon icon="mdi:content-save" width="18"></iconify-icon>
          <span class="ml-1">{button_save()}</span>
        </Button>
      </div>
    </div>
  </div>
{/if}
