<!--
@file src/components/collection-display/fields.svelte
@component
**Fields is a core component that renders collection fields for data entry and provides revision history.**

### Features:
- **Widget Rendering**: Automatically loads and renders appropriate widgets for each field.
- **Reactivity**: Binds form data to the `collectionValue` store with real-time sync.
- **Revision History**: Displays entry revisions with compare and revert functionality.
- **Validation**: Performs field-level validation based on schema constraints.
- **Per-Field Localization**: Each translated field stores a `Record<Locale, string>`, with inline locale switching and AI translation per field.
- **AI Translation**: One-click AI translation button per field using the `/api/ai/translate` endpoint.

### Props
- `fields` (Array): The array of field instances from the collection schema.
- `revisions` (Array): Historical snapshot data for the current entry.
- `contentLanguage` (String): The language for data entry (GUI remains in systemLanguage).

### Keyboard Shortcuts
- `Alt + S`: Save currently edited entry (if focused)
-->
<script lang="ts">
  import { logger } from "@utils/logger";
  import { getFieldName } from "@utils/utils";
  import { untrack } from "svelte";

  // Auth & Page data
  import { page } from "$app/state";

  const user = $derived(page.data?.user);
  const tenantId = $derived(page.data?.tenantId);

  	import Tabs from "@components/ui/tabs";
  import SystemTooltip from "@src/components/system/system-tooltip.svelte";
  import {
    applayout_version,
    button_edit,
    Fields_no_widgets_found,
    form_required,
  } from "@src/paraglide/messages";
  import type { Locale } from "@src/paraglide/runtime";
  // Stores
  import {
    collection,
    collectionValue,
    setCollectionValue,
  } from "@src/stores/collection-store.svelte";
  import { publicEnv } from "@src/stores/global-settings.svelte";
  import {
    contentLanguage,
    dataChangeStore,
    translationProgress,
    validationStore,
  } from "@src/stores/store.svelte.ts";
  import { toast } from "@src/stores/toast.svelte.ts";
  import {
    widgetFunctions as widgetFunctionsStore,
    widgets,
  } from "@src/stores/widget-store.svelte";
  import { showConfirm } from "@utils/modal.svelte";
  import WidgetLoader from "./widget-loader.svelte";

  	import Portal from "@components/ui/portal.svelte";
  import RevisionDiffModal from "./revision-diff-modal.svelte";

  let isDiffModalOpen = $state(false);

  // --- PERFORMANCE FIX: DYNAMIC WIDGET IMPORTS ---
  // Lazy-load widgets for code-splitting (eager: false is default)
  // Returns loader functions instead of eager-loaded components
  const modules: Record<string, () => Promise<{ default: any }>> =
    import.meta.glob("../../widgets/**/*.svelte") as Record<
      string,
      () => Promise<{ default: any }>
    >;

  // Plugin Slot System
  import { slotRegistry } from "@src/plugins/slot-registry";
  import { activeInputStore } from "@src/stores/active-input-store.svelte";

  // Token Picker
  // Token Picker

  function openTokenPicker(field: any, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();

    // Fallback: Try to find the input by ID (using db_fieldName as ID)
    const id = field.db_fieldName;
    const el = document.getElementById(id) as
      | HTMLInputElement
      | HTMLTextAreaElement;
    if (el) {
      el.focus();
      activeInputStore.set({ element: el, field }); // Explicitly open picker on button click
    } else {
      console.warn("Could not find input for field", field);
    }
  }
  // --- END PERFORMANCE FIX ---

  let widgetFunctions = $state<Record<string, any>>({});
  $effect(() => {
    const unsubscribe = widgetFunctionsStore.subscribe((value) => {
      widgetFunctions = value;
    });
    return unsubscribe;
  });

  // --- 1. RECEIVE DATA AS PROPS ---
  let {
    fields,
    revisions = [],
    // contentLanguage prop received but not directly used - widgets access contentLanguage store
  } = $props<{
    fields?: NonNullable<(typeof collection)["value"]>["fields"];
    revisions?: any[];
    contentLanguage?: string; // Passed for documentation, widgets use store directly
  }>();

  // --- 2. SIMPLIFIED STATE ---
  let localTabSet = $state("0");
  let apiUrl = $state("");

  // This is form state, not fetched data, so it remains.
  let currentCollectionValue = $state<Record<string, any>>({});

  // Revisions State (now simpler)
  let selectedRevisionId = $state("");

  // Track the last entry ID to detect when switching entries
  let lastEntryId = $state<string | undefined>(undefined);

  // Track current content language for reactivity
  let currentContentLanguage = $state<Locale>(contentLanguage.value as Locale);

  // --- PER-FIELD LOCALE STATE ---
  // Maps field dbFieldName -> currently displayed locale for that field
  let fieldLocaleOverrides = $state(new Map<string, Locale>());
  // Tracks which fields have been manually overridden by the user
  let manuallyOverridden = $state(new Set<string>());
  // AI translate loading state per field
  let aiTranslatingFields = $state(new Set<string>());

  /**
   * Cycles a translated field's locale to the next available language.
   */
  function cycleFieldLocale(fieldName: string, currentLocale: Locale) {
    const langs = availableLanguages;
    if (langs.length <= 1) return;
    const currentIdx = langs.indexOf(currentLocale);
    const nextIdx = (currentIdx + 1) % langs.length;
    const nextLocale = langs[nextIdx];
    fieldLocaleOverrides.set(fieldName, nextLocale);
    manuallyOverridden.add(fieldName);
  }

  /**
   * AI-translates a field's value from source locale to target locale.
   */
  async function aiTranslateField(field: any, fieldName: string, sourceLocale: Locale, targetLocale: Locale) {
    if (aiTranslatingFields.has(fieldName)) return;
    const currentValue = currentCollectionValue[fieldName];
    let sourceText = "";
    if (typeof currentValue === "object" && currentValue !== null && !Array.isArray(currentValue)) {
      sourceText = (currentValue as Record<string, string>)[sourceLocale] || "";
    } else if (typeof currentValue === "string") {
      sourceText = currentValue;
    }
    if (!sourceText.trim()) {
      toast.warning(`No source text in ${sourceLocale.toUpperCase()} to translate from`);
      return;
    }

    aiTranslatingFields.add(fieldName);
    try {
      const res = await fetch("/api/ai/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: sourceText,
          sourceLang: sourceLocale,
          targetLang: targetLocale,
          field: field.label || fieldName,
          collection: collection.value?.name || "unknown",
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        toast.error(errData.message || `Translation failed (${res.status})`);
        return;
      }
      const data = await res.json();
      if (data.translatedText) {
        // Update the per-field locale value
        let fieldValue = currentCollectionValue[fieldName];
        if (typeof fieldValue === "object" && fieldValue !== null && !Array.isArray(fieldValue)) {
          fieldValue = { ...fieldValue as Record<string, string> };
        } else {
          fieldValue = { [sourceLocale]: typeof fieldValue === "string" ? fieldValue : "" };
        }
        (fieldValue as Record<string, string>)[targetLocale] = data.translatedText;
        currentCollectionValue[fieldName] = fieldValue;
        // Update store and track translation progress
        setCollectionValue({ ...currentCollectionValue });
        const fieldPath = `${collection.value?.name}.${fieldName}`;
        translationProgress.markFieldTranslated(targetLocale, fieldPath);
        toast.success(`Translated to ${targetLocale.toUpperCase()}`);
      } else {
        toast.warning(data.message || "AI translation unavailable");
      }
    } catch (err) {
      logger.error("[AI Translate] Error:", err);
      toast.error("AI translation failed. Check if Ollama is running.");
    } finally {
      aiTranslatingFields.delete(fieldName);
    }
  }

  // React to contentLanguage store changes and update local state
  // This ensures widgets remount with the correct language
  $effect(() => {
    const newLang = contentLanguage.value as Locale;
    if (currentContentLanguage !== newLang) {
      logger.debug("Language changed:", currentContentLanguage, "→", newLang);
      logger.debug(
        "Current collectionValue keys:",
        Object.keys(currentCollectionValue),
      );
      // Update immediately to trigger {#key} block
      currentContentLanguage = newLang;
      // Also update per-field locale overrides for fields NOT manually overridden
      for (const [fieldName] of fieldLocaleOverrides) {
        if (!manuallyOverridden.has(fieldName)) {
          fieldLocaleOverrides.set(fieldName, newLang);
        }
      }
      logger.debug(
        "Updated currentContentLanguage to:",
        currentContentLanguage,
      );
    }
  });

  // --- 3. DERIVED STATE FROM PROPS ---
  let selectedRevision = $derived(
    Array.isArray(revisions)
      ? revisions.find((r: any) => r._id === selectedRevisionId) || null
      : null,
  );

  // --- 4. SIMPLIFIED LOGIC ---
  let derivedFields = $derived(fields || []);

  // Track changes to translation progress for debugging
  $effect(() => {
    logger.debug("Translation progress updated:", {
      showProgress: translationProgress.value?.show,
      languages: Object.keys(translationProgress.value || {}).filter(
        (k) => k !== "show",
      ),
    });
  });

  // Get available languages
  let availableLanguages = $derived.by<Locale[]>(() => {
    // Wait for publicEnv to be initialized
    const languages = publicEnv?.AVAILABLE_CONTENT_LANGUAGES;
    if (!(languages && Array.isArray(languages))) {
      return ["en"] as Locale[];
    }
    return languages as Locale[];
  });

  function ensureFieldProperties(field: any) {
    if (!field) {
      return null;
    }
    return {
      ...field,
      db_fieldName: field.db_fieldName || getFieldName(field, true),
      widget: field.widget || { Name: field.type || "Input" },
      permissions: field.permissions || {},
    };
  }

  let filteredFields = $derived(
    derivedFields
      .map(ensureFieldProperties)
      .filter(Boolean)
      .filter((field: any) => {
        if (!field.permissions || page.data?.isAdmin || !user?.role) {
          return true;
        }
        const rolePermissions = field.permissions[user.role];
        return !rolePermissions || rolePermissions.read !== false;
      }),
  );

  // Sync local form state with global store
  // When collectionValue changes (new entry loaded), update local state
  // When local state changes (user editing), update global state
  $effect(() => {
    const global = collectionValue.value as Record<string, unknown> | undefined;
    const globalId = (global as any)?._id;

    // When a new entry is loaded (different ID), pull from global -> local
    if (globalId && globalId !== lastEntryId) {
      logger.debug("Loading entry data:", globalId);
      currentCollectionValue = { ...global } as any;
      lastEntryId = globalId;
      // Set initial snapshot for change tracking
      dataChangeStore.setInitialSnapshot(global as Record<string, any>);
      return;
    }

    // If creating new entry (no ID), initialize with global state
    if (
      !(globalId || lastEntryId) &&
      global &&
      Object.keys(global).length > 0
    ) {
      logger.debug("Initializing new entry");
      currentCollectionValue = { ...global } as any;
      // Set initial snapshot for change tracking
      dataChangeStore.setInitialSnapshot(global as Record<string, any>);
      return;
    }

    // Otherwise, push local changes to global (user is editing)
    // Use untrack to read currentCollectionValue without creating a dependency loop
    const local = untrack(() => currentCollectionValue) as
      | Record<string, unknown>
      | undefined;
    if (local && Object.keys(local).length > 0) {
      const currentDataStr = JSON.stringify(local);
      const globalDataStr = JSON.stringify(global ?? {});
      if (currentDataStr !== globalDataStr) {
        logger.debug("Pushing local changes to global store");
        untrack(() => setCollectionValue({ ...local }));
        // Track changes for save button state
        dataChangeStore.compareWithCurrent(local as Record<string, any>);
      }
    }
  });

  // Separate effect to detect changes in currentCollectionValue and sync to store
  // This is needed because the widget bind:value updates currentCollectionValue
  let lastLocalValueStr = $state<string>("");
  $effect(() => {
    // React to currentCollectionValue changes (from widget inputs)
    const localStr = JSON.stringify(currentCollectionValue);

    // Skip if this is the initial load or empty
    if (
      !currentCollectionValue ||
      Object.keys(currentCollectionValue).length === 0
    ) {
      return;
    }

    // Only update if value actually changed
    if (localStr !== lastLocalValueStr) {
      logger.debug("currentCollectionValue changed, syncing to store");
      lastLocalValueStr = localStr;

      // Update the global store (using untrack to avoid creating dependency)
      const global = untrack(() => collectionValue.value);
      const globalStr = JSON.stringify(global ?? {});

      if (localStr !== globalStr) {
        untrack(() => setCollectionValue({ ...currentCollectionValue }));
        // Track changes for save button state
        dataChangeStore.compareWithCurrent(
          currentCollectionValue as Record<string, any>,
        );
      }
    }
  });

  // --- 5. REFACTORED REVISION LOGIC ---
  function handleRevert() {
    if (!selectedRevision?.data) {
      return;
    }
    showConfirm({
      title: "Confirm Revert",
      body: "Are you sure you want to revert to this version? Any unsaved changes will be lost.",
      confirmText: "Revert",
      onConfirm: () => {
        const revertData = {
          ...selectedRevision.data,
          _id: (collectionValue as any).value?._id,
        };
        setCollectionValue(revertData);
        currentCollectionValue = revertData; // also update local state
        toast.info("Content reverted. Please save your changes.");
        localTabSet = "0";
      },
    });
  }

  // --- 6. VALIDATION LOGIC ---
  // Reactively validate fields whenever values change
  $effect(() => {
    const values = currentCollectionValue; // React to value changes

    // Iterate over fields to validate them
    filteredFields.forEach((field: any) => {
      if (field.required) {
        const fieldName = getFieldName(field, false);
        const value = values[fieldName];

        // Check for empty values
        // Handle various types: string, array, null, undefined
        const isEmpty =
          value === null ||
          value === undefined ||
          (typeof value === "string" && value.trim() === "") ||
          (Array.isArray(value) && value.length === 0);

        if (isEmpty) {
          // Only set error if it's not already set to avoid loop (though store handles this)
          if (!validationStore.hasError(fieldName)) {
            validationStore.setError(
              fieldName,
              `${field.label || fieldName} is required`,
            );
          }
        } else if (validationStore.hasError(fieldName)) {
          validationStore.clearError(fieldName);
        }
      }
    });
  });

  $effect(() => {
    if ((collectionValue as any).value?._id) {
      apiUrl = `${location.origin}/api/collection/${collection.value?._id}/${(collectionValue as any).value._id}`;
    }
  });

  // --- 7. PLUGIN SLOTS ---
  const entryEditSlots = $derived(
    slotRegistry.getSlots("entry_edit").filter(
      (slot) =>
        !slot.condition ||
        slot.condition({
          collection: collection.value,
          entry: (collectionValue as any).value,
        }),
    ),
  );
</script>

<h1 class="sr-only">
  {collection.value?.name
    ? `Edit ${collection.value.name} Entry`
    : "Edit Entry"}
</h1>

{#if !widgets.isLoaded}
  <div class="flex h-64 flex-col items-center justify-center gap-4">
    <div
      class="h-12 w-12 animate-spin rounded-full border-4 border-surface-200 border-t-primary-500"
    ></div>
    <p class="text-surface-500 animate-pulse">Initializing widgets...</p>
  </div>
{:else}
  <Tabs
    value={localTabSet}
    onValueChange={(e) => (localTabSet = e.value)}
    class="flex flex-1 flex-col items-center"
  >
    <Tabs.List
      class="flex justify-between md:justify-around rounded-tl-container rounded-tr-container border-b border-tertiary-500 dark:border-primary-500 w-full"
    >
      <Tabs.Trigger value="0" class="flex-1">
        <div class="flex items-center justify-center gap-2 py-2">
          <iconify-icon
            icon="mdi:pen"
            width="20"
            class="text-tertiary-500 dark:text-primary-500"
          ></iconify-icon>
          {button_edit()}
        </div>
      </Tabs.Trigger>

      {#if collection.value?.revision}
        <Tabs.Trigger value="1" class="flex-1">
          <div class="flex items-center justify-center gap-2 py-2">
            <iconify-icon
              icon="mdi:history"
              width="20"
              class="text-tertiary-500 dark:text-primary-500"
            ></iconify-icon>
            {applayout_version()}
            <span class="preset-filled-secondary-500 badge"
              >{revisions.length}</span
            >
          </div>
        </Tabs.Trigger>
      {/if}

      {#if user?.isAdmin}
        <Tabs.Trigger value="3" class="flex-1">
          <div class="flex items-center justify-center gap-2 py-2">
            <iconify-icon
              icon="mdi:api"
              width="20"
              class="text-tertiary-500 dark:text-primary-500"
            ></iconify-icon>
            API
          </div>
        </Tabs.Trigger>
      {/if}

      <!-- Plugin Slots Triggers -->
      {#each entryEditSlots as slot (slot.id)}
        <Tabs.Trigger value={slot.id} class="flex-1">
          <div class="flex items-center justify-center gap-2 py-2">
            {#if slot.props?.icon}
              <iconify-icon
                icon={slot.props.icon}
                width="20"
                class="text-tertiary-500 dark:text-primary-500"
              ></iconify-icon>
            {:else}
              <iconify-icon
                icon="mdi:puzzle-outline"
                width="20"
                class="text-tertiary-500 dark:text-primary-500"
              ></iconify-icon>
            {/if}
            {slot.props?.label || slot.id}
          </div>
        </Tabs.Trigger>
      {/each}

      <Tabs.Indicator />
    </Tabs.List>

    <Tabs.Content value="0" class="w-full">
      <div class="mb-2 text-center text-xs text-error-500">
        {form_required()}
      </div>
      <div
        class="rounded-md border bg-white px-4 py-6 drop-shadow-2xl dark:border-surface-500 dark:bg-surface-900"
      >
        <div
          class="flex flex-wrap items-center justify-center gap-1 overflow-auto"
        >
          {#each filteredFields as rawField (rawField.db_fieldName || rawField.id || rawField.label || rawField.name)}
            {#if rawField.widget}
              {const field = ensureFieldProperties(rawField)}
              <div
                class="mx-auto text-center {!field?.width
                  ? 'w-full '
                  : 'max-md:w-full!'}"
                style={"min-width:min(300px,100%);" +
                  (field.width
                    ? `width:calc(${(field.width / 12) * 100}% - 0.5rem)`
                    : "")}
              >
                <div
                  class="flex items-center justify-between gap-2 px-1.25 text-start field-label"
                >
                  <!-- Field label -->
                  <div class="flex items-center gap-2">
                    <p class="inline-block font-semibold capitalize">
                      {field.label || field.db_fieldName}
                      {#if field.required}
                        <span class="text-error-500">*</span>
                      {/if}
                    </p>
                    {#if field.helper}
                      <SystemTooltip
                        title={field.helper}
                        positioning={{ placement: "top" }}
                      >
                        <iconify-icon
                          icon="mdi:help-circle-outline"
                          width="14"
                          aria-hidden="true"
                        ></iconify-icon>
                      </SystemTooltip>
                    {/if}
                  </div>
                  <div class="flex items-center gap-2">
                    <SystemTooltip title="Insert Token">
                      <button
                        type="button"
                        onclick={(e) => openTokenPicker(field, e)}
                        class=""
                        aria-label="Insert token into {field.label}"
                      >
                        <iconify-icon
                          icon="mdi:code-braces"
                          width="16"
                          class="font-bold text-tertiary-500 dark:text-primary-500"
                        ></iconify-icon>
                      </button>
                    </SystemTooltip>
                    <!-- Per-Field Locale Badge + AI Translate -->
                    {#if field.translated}
                      {@const fieldName = getFieldName(field, false)}
                      {@const currentFieldLocale = (() => {
                        // Determine the current locale for this field
                        if (fieldLocaleOverrides.has(fieldName)) {
                          return fieldLocaleOverrides.get(fieldName)!;
                        }
                        // Initialize from global contentLanguage
                        fieldLocaleOverrides.set(fieldName, currentContentLanguage);
                        return currentContentLanguage;
                      })()}
                      {@const sourceLocale = contentLanguage.value as Locale}
                      {@const isTranslating = aiTranslatingFields.has(fieldName)}
                      <div class="flex items-center gap-1">
                        <!-- Locale badge / switcher -->
                        <button
                          type="button"
                          class="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium transition-colors hover:bg-tertiary-100 dark:hover:bg-primary-500/20"
                          style="background: var(--color-surface-200, #e5e7eb); color: var(--color-tertiary-500, #6b7280)"
                          onclick={() => cycleFieldLocale(fieldName, currentFieldLocale)}
                          aria-label="Switch locale for {field.label || fieldName}. Current: {currentFieldLocale.toUpperCase()}"
                        >
                          <iconify-icon icon="bi:translate" width="14" aria-hidden="true"></iconify-icon>
                          <span class="text-tertiary-600 dark:text-primary-400">{currentFieldLocale.toUpperCase()}</span>
                          {#if availableLanguages.length > 1}
                            <iconify-icon icon="mdi:chevron-down" width="10" aria-hidden="true"></iconify-icon>
                          {/if}
                        </button>
                        <!-- AI Translate button -->
                        {#if availableLanguages.length > 1 && currentFieldLocale !== sourceLocale}
                          <button
                            type="button"
                            class="flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs transition-colors hover:bg-purple-100 dark:hover:bg-purple-500/20"
                            style="color: var(--color-purple-500, #a855f7)"
                            onclick={() => aiTranslateField(field, fieldName, sourceLocale, currentFieldLocale)}
                            disabled={isTranslating}
                            aria-label="AI translate {field.label || fieldName} from {sourceLocale.toUpperCase()} to {currentFieldLocale.toUpperCase()}"
                          >
                            {#if isTranslating}
                              <iconify-icon icon="svg-spinners:3-dots-scale" width="14" aria-hidden="true"></iconify-icon>
                            {:else}
                              <iconify-icon icon="mdi:auto-fix" width="14" aria-hidden="true"></iconify-icon>
                            {/if}
                          </button>
                        {/if}
                      </div>
                    {/if}
                    <!-- Icon for field type -->
                    {#if field.icon}
                      <iconify-icon
                        icon={field.icon}
                        width="20"
                        class="text-tertiary-500 dark:text-primary-500"
                      ></iconify-icon>
                    {/if}
                  </div>
                </div>

                {#if field.widget}
                  {const widgetName = field.widget.Name}

                  <!-- --- PERFORMANCE FIX: ROBUST WIDGET FINDER --- -->
                  {const loadedWidget = (() => {
                    // 1. Try exact path from widget store (fastest)
                    const storePath =
                      widgetFunctions[widgetName]?.componentPath;
                    if (storePath && storePath in modules)
                      return modules[storePath];

                    // 2. Try casing variations from store
                    const camelPath =
                      widgetFunctions[
                        widgetName.charAt(0).toLowerCase() + widgetName.slice(1)
                      ]?.componentPath;
                    if (camelPath && camelPath in modules)
                      return modules[camelPath];

                    const lowerPath =
                      widgetFunctions[widgetName.toLowerCase()]?.componentPath;
                    if (lowerPath && lowerPath in modules)
                      return modules[lowerPath];

                    // 3. Robust Search in modules (fallback)
                    const normalized = widgetName.toLowerCase();
                    const kebabMatch = normalized
                      .replace(/([a-z])([A-Z])/g, "$1-$2")
                      .toLowerCase();
                    const flatMatch = normalized.replace(/-/g, "");

                    for (const path in modules) {
                      const lowerPath = path.toLowerCase();
                      const parts = lowerPath.split("/");
                      const fileName = parts.pop();
                      const folderName = parts.pop();

                      // A. Match 3-Pillar Structure: /WidgetName/Input.svelte
                      // IMPORTANT: Enforce folder name matches widget name (handle kebab-case and flat naming)
                      const isFolderMatch =
                        folderName === normalized ||
                        folderName === kebabMatch ||
                        folderName === flatMatch ||
                        folderName?.replace(/-/g, "") === flatMatch;

                      if (isFolderMatch && fileName === "input.svelte")
                        return modules[path];

                      // B. Match 3-Pillar Index: /WidgetName/index.svelte
                      if (isFolderMatch && fileName === "index.svelte")
                        return modules[path];

                      // C. Match Single File: /WidgetName.svelte
                      // EXCEPTION: Do not loosely match "Input.svelte" as it causes collisions with standard 3-pillar components
                      if (
                        fileName === `${normalized}.svelte` &&
                        normalized !== "input"
                      )
                        return modules[path];
                      if (
                        fileName === `${kebabMatch}.svelte` &&
                        kebabMatch !== "input"
                      )
                        return modules[path];
                    }
                    return null;
                  })()}

                  {#if loadedWidget}
                    {const fieldName = getFieldName(field, false)}
                    {#if field.translated}
                      <!-- Per-field localization: determine locale, handle legacy migration -->
                      {@const fieldLocale = (() => {
                        if (fieldLocaleOverrides.has(fieldName)) {
                          return fieldLocaleOverrides.get(fieldName)!;
                        }
                        fieldLocaleOverrides.set(fieldName, currentContentLanguage);
                        return currentContentLanguage;
                      })()}
                      <!-- Legacy migration: wrap plain string in locale record -->
                      {#if typeof currentCollectionValue[fieldName] === "string"}
                        {@const migrated = { [currentContentLanguage]: currentCollectionValue[fieldName] }}
                        {currentCollectionValue[fieldName] = migrated}
                      {/if}
                      <!-- Ensure it's an object for per-locale access -->
                      {#if typeof currentCollectionValue[fieldName] !== "object" || currentCollectionValue[fieldName] === null}
                        {currentCollectionValue[fieldName] = { [fieldLocale]: "" }}
                      {/if}
                      {#key fieldName + ":" + fieldLocale}
                        <!-- Widget remounts when per-field locale changes -->
                        <WidgetLoader
                          loader={loadedWidget}
                          field={{ ...field, translated: false }}
                          WidgetData={{}}
                          bind:value={currentCollectionValue[fieldName][fieldLocale]}
                          {tenantId}
                          collectionName={collection.value?.name}
                        />
                      {/key}
                    {:else}
                      {#key currentContentLanguage}
                        <!-- Widget remounts when currentContentLanguage changes -->
                        <WidgetLoader
                          loader={loadedWidget}
                          {field}
                          WidgetData={{}}
                          bind:value={currentCollectionValue[fieldName]}
                          {tenantId}
                          collectionName={collection.value?.name}
                        />
                      {/key}
                    {/if}
                  {:else}
                    <p class="text-error-500">
                      {Fields_no_widgets_found({ name: widgetName })}
                    </p>
                  {/if}
                  <!-- --- END PERFORMANCE FIX --- -->
                {/if}
              </div>
            {/if}
          {/each}
        </div>
      </div>
    </Tabs.Content>
    <Tabs.Content value="1" class="w-full">
      <div class="p-4">
        {#if revisions.length === 0}
          <p class="p-4 text-center text-surface-500">
            No revision history found for this entry.
          </p>
        {:else}
          <div class="mb-4 flex items-center justify-between gap-4">
            <select class="select grow" bind:value={selectedRevisionId}>
              <option value="" disabled
                >-- Select a revision to compare --</option
              >
              {#each revisions as revision (revision._id)}
                <option value={revision._id}
                  >{new Date(revision.revision_at).toLocaleString()} by {revision.revision_by.substring(
                    0,
                    8,
                  )}...</option
                >
              {/each}
            </select>
            <button
              class="preset-filled-tertiary-500 dark:preset-filled-primary-500 btn"
              onclick={handleRevert}
              disabled={!selectedRevision?.data}
            >
              <iconify-icon icon="mdi:restore" class="mr-1"></iconify-icon>
              {applayout_version()}
            </button>
            <button
              class="preset-tonal-primary btn"
              onclick={() => (isDiffModalOpen = true)}
              disabled={!selectedRevision?.data}
            >
              <iconify-icon icon="mdi:compare" class="mr-1"></iconify-icon>
              Compare
            </button>
          </div>

          {#if isDiffModalOpen && selectedRevision}
            <Portal>
              <div
                class="fixed inset-0 z-1000 flex items-center justify-center bg-surface-900/60 p-4 backdrop-blur-sm"
                onclick={() => (isDiffModalOpen = false)}
                onkeydown={(e) =>
                  e.key === "Escape" && (isDiffModalOpen = false)}
                role="button"
                tabindex="-1"
              >
                <div onclick={(e) => e.stopPropagation()} role="presentation">
                  <RevisionDiffModal
                    oldData={selectedRevision.data}
                    newData={currentCollectionValue}
                    fields={derivedFields}
                    oldLabel="Revision ({new Date(
                      selectedRevision.revision_at,
                    ).toLocaleDateString()})"
                    newLabel="Current Content"
                    close={() => (isDiffModalOpen = false)}
                  />
                </div>
              </div>
            </Portal>
          {/if}

          <div class="rounded-lg border p-4 dark:text-surface-50">
            <h3 class="mb-3 text-lg font-bold">Quick Preview</h3>

            {#if selectedRevision}
              {const diffObject = selectedRevision?.diff || null}
              {#if diffObject && Object.keys(diffObject).length > 0}
                <div class="space-y-3 font-mono text-sm">
                  {#each Object.entries(diffObject) as [key, change] (key)}
                    {const ch = change as any}
                    <div>
                      <strong
                        class="font-bold text-surface-600 dark:text-surface-300"
                        >{key}:</strong
                      >
                      {#if ch.status === "modified"}
                        <div
                          class="mt-1 rounded border border-error-500/30 bg-error-500/10 p-2"
                        >
                          <span class="text-error-700 dark:text-error-300"
                            >- {JSON.stringify(ch.old)}</span
                          >
                        </div>
                        <div
                          class="mt-1 rounded border border-success-500/30 bg-tertiary-500 dark:bg-primary-500/10 p-2"
                        >
                          <span class="text-success-700 dark:text-success-300"
                            >+ {JSON.stringify(ch.new)}</span
                          >
                        </div>
                      {:else if ch.status === "added"}
                        <div
                          class="mt-1 rounded border border-success-500/30 bg-tertiary-500 dark:bg-primary-500/10 p-2"
                        >
                          <span class="text-success-700 dark:text-success-300"
                            >+ {JSON.stringify(ch.value)}</span
                          >
                        </div>
                      {:else if ch.status === "deleted"}
                        <div
                          class="mt-1 rounded border border-error-500/30 bg-error-500/10 p-2"
                        >
                          <span class="text-error-700 dark:text-error-300"
                            >- {JSON.stringify(ch.value)}</span
                          >
                        </div>
                      {/if}
                    </div>
                  {/each}
                </div>
              {:else if selectedRevisionId}
                <p class="text-center text-surface-500">
                  No differences found.
                </p>
              {:else}
                <p class="text-center text-surface-500">
                  Select a revision to see what's changed.
                </p>
              {/if}
            {:else}
              <p class="text-center text-surface-500">
                Select a revision to see what's changed.
              </p>
            {/if}
          </div>
        {/if}
      </div>
    </Tabs.Content>
    <Tabs.Content value="3" class="w-full">
      <div class="space-y-4 p-4">
        <div class="flex items-center gap-2">
          <input type="text" class="input grow" readonly value={apiUrl} />
          <button
            class="preset-outline-surface-500 btn"
            onclick={() => {
              navigator.clipboard.writeText(apiUrl);
              toast.success("API URL Copied");
            }}
          >
            Copy
          </button>
        </div>
        <div
          class="card p-4 overflow-x-auto bg-surface-800 text-white font-mono text-sm `max-h-125"
        >
          <pre>{JSON.stringify((collectionValue as any).value, null, 2)}</pre>
        </div>
      </div>
    </Tabs.Content>

    <!-- Plugin Slots Content -->
    {#each entryEditSlots as slot (slot.id)}
      <Tabs.Content value={slot.id} class="w-full">
        {#await slot.component()}
          <div class="flex h-40 items-center justify-center">
            <div
              class="h-10 w-10 animate-spin rounded-full border-4 border-surface-200 border-t-primary-500"
            ></div>
          </div>
        {:then Component}
          {#if Component.default}
            <Component.default
              {collection}
              {currentCollectionValue}
              {user}
              {tenantId}
              contentLanguage={currentContentLanguage}
              {...slot.props}
            />
          {:else}
            <Component
              {collection}
              {currentCollectionValue}
              {user}
              {tenantId}
              contentLanguage={currentContentLanguage}
              {...slot.props}
            />
          {/if}
        {:catch error}
          <div class="p-4">
            <div
              class="rounded border border-error-500/50 bg-error-50 p-4 text-error-600 dark:bg-error-900/10 dark:text-error-500"
            >
              <h3 class="mb-2 font-bold">Plugin Error ({slot.id})</h3>
              <p>{error.message}</p>
            </div>
          </div>
        {/await}
      </Tabs.Content>
    {/each}
  </Tabs>
{/if}
