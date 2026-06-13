<!--
@file src/routes/(app)/config/appearance/+page.svelte
@component
**Admin Theme Settings — Multi-Theme Management + Live Preview**

Manage multiple named admin themes (like Drupal Gin vs DXPR).
Create, switch, clone, and delete themes. Each theme stores its own
density, variant, features, and custom CSS.

Tabs: Themes, Presets, Layout & Density, Visual Style, Features, Advanced.

### Features:
- Multi-theme management (create, activate, clone, delete)
- Live theme preview via Svelte 5 $state (instant re-render)
- Skeleton.dev preset import
- Custom CSS injection with sanitization
- Density presets (compact / cozy / spacious)
- Card variant switching (flat / bordered / elevated)
- Export / Import theme JSON
- Reset to defaults
-->

<script lang="ts">
  import Button from "@components/ui/button.svelte";
  import Select from "@components/ui/select.svelte";
  import Toggle from "@components/ui/toggle.svelte";
  import { fade, fly } from "svelte/transition";
  import { toast } from "@src/stores/toast.svelte";
  import type { StoredAdminTheme, ThemeSummary } from "@src/services/core/admin-theme-service";
  import { getThemeContext } from "@components/ui/theme-context.svelte";
  import type { AdminTheme } from "@components/ui/theme-context.svelte";
  import { untrack, onMount } from "svelte";

  let { data } = $props();
  const loadedTheme = $derived(data.adminTheme as StoredAdminTheme | null);
  const isAdmin = $derived((data as any).isAdmin === true);

  // ── Per-user theme overrides ──
  const userPrefs = $derived((data as any).user?.preferences?.theme as Record<string, any> | undefined);
  let myDensity = $state<string>(
    untrack(() => userPrefs?.density || "")
  );
  let myVariant = $state<string>(
    untrack(() => userPrefs?.variant || "")
  );
  let myReducedMotion = $state(
    untrack(() => userPrefs?.reducedMotion ?? false)
  );
  let myHighContrast = $state(
    untrack(() => userPrefs?.highContrast ?? false)
  );

  async function saveMyOverrides() {
    try {
      const payload: Record<string, any> = { preferences: { theme: {} } };
      if (myDensity) payload.preferences.theme.density = myDensity;
      if (myVariant) payload.preferences.theme.variant = myVariant;
      payload.preferences.theme.reducedMotion = myReducedMotion;
      payload.preferences.theme.highContrast = myHighContrast;
      // Preserve existing layoutState if any
      if (userPrefs?.layoutState) payload.preferences.theme.layoutState = userPrefs.layoutState;

      const res = await fetch("/api/user/update-user-attributes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Save failed");
      toast.success("Your preferences saved. Reload to apply fully.");
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : String(e)); }
  }

  async function clearMyOverrides() {
    try {
      await fetch("/api/user/update-user-attributes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: { theme: {} } }),
      });
      myDensity = ""; myVariant = ""; myReducedMotion = false; myHighContrast = false;
      toast.success("Overrides cleared. Reload to apply.");
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : String(e)); }
  }

  // ── Live theme context (for preview) ──
  const liveTheme = getThemeContext() as AdminTheme | undefined;

  // ── Theme list management ──
  let themes = $state<ThemeSummary[]>([]);
  let loadingThemes = $state(true);
  let newThemeName = $state("");
  let cloneName = $state("");

  async function loadThemes() {
    loadingThemes = true;
    try {
      const res = await fetch("/api/theme/list");
      if (res.ok) themes = await res.json();
    } catch { /* ignore */ }
    loadingThemes = false;
  }

  onMount(() => { loadThemes(); });

  function activeTheme(): ThemeSummary | undefined {
    return themes.find((t) => t.isActive) || themes[0];
  }

  // ── Tab state ──
  const tabs = [
    { id: "themes", label: "Themes", icon: "mdi:theme-light-dark" },
    { id: "presets", label: "Presets & Import", icon: "mdi:palette-swatch" },
    { id: "layout", label: "Layout & Density", icon: "mdi:resize" },
    { id: "style", label: "Visual Style", icon: "mdi:format-paint" },
    { id: "features", label: "Features", icon: "mdi:toggle-switch" },
    { id: "advanced", label: "Advanced", icon: "mdi:code-tags" },
  ] as const;

  let activeTab = $state<string>("themes");

  // ── Form state (synced with live theme for preview) ──
  let density = $state<"compact" | "cozy" | "spacious">(
    untrack(() => loadedTheme?.density || liveTheme?.density || "cozy")
  );
  let variant = $state<"flat" | "bordered" | "elevated">(
    untrack(() => loadedTheme?.variant || liveTheme?.variant || "bordered")
  );

  let stickyActionBar = $state(untrack(() => loadedTheme?.features?.stickyActionBar ?? false));
  let collapsibleSidebar = $state(untrack(() => loadedTheme?.features?.collapsibleSidebar ?? false));
  let brandedLogin = $state(untrack(() => loadedTheme?.features?.brandedLogin ?? false));
  let highContrastMode = $state(untrack(() => loadedTheme?.features?.highContrastMode ?? false));
  let reducedMotion = $state(untrack(() => loadedTheme?.features?.reducedMotion ?? false));
  let collectionsLayout = $state<"left" | "right" | "both">(
    untrack(() => (loadedTheme?.features?.layoutRegions?.collections as any) || "left")
  );

  let customCss = $state(untrack(() => loadedTheme?.customCss || ""));
  let importPresetJson = $state("");

  let saving = $state(false);
  let hasChanges = $state(false);

  // ── Live preview ──
  $effect(() => {
    if (liveTheme) {
      liveTheme.density = density;
      liveTheme.variant = variant;
      liveTheme.features = {
        stickyActionBar, collapsibleSidebar, brandedLogin,
        highContrastMode, reducedMotion,
        layoutRegions: { collections: collectionsLayout, mediaGalleries: 'left' },
      };
    }
    hasChanges = true;
  });

  // ── Options ──
  const densityOptions = [
    { value: "compact", label: "Compact — Data-heavy views" },
    { value: "cozy", label: "Cozy — Standard editing (default)" },
    { value: "spacious", label: "Spacious — Distraction-free writing" },
  ];

  const variantOptions = [
    { value: "flat", label: "Flat — No borders or shadows" },
    { value: "bordered", label: "Bordered — Subtle borders (default)" },
    { value: "elevated", label: "Elevated — Prominent card shadows" },
  ];

  const collectionsLayoutOptions = [
    { value: "left", label: "Left Sidebar (default)" },
    { value: "right", label: "Right Sidebar" },
    { value: "both", label: "Both Sidebars" },
  ];

  // ── Theme CRUD ──
  async function handleActivate(id: string) {
    try {
      const res = await fetch("/api/theme/activate", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ themeId: id }),
      });
      if (!res.ok) throw new Error("Activation failed");
      const result = await res.json();
      const a = result.data as StoredAdminTheme;
      if (a.density) density = a.density;
      if (a.variant) variant = a.variant;
      if (a.features) {
        stickyActionBar = a.features.stickyActionBar;
        collapsibleSidebar = a.features.collapsibleSidebar;
        brandedLogin = a.features.brandedLogin;
        highContrastMode = a.features.highContrastMode;
        reducedMotion = a.features.reducedMotion;
        if (a.features.layoutRegions?.collections) {
          collectionsLayout = a.features.layoutRegions.collections as any;
        }
      }
      if (a.customCss) customCss = a.customCss;
      hasChanges = false;
      await loadThemes();
      toast.success(`Activated "${a.name}"`);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : String(e)); }
  }

  async function handleCreate() {
    const n = newThemeName.trim();
    if (!n) { toast.warning("Enter a name"); return; }
    try {
      const res = await fetch("/api/theme/create", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: n, settings: { density, variant, features: { stickyActionBar, collapsibleSidebar, brandedLogin, highContrastMode, reducedMotion, layoutRegions: { collections: collectionsLayout, mediaGalleries: 'left' } }, customCss: customCss || undefined } }),
      });
      if (!res.ok) throw new Error("Creation failed");
      newThemeName = "";
      await loadThemes();
      toast.success(`"${n}" created`);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : String(e)); }
  }

  async function handleClone(id: string) {
    const src = themes.find((t) => t.id === id);
    const n = cloneName.trim() || `Copy of ${src?.name || "theme"}`;
    try {
      const res = await fetch("/api/theme/clone", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceId: id, name: n }),
      });
      if (!res.ok) throw new Error("Clone failed");
      cloneName = "";
      await loadThemes();
      toast.success(`"${n}" cloned`);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : String(e)); }
  }

  async function handleDelete(id: string) {
    const t = themes.find((x) => x.id === id);
    if (!confirm(`Delete "${t?.name}" permanently?`)) return;
    try {
      const res = await fetch("/api/theme/delete", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ themeId: id }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error || "Delete failed");
      }
      await loadThemes();
      toast.success("Theme deleted");
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : String(e)); }
  }

  // ── Save / Reset / Import / Export ──
  async function saveTheme() {
    saving = true;
    try {
      const payload: Partial<StoredAdminTheme> = {
        density, variant,
        features: { stickyActionBar, collapsibleSidebar, brandedLogin, highContrastMode, reducedMotion, layoutRegions: { collections: collectionsLayout, mediaGalleries: 'left' } },
        customCss: customCss || undefined,
      };
      const res = await fetch("/api/theme/admin-theme", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Save failed");
      toast.success("Theme saved");
      hasChanges = false;
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { saving = false; }
  }

  async function resetToDefaults() {
    if (!confirm("Reset to defaults?")) return;
    try {
      await fetch("/api/theme/admin-theme", { method: "DELETE" });
      density = "cozy"; variant = "bordered";
      stickyActionBar = collapsibleSidebar = brandedLogin = highContrastMode = reducedMotion = false;
      customCss = "";
      hasChanges = false;
      toast.success("Reset to defaults");
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : String(e)); }
  }

  async function importPreset() {
    if (!importPresetJson.trim()) { toast.warning("Paste JSON first"); return; }
    saving = true;
    try {
      const res = await fetch("/api/theme/import-preset", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ presetJson: importPresetJson.trim() }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Import failed");
      const imported = (await res.json()).data as StoredAdminTheme;
      if (imported.density) density = imported.density;
      if (imported.variant) variant = imported.variant;
      if (imported.features) {
        stickyActionBar = imported.features.stickyActionBar;
        collapsibleSidebar = imported.features.collapsibleSidebar;
        brandedLogin = imported.features.brandedLogin;
        highContrastMode = imported.features.highContrastMode;
        reducedMotion = imported.features.reducedMotion;
      }
      if (imported.customCss) customCss = imported.customCss;
      importPresetJson = "";
      toast.success("Preset imported");
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { saving = false; }
  }

  function exportTheme() {
    const blob = new Blob([JSON.stringify({ density, variant, accentMode: "default", features: { stickyActionBar, collapsibleSidebar, brandedLogin, highContrastMode, reducedMotion }, customCss: customCss || undefined }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sveltycms-theme-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    toast.success("Exported");
  }
</script>

<div class="absolute inset-0 p-6 space-y-6 bg-surface-50/50 dark:bg-surface-950/50 overflow-y-auto">
  <!-- Header -->
  <div class="flex items-center justify-between" in:fade>
    <div>
      <h1 class="text-3xl font-bold flex items-center gap-3">
        <iconify-icon icon="mdi:palette-outline" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
        Admin Theme Settings
      </h1>
      <p class="text-sm opacity-50 font-medium">Manage themes, customize appearance, and preview live</p>
    </div>
    <div class="flex items-center gap-2">
      <a href="/config" class="btn preset-ghost-surface-500 btn-sm" data-sveltekit-preload-data="hover">
        <iconify-icon icon="ri:arrow-left-line" width="18"></iconify-icon>
        <span class="hidden sm:inline">Back</span>
      </a>
    </div>
  </div>

  <!-- Active theme badge -->
  {#if !loadingThemes}
    {@const current = activeTheme()}
    {#if current}
      <div class="card p-4 border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900/50 flex items-center gap-3 flex-wrap">
        <iconify-icon icon="mdi:theme-light-dark" class="text-2xl text-tertiary-500 dark:text-primary-500"></iconify-icon>
        <div class="flex-1 min-w-0">
          <div class="font-bold text-sm truncate">{current.name}</div>
          <div class="text-xs text-surface-500 dark:text-surface-400">
            {current.density || "cozy"} · {current.variant || "bordered"} · {themes.length} theme{themes.length !== 1 ? "s" : ""} total
          </div>
        </div>
      </div>
    {/if}
  {/if}

  <!-- My Overrides (all users) -->
  <div class="card p-4 border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-900/50">
    <div class="flex items-center gap-2 mb-3">
      <iconify-icon icon="mdi:account-edit" class="text-xl text-tertiary-500 dark:text-primary-500"></iconify-icon>
      <h3 class="font-bold text-sm">My Overrides</h3>
      <span class="text-xs text-surface-400">Personal preferences override the active theme</span>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <div>
        <Select
          bind:value={myDensity}
          label="Density"
          options={[
            { value: "", label: "Use theme default" },
            { value: "compact", label: "Compact" },
            { value: "cozy", label: "Cozy" },
            { value: "spacious", label: "Spacious" },
          ]}
        />
      </div>
      <div>
        <Select
          bind:value={myVariant}
          label="Card Style"
          options={[
            { value: "", label: "Use theme default" },
            { value: "flat", label: "Flat" },
            { value: "bordered", label: "Bordered" },
            { value: "elevated", label: "Elevated" },
          ]}
        />
      </div>
      <div class="flex flex-col justify-end">
        <Toggle bind:value={myReducedMotion} label="Reduced Motion" />
      </div>
      <div class="flex flex-col justify-end">
        <Toggle bind:value={myHighContrast} label="High Contrast" />
      </div>
    </div>
    <div class="flex gap-2 mt-3">
      <Button variant="primary" size="sm" onclick={saveMyOverrides}>Save My Preferences</Button>
      <Button variant="ghost" size="sm" onclick={clearMyOverrides}>Clear Overrides</Button>
    </div>
  </div>

  {#if isAdmin}
  <!-- Tab Navigation -->
  <div class="card border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/50 backdrop-blur-md shadow-sm">
    <div class="flex flex-wrap gap-1 p-2 border-b border-surface-200 dark:border-surface-700">
      {#each tabs as tab}
        <button
          class="btn btn-sm {activeTab === tab.id
            ? 'preset-filled-tertiary-500 dark:preset-filled-primary-500'
            : 'preset-ghost-surface-500'}"
          onclick={() => activeTab = tab.id}
        >
          <iconify-icon icon={tab.icon} width="16"></iconify-icon>
          <span>{tab.label}</span>
        </button>
      {/each}
    </div>

    <!-- Tab Content -->
    <div class="p-6" in:fade={{ duration: 200 }}>
      {#key activeTab}

        <!-- ═══ THEMES (MULTI-THEME MANAGEMENT) ═══ -->
        {#if activeTab === "themes"}
          <div class="space-y-6" in:fly={{ y: 10, duration: 200 }}>
            <h3 class="text-lg font-bold mb-2 flex items-center gap-2">
              <iconify-icon icon="mdi:theme-light-dark" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
              Installed Themes
            </h3>
            <p class="text-sm text-surface-500 dark:text-surface-400 mb-4">
              Switch between admin themes. Each theme stores its own density, variant, features, and custom CSS.
              Create a new theme from scratch or clone an existing one.
            </p>

            {#if loadingThemes}
              <div class="text-center py-8 text-surface-400">Loading themes...</div>
            {:else}
              <div class="space-y-3 max-w-2xl">
                {#each themes as t (t.id)}
                  <div class="card p-4 border-2 {t.isActive
                    ? 'border-tertiary-500 dark:border-primary-500 bg-tertiary-50/30 dark:bg-primary-900/10'
                    : 'border-surface-200 dark:border-surface-700'} flex items-center gap-3 flex-wrap">
                    <iconify-icon icon={t.isActive ? "mdi:checkbox-marked-circle" : "mdi:theme-light-dark"}
                      class="text-xl {t.isActive ? 'text-tertiary-500 dark:text-primary-500' : 'text-surface-400'}"></iconify-icon>
                    <div class="flex-1 min-w-0">
                      <div class="font-bold text-sm flex items-center gap-2">
                        {t.name}
                        {#if t.isActive}<span class="badge preset-tonal-success text-[10px]">Active</span>{/if}
                        {#if t.isDefault}<span class="badge preset-tonal-surface text-[10px]">Default</span>{/if}
                      </div>
                      <div class="text-xs text-surface-500 dark:text-surface-400">
                        {t.density || "cozy"} · {t.variant || "bordered"}
                      </div>
                    </div>
                    <div class="flex items-center gap-1">
                      {#if !t.isActive}
                        <Button variant="primary" size="sm" onclick={() => handleActivate(t.id)}>Activate</Button>
                      {/if}
                      <Button variant="ghost" size="sm" leadingIcon="mdi:content-copy"
                        onclick={() => { cloneName = ""; handleClone(t.id); }}
                        aria-label="Clone {t.name}"></Button>
                      {#if !t.isActive && !t.isDefault}
                        <Button variant="ghost" size="sm" leadingIcon="mdi:delete"
                          onclick={() => handleDelete(t.id)}
                          aria-label="Delete {t.name}"></Button>
                      {/if}
                    </div>
                  </div>
                {/each}
              </div>

              <!-- Create new theme -->
              <div class="mt-6 card p-4 border border-surface-200 dark:border-surface-700 max-w-2xl">
                <h4 class="font-bold text-sm mb-3">Create New Theme</h4>
                <div class="flex gap-2">
                  <input
                    bind:value={newThemeName}
                    class="input flex-1"
                    placeholder="Theme name (e.g. Midnight Blue, High Contrast)"
                    aria-label="New theme name"
                    onkeydown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                  />
                  <Button variant="tertiary" onclick={handleCreate} leadingIcon="mdi:plus">Create</Button>
                </div>
                <p class="text-xs text-surface-400 mt-2">
                  New themes start with current density/variant/features as defaults.
                </p>
              </div>
            {/if}
          </div>

        <!-- ═══ PRESETS & IMPORT ═══ -->
        {:else if activeTab === "presets"}
          <div class="space-y-6" in:fly={{ y: 10, duration: 200 }}>
            <div>
              <h3 class="text-lg font-bold mb-2 flex items-center gap-2">
                <iconify-icon icon="mdi:palette-swatch" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
                Theme Presets
              </h3>
              <p class="text-sm text-surface-500 dark:text-surface-400 mb-4">
                Quick-apply curated presets or import from Skeleton.dev theme builder.
              </p>

              <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <button
                  class="card p-4 border-2 {density === 'cozy' && variant === 'bordered'
                    ? 'border-tertiary-500 dark:border-primary-500'
                    : 'border-surface-200 dark:border-surface-700'} hover:border-tertiary-400 dark:hover:border-primary-400 transition-colors text-start"
                  onclick={() => { density = 'cozy'; variant = 'bordered'; }}
                >
                  <iconify-icon icon="mdi:monitor-dashboard" class="text-2xl text-tertiary-500 dark:text-primary-500 mb-2"></iconify-icon>
                  <h4 class="font-bold text-sm">Cozy Default</h4>
                  <p class="text-xs text-surface-500 dark:text-surface-400">Standard admin density with subtle borders</p>
                </button>

                <button
                  class="card p-4 border-2 {density === 'compact' && variant === 'flat'
                    ? 'border-tertiary-500 dark:border-primary-500'
                    : 'border-surface-200 dark:border-surface-700'} hover:border-tertiary-400 dark:hover:border-primary-400 transition-colors text-start"
                  onclick={() => { density = 'compact'; variant = 'flat'; }}
                >
                  <iconify-icon icon="mdi:table-large" class="text-2xl text-tertiary-500 dark:text-primary-500 mb-2"></iconify-icon>
                  <h4 class="font-bold text-sm">Compact Pro</h4>
                  <p class="text-xs text-surface-500 dark:text-surface-400">High-density for developers & data-heavy views</p>
                </button>

                <button
                  class="card p-4 border-2 {density === 'spacious' && variant === 'elevated'
                    ? 'border-tertiary-500 dark:border-primary-500'
                    : 'border-surface-200 dark:border-surface-700'} hover:border-tertiary-400 dark:hover:border-primary-400 transition-colors text-start"
                  onclick={() => { density = 'spacious'; variant = 'elevated'; }}
                >
                  <iconify-icon icon="mdi:pen" class="text-2xl text-tertiary-500 dark:text-primary-500 mb-2"></iconify-icon>
                  <h4 class="font-bold text-sm">Spacious Writer</h4>
                  <p class="text-xs text-surface-500 dark:text-surface-400">Distraction-free content authoring mode</p>
                </button>
              </div>

              <h4 class="font-bold text-sm mb-2">Import from Skeleton.dev</h4>
              <p class="text-xs text-surface-500 dark:text-surface-400 mb-3">
                Create at <a href="https://themes.skeleton.dev/themes/create" target="_blank" rel="noopener" class="text-tertiary-500 dark:text-primary-500 underline">themes.skeleton.dev</a>, export as JSON, paste below.
              </p>
              <div class="space-y-3">
                <textarea bind:value={importPresetJson} class="input min-h-30 font-mono text-xs"
                  placeholder={'{"name":"My Theme","properties":{...}}'}
                  aria-label="Import preset JSON"></textarea>
                <Button variant="tertiary" onclick={importPreset} loading={saving}>Import Preset</Button>
              </div>
            </div>
          </div>

        <!-- ═══ LAYOUT & DENSITY ═══ -->
        {:else if activeTab === "layout"}
          <div class="space-y-6" in:fly={{ y: 10, duration: 200 }}>
            <h3 class="text-lg font-bold mb-2 flex items-center gap-2">
              <iconify-icon icon="mdi:resize" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
              Layout & Density
            </h3>
            <div class="space-y-6 max-w-2xl">
              <Select bind:value={density} label="Admin Density" options={densityOptions} />
              <p class="text-xs text-surface-400 -mt-4">
                Sidebar: {density === 'compact' ? '200px' : density === 'spacious' ? '300px' : '240px'} ·
                Header: {density === 'compact' ? '48px' : density === 'spacious' ? '72px' : '64px'}
              </p>

              <div class="grid grid-cols-3 gap-4">
                {#each [{ d: 'compact', label: 'Compact', desc: 'Sidebar: 200px · Dense · Small text' }, { d: 'cozy', label: 'Cozy', desc: 'Sidebar: 240px · Balanced · Default' }, { d: 'spacious', label: 'Spacious', desc: 'Sidebar: 300px · Airy · Writer mode' }] as p}
                  <div class="card p-3 border {density === p.d ? 'border-tertiary-500 dark:border-primary-500 ring-2 ring-tertiary-500/20 dark:ring-primary-500/20' : 'border-surface-200 dark:border-surface-700'}"
                    style="border-radius: var(--admin-radius-card, 0.75rem);">
                    <div class="text-xs font-bold mb-1">{p.label}</div>
                    <div class="text-[10px] text-surface-500">{p.desc}</div>
                  </div>
                {/each}
              </div>
            </div>
          </div>

        <!-- ═══ VISUAL STYLE ═══ -->
        {:else if activeTab === "style"}
          <div class="space-y-6" in:fly={{ y: 10, duration: 200 }}>
            <h3 class="text-lg font-bold mb-2 flex items-center gap-2">
              <iconify-icon icon="mdi:format-paint" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
              Visual Style
            </h3>
            <div class="space-y-6 max-w-2xl">
              <Select bind:value={variant} label="Card Variant" options={variantOptions} />
              <div class="grid grid-cols-3 gap-4">
                <div class="card p-6 {variant === 'flat' ? 'border-tertiary-500 dark:border-primary-500 ring-2' : ''}"
                  style="border-radius: var(--admin-radius-card, 0.75rem); border-width: {variant === 'flat' ? '0' : 'var(--admin-border-width, 1px)'}; box-shadow: none;">
                  <div class="text-sm font-bold mb-2">Flat</div>
                  <div class="text-xs text-surface-500">No borders · No shadows</div>
                </div>
                <div class="card p-6 {variant === 'bordered' ? 'border-tertiary-500 dark:border-primary-500 ring-2' : 'border-surface-200 dark:border-surface-700'}"
                  style="border-radius: var(--admin-radius-card, 0.75rem); border-width: var(--admin-border-width, 1px); box-shadow: var(--admin-shadow-elevation, 0 1px 3px 0 rgb(0 0 0 / 0.1));">
                  <div class="text-sm font-bold mb-2">Bordered</div>
                  <div class="text-xs text-surface-500">Subtle border · Light shadow</div>
                </div>
                <div class="card p-6 {variant === 'elevated' ? 'border-tertiary-500 dark:border-primary-500 ring-2' : ''}"
                  style="border-radius: var(--admin-radius-card, 0.75rem); border-width: var(--admin-border-width, 1px); box-shadow: var(--admin-shadow-elevated, 0 10px 15px -3px rgb(0 0 0 / 0.05));">
                  <div class="text-sm font-bold mb-2">Elevated</div>
                  <div class="text-xs text-surface-500">Border · Prominent shadow</div>
                </div>
              </div>
            </div>
          </div>

        <!-- ═══ FEATURES ═══ -->
        {:else if activeTab === "features"}
          <div class="space-y-6" in:fly={{ y: 10, duration: 200 }}>
            <h3 class="text-lg font-bold mb-2 flex items-center gap-2">
              <iconify-icon icon="mdi:toggle-switch" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
              Theme Features
            </h3>
            <div class="max-w-2xl space-y-4">
                <div class="card p-4 border border-surface-200 dark:border-surface-700 flex items-center justify-between">
                  <div>
                    <div class="font-bold text-sm">Sticky Action Bar</div>
                    <div class="text-xs text-surface-500 dark:text-surface-400">Save/Delete buttons stick on scroll in content forms</div>
                  </div>
                  <Toggle bind:value={stickyActionBar} />
                </div>
                <div class="card p-4 border border-surface-200 dark:border-surface-700 flex items-center justify-between">
                  <div>
                    <div class="font-bold text-sm">Collapsible Sidebar</div>
                    <div class="text-xs text-surface-500 dark:text-surface-400">Allow users to collapse the navigation sidebar</div>
                  </div>
                  <Toggle bind:value={collapsibleSidebar} />
                </div>
                <div class="card p-4 border border-surface-200 dark:border-surface-700 flex items-center justify-between">
                  <div>
                    <div class="font-bold text-sm">Branded Login</div>
                    <div class="text-xs text-surface-500 dark:text-surface-400">Show tenant logo and custom colors on login page</div>
                  </div>
                  <Toggle bind:value={brandedLogin} />
                </div>
                <div class="card p-4 border border-surface-200 dark:border-surface-700 flex items-center justify-between">
                  <div>
                    <div class="font-bold text-sm">High Contrast Mode</div>
                    <div class="text-xs text-surface-500 dark:text-surface-400">Enforce WCAG AAA contrast ratios across admin</div>
                  </div>
                  <Toggle bind:value={highContrastMode} />
                </div>
                <div class="card p-4 border border-surface-200 dark:border-surface-700 flex items-center justify-between">
                  <div>
                    <div class="font-bold text-sm">Reduced Motion</div>
                    <div class="text-xs text-surface-500 dark:text-surface-400">Disable all animations and transitions globally</div>
                  </div>
                  <Toggle bind:value={reducedMotion} />
                </div>

                <!-- Layout Region: Collections Position -->
                <div class="card p-4 border border-surface-200 dark:border-surface-700">
                  <div class="mb-3">
                    <div class="font-bold text-sm">Collections Position</div>
                    <div class="text-xs text-surface-500 dark:text-surface-400">Which sidebar shows the content collections tree</div>
                  </div>
                  <Select bind:value={collectionsLayout} options={collectionsLayoutOptions} />
                </div>
            </div>
          </div>

        <!-- ═══ ADVANCED ═══ -->
        {:else if activeTab === "advanced"}
          <div class="space-y-6" in:fly={{ y: 10, duration: 200 }}>
            <h3 class="text-lg font-bold mb-2 flex items-center gap-2">
              <iconify-icon icon="mdi:code-tags" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
              Advanced
            </h3>
            <div class="max-w-2xl space-y-6">
              <div>
                <label for="admin-custom-css" class="block text-sm font-bold mb-2">Custom CSS</label>
                <p class="text-xs text-surface-500 dark:text-surface-400 mb-2">
                  Injected into admin panel. Dangerous constructs stripped.
                </p>
                <textarea id="admin-custom-css" bind:value={customCss}
                  class="input min-h-50 font-mono text-xs"
                  placeholder={'/* Custom admin styles */\n.admin-special-header { border-color: oklch(65% 0.2 260deg); }'}></textarea>
              </div>

              <div class="card p-4 border border-surface-200 dark:border-surface-700">
                <h4 class="font-bold text-sm mb-3">Export / Import</h4>
                <div class="flex flex-wrap gap-2">
                  <Button variant="outline" onclick={exportTheme} leadingIcon="mdi:export">Export Theme JSON</Button>
                </div>
                <p class="text-xs text-surface-400 mt-2">Export current settings. Import via Presets tab.</p>
              </div>

              <div class="card p-4 border border-error-200 dark:border-error-800 bg-error-50/30 dark:bg-error-900/10">
                <h4 class="font-bold text-sm text-error-600 dark:text-error-400 mb-2">Danger Zone</h4>
                <p class="text-xs text-surface-500 dark:text-surface-400 mb-3">Reset to factory defaults.</p>
                <Button variant="error" onclick={resetToDefaults} leadingIcon="mdi:restore-alert">Reset to Defaults</Button>
              </div>
            </div>
          </div>
        {/if}
      {/key}
    </div>
  </div>
  {/if}

  <!-- Save Bar -->
  {#if hasChanges}
    <div class="sticky bottom-0 z-30 -mx-6 -mb-6 px-6 py-4 border-t border-surface-200 dark:border-surface-700 bg-white/90 dark:bg-surface-900/90 backdrop-blur-md flex items-center justify-between">
      <p class="text-sm text-warning-600 dark:text-warning-400 font-medium">
        <iconify-icon icon="mdi:alert-circle" class="inline me-1" width="16"></iconify-icon>
        Unsaved changes — live preview active
      </p>
      <div class="flex gap-2">
        <Button variant="ghost" onclick={() => hasChanges = false}>Discard</Button>
        <Button variant="primary" onclick={saveTheme} loading={saving}>Save Theme</Button>
      </div>
    </div>
  {/if}
</div>
