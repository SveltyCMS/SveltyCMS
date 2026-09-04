<!--
@file src/routes/(app)/config/design-system/+page.svelte
@component
**Design System — Multi-Theme Management + Live Preview**

Manage multiple named admin themes. Create, switch, clone, and delete themes. Each theme stores its own
density, variant, features, and custom CSS.

Tabs: My Overrides, Live Preview, Themes, Palette & Import, Layout & Density, Visual Style, Features, Advanced.
Deep links: /config/design-system?tab=overrides|preview|themes|presets|...

### Features:
- Multi-theme management (create, activate, clone, delete)
- Palette studio (seed colors → expanded scales → runtime CSS)
- Live theme preview via Svelte 5 $state (instant re-render)
- Live Preview playground (native component catalog)
- Theme JSON import (shorthand palette / CSS exports)
- Custom CSS injection with sanitization
- Density presets (compact / cozy / spacious)
- Card variant switching (flat / bordered / elevated)
- Per-user My Overrides (all authenticated users)
- Export / Import theme JSON
- Reset to defaults
-->

<script lang="ts">
  import Badge from "@components/ui/badge.svelte";
  import Button from "@components/ui/button.svelte";
  import Input from "@components/ui/input.svelte";
  import AdminPageShell from "@components/admin-page-shell.svelte";
  import AdminCard from '@components/admin-card.svelte';
  import Select from "@components/ui/select.svelte";
  import Textarea from "@components/ui/textarea.svelte";
  import Toggle from "@components/ui/toggle.svelte";
  import DesignSystemPreview from "./design-system-preview.svelte";
  import PaletteStudio from "./palette-studio.svelte";
  import { fade, fly } from "svelte/transition";
  import { toast } from "@src/stores/toast.svelte.ts";
  import type { StoredAdminTheme, ThemeSummary } from "@src/services/core/admin-theme-service";
  import type { MarketplaceItem } from "@src/services/core/marketplace-service";
  import {
    isPreferenceLocked,
    type AdminLockedSettings,
    type UserThemePreferences,
  } from "@utils/theme-merge";
  import { getThemeContext, type AdminTheme } from "@components/ui/theme-context.svelte";
  import { userThemePrefs } from "@src/stores/theme-store.svelte";
  import { ui } from "@src/stores/ui-store.svelte.ts";
  import {
    USER_LAYOUT_PREF_KEYS,
    applyLayoutPrefsToUiState,
    getLayoutPrefLabel,
    uiStateToLayoutPrefs,
    type LayoutPrefKey,
  } from "@utils/layout-state-prefs";
  import { untrack, onMount } from "svelte";
  import { goto, invalidate } from "$app/navigation";
  import { page } from "$app/state";
  import { browser } from "$app/env";
  import {
    listThemes as apiListThemes,
    listMarketplaceThemes as apiListMarketplaceThemes,
    installMarketplaceTheme as apiInstallMarketplaceTheme,
    activateTheme as apiActivateTheme,
    createTheme as apiCreateTheme,
    cloneTheme as apiCloneTheme,
    deleteTheme as apiDeleteTheme,
    saveAdminTheme as apiSaveAdminTheme,
    resetAdminTheme as apiResetAdminTheme,
    importThemePreset as apiImportThemePreset,
    updateUserThemePrefs as apiUpdateUserThemePrefs,
  } from "./appearance-api";

  const layoutVisibilityOptions = [
    { value: "", label: "Use theme default" },
    { value: "full", label: "Visible" },
    { value: "hidden", label: "Hidden" },
  ];

  let { data } = $props();
  const loadedTheme = $derived(data.adminTheme as StoredAdminTheme | null);
  const isAdmin = $derived((data as any).isAdmin === true);

  // ── Per-user theme overrides ──
  const userPrefs = $derived((data as any).user?.preferences?.theme as Record<string, any> | undefined);
  const LOCAL_PREFS_KEY = "sveltycms:theme-prefs";

  function readLocalThemePrefs(): Record<string, any> | undefined {
    if (!browser) return undefined;
    try {
      const raw = localStorage.getItem(LOCAL_PREFS_KEY);
      return raw ? JSON.parse(raw) : undefined;
    } catch {
      return undefined;
    }
  }
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

  function readLayoutPref(key: LayoutPrefKey): string {
    return userPrefs?.layoutState?.[key] ?? "";
  }

  let myLayoutPrefs = $state<Record<LayoutPrefKey, string>>(
    untrack(() => ({
      leftSidebar: readLayoutPref("leftSidebar"),
      rightSidebar: readLayoutPref("rightSidebar"),
      pageheader: readLayoutPref("pageheader"),
      pagefooter: readLayoutPref("pagefooter"),
      header: readLayoutPref("header"),
      footer: readLayoutPref("footer"),
    })),
  );

  $effect(() => {
    if (userPrefs) {
      if (userPrefs.density !== undefined && myDensity !== userPrefs.density) {
        myDensity = userPrefs.density || "";
      }
      if (userPrefs.variant !== undefined && myVariant !== userPrefs.variant) {
        myVariant = userPrefs.variant || "";
      }
      if (userPrefs.reducedMotion !== undefined && myReducedMotion !== userPrefs.reducedMotion) {
        myReducedMotion = userPrefs.reducedMotion ?? false;
      }
      if (userPrefs.highContrast !== undefined && myHighContrast !== userPrefs.highContrast) {
        myHighContrast = userPrefs.highContrast ?? false;
      }
    }
  });

  const layoutLocked = $derived(isPreferenceLocked(loadedTheme?.lockedSettings, "layoutState"));

  function buildLayoutPrefsForSave(): NonNullable<UserThemePreferences["layoutState"]> {
    const layout: NonNullable<UserThemePreferences["layoutState"]> = {};
    for (const key of USER_LAYOUT_PREF_KEYS) {
      const val = myLayoutPrefs[key];
      if (val === "full" || val === "hidden") layout[key] = val;
    }
    return layout;
  }

  function buildMyThemePrefs(): UserThemePreferences {
    const prefs: UserThemePreferences = {
      reducedMotion: myReducedMotion,
      highContrast: myHighContrast,
    };
    if (myDensity) prefs.density = myDensity as UserThemePreferences["density"];
    if (myVariant) prefs.variant = myVariant as UserThemePreferences["variant"];
    if (!layoutLocked) prefs.layoutState = buildLayoutPrefsForSave();
    return prefs;
  }

  function captureCurrentLayout() {
    const snap = uiStateToLayoutPrefs(ui.state);
    for (const key of USER_LAYOUT_PREF_KEYS) {
      myLayoutPrefs[key] = snap[key] ?? "";
    }
    toast.success("Captured your current panel layout.");
  }

  async function saveMyOverrides() {
    try {
      const themePrefs = buildMyThemePrefs();
      const res = await apiUpdateUserThemePrefs({ ...themePrefs });
      if (!res.success) throw new Error(res.message || "Save failed");

      // Toast immediately after the successful PUT — never race the reactive
      // side effects below (store apply, layout re-render, invalidate).
      toast.success("Preferences applied across the admin panel.");

      if (browser) localStorage.setItem(LOCAL_PREFS_KEY, JSON.stringify(themePrefs));
      userThemePrefs.apply(themePrefs);
      if (!layoutLocked && themePrefs.layoutState) {
        applyLayoutPrefsToUiState(themePrefs.layoutState, ui.state);
      }
      // Server data re-sync — fire-and-forget (never awaited) so it can't
      // delay or clobber the toast. The layout reads live prefs from the
      // `userThemePrefs` store, which `apply()` above already updated.
      invalidate("app:user-prefs");
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : String(e)); }
  }

  async function clearMyOverrides() {
    try {
      await apiUpdateUserThemePrefs({});
      // Toast immediately — same rationale as in saveMyOverrides.
      toast.success("Overrides cleared — using active theme defaults.");
      myDensity = "";
      myVariant = "";
      myReducedMotion = false;
      myHighContrast = false;
      for (const key of USER_LAYOUT_PREF_KEYS) {
        myLayoutPrefs[key] = "";
      }
      if (browser) localStorage.removeItem(LOCAL_PREFS_KEY);
      userThemePrefs.apply({ reducedMotion: false, highContrast: false, layoutState: {} });
      invalidate("app:user-prefs");
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
      themes = await apiListThemes();
    } catch { /* ignore */ }
    loadingThemes = false;
  }

  let marketplaceThemes = $state<MarketplaceItem[]>([]);
  let marketplaceSource = $state<"remote" | "local" | "mixed">("local");
  let loadingMarketplace = $state(false);

  async function loadMarketplaceThemes() {
    loadingMarketplace = true;
    try {
      const result = await apiListMarketplaceThemes();
      marketplaceThemes = result.items;
      marketplaceSource = result.source;
    } catch { /* ignore */ }
    finally { loadingMarketplace = false; }
  }

  async function installMarketplaceTheme(itemId: string) {
    saving = true;
    try {
      const res = await apiInstallMarketplaceTheme(itemId);
      if (!res.success) throw new Error(res.message || res.error || "Install failed");
      toast.success("Theme installed from marketplace");
      await loadThemes();
      await loadMarketplaceThemes();
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { saving = false; }
  }

  onMount(() => {
    const localPrefs = readLocalThemePrefs();
    if (localPrefs) {
      if (localPrefs.density && !myDensity) myDensity = localPrefs.density;
      if (localPrefs.variant && !myVariant) myVariant = localPrefs.variant;
      if (localPrefs.reducedMotion !== undefined && !myReducedMotion) myReducedMotion = localPrefs.reducedMotion;
      if (localPrefs.highContrast !== undefined && !myHighContrast) myHighContrast = localPrefs.highContrast;
      for (const key of USER_LAYOUT_PREF_KEYS) {
        if (localPrefs.layoutState?.[key] && !myLayoutPrefs[key]) {
          myLayoutPrefs[key] = localPrefs.layoutState[key];
        }
      }
      userThemePrefs.apply(localPrefs as UserThemePreferences);
    }
    activeTab = resolveTabFromUrl(isAdmin);
    loadThemes();
    loadMarketplaceThemes();
    if (activeTab === "overrides") {
      // Scroll target for /user deep link
      document.getElementById("my-overrides")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  });

  function activeTheme(): ThemeSummary | undefined {
    return themes.find((t) => t.isActive) || themes[0];
  }

  // ── Tab state (deep-linkable via ?tab=) ──
  type AppearanceTabId =
    | "overrides"
    | "preview"
    | "themes"
    | "presets"
    | "layout"
    | "style"
    | "features"
    | "advanced";

  const ALL_TABS: { id: AppearanceTabId; label: string; icon: string; adminOnly?: boolean }[] = [
    { id: "overrides", label: "My Overrides", icon: "mdi:account-edit" },
    { id: "preview", label: "Live Preview", icon: "mdi:compass-outline" },
    { id: "themes", label: "Themes", icon: "mdi:theme-light-dark", adminOnly: true },
    { id: "presets", label: "Palette & Import", icon: "mdi:palette-swatch", adminOnly: true },
    { id: "layout", label: "Layout & Density", icon: "mdi:resize", adminOnly: true },
    { id: "style", label: "Visual Style", icon: "mdi:format-paint", adminOnly: true },
    { id: "features", label: "Features", icon: "mdi:toggle-switch", adminOnly: true },
    { id: "advanced", label: "Advanced", icon: "mdi:code-tags", adminOnly: true },
  ];

  const VALID_TABS = new Set(ALL_TABS.map((t) => t.id));

  function resolveTabFromUrl(isAdminUser: boolean): AppearanceTabId {
    const raw = page.url.searchParams.get("tab");
    if (raw && VALID_TABS.has(raw as AppearanceTabId)) {
      const meta = ALL_TABS.find((t) => t.id === raw);
      if (meta?.adminOnly && !isAdminUser) return "overrides";
      return raw as AppearanceTabId;
    }
    return isAdminUser ? "themes" : "overrides";
  }

  let activeTab = $state<AppearanceTabId>(
    untrack(() => resolveTabFromUrl(Boolean((data as { isAdmin?: boolean }).isAdmin))),
  );

  $effect(() => {
    const tabFromUrl = resolveTabFromUrl(isAdmin);
    if (tabFromUrl !== activeTab) {
      activeTab = tabFromUrl;
    }
  });

  const visibleTabs = $derived(ALL_TABS.filter((t) => !t.adminOnly || isAdmin));

  	function setActiveTab(id: AppearanceTabId) {
  		activeTab = id;
  		if (!browser) return;
  		const url = new URL(page.url.href);
  		url.searchParams.set("tab", id);
  		void goto(`${url.pathname}?${url.searchParams.toString()}`, {
  			replace: true,
  			reset: false,
  		});
  	}

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
  let lockDensity = $state(untrack(() => loadedTheme?.lockedSettings?.density ?? false));
  let lockVariant = $state(untrack(() => loadedTheme?.lockedSettings?.variant ?? false));
  let lockReducedMotion = $state(untrack(() => loadedTheme?.lockedSettings?.reducedMotion ?? false));
  let lockHighContrast = $state(untrack(() => loadedTheme?.lockedSettings?.highContrast ?? false));
  let lockLayoutState = $state(untrack(() => loadedTheme?.lockedSettings?.layoutState ?? false));
  let importPresetJson = $state("");

  const lockedSettings = $derived({
    density: lockDensity,
    variant: lockVariant,
    reducedMotion: lockReducedMotion,
    highContrast: lockHighContrast,
    layoutState: lockLayoutState,
  } satisfies AdminLockedSettings);

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
      liveTheme.customCss = customCss || undefined;
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

  // ── Theme CRUD (appearance-api → fetchApi CSRF) ──
  async function handleActivate(id: string) {
    try {
      const result = await apiActivateTheme(id);
      if (!result.success || !result.data) throw new Error(result.message || "Activation failed");
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
      const res = await apiCreateTheme({
        name: n,
        settings: {
          density,
          variant,
          features: {
            stickyActionBar,
            collapsibleSidebar,
            brandedLogin,
            highContrastMode,
            reducedMotion,
            layoutRegions: { collections: collectionsLayout, mediaGalleries: "left" },
          },
          customCss: customCss || undefined,
        },
      });
      if (!res.success) throw new Error(res.message || "Creation failed");
      newThemeName = "";
      await loadThemes();
      toast.success(`"${n}" created`);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : String(e)); }
  }

  async function handleClone(id: string) {
    const src = themes.find((t) => t.id === id);
    const n = cloneName.trim() || `Copy of ${src?.name || "theme"}`;
    try {
      const res = await apiCloneTheme(id, n);
      if (!res.success) throw new Error(res.message || "Clone failed");
      cloneName = "";
      await loadThemes();
      toast.success(`"${n}" cloned`);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : String(e)); }
  }

  async function handleDelete(id: string) {
    const t = themes.find((x) => x.id === id);
    if (!confirm(`Delete "${t?.name}" permanently?`)) return;
    try {
      const res = await apiDeleteTheme(id);
      if (!res.success) throw new Error(res.message || res.error || "Delete failed");
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
        lockedSettings,
      };
      const res = await apiSaveAdminTheme(payload);
      if (!res.success) throw new Error(res.message || "Save failed");
      toast.success("Theme saved");
      hasChanges = false;
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { saving = false; }
  }

  async function resetToDefaults() {
    if (!confirm("Reset to defaults?")) return;
    try {
      await apiResetAdminTheme();
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
      const body = await apiImportThemePreset(importPresetJson.trim());
      if (!body.success || !body.data) {
        throw new Error(body.message || body.error || "Import failed");
      }
      const imported = body.data as StoredAdminTheme;
      const warnings = (body.warnings ?? []) as Array<{ pair: string; ratio: number; required: number }>;
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
      if (warnings.length > 0) {
        const summary = warnings
          .slice(0, 2)
          .map((w) => `${w.pair} (${w.ratio}:1, needs ${w.required}:1)`)
          .join("; ");
        toast.warning(`Imported with ${warnings.length} contrast warning(s): ${summary}`);
      } else {
        toast.success("Preset imported");
      }
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

<AdminPageShell
  title="Design System"
  icon="mdi:compass-outline"
  description="Appearance, personal overrides, live component preview, and workspace themes"
  showBackButton={true}
  backUrl="/config"
>
  <!-- Active theme badge -->
  {#if !loadingThemes}
    {@const current = activeTheme()}
    {#if current}
      <AdminCard
        class="flex items-center gap-3 flex-wrap p-4"
      >
        <iconify-icon icon="mdi:theme-light-dark" class="text-2xl text-tertiary-500 dark:text-primary-500"></iconify-icon>
        <div class="flex-1 min-w-0">
          <div class="font-bold text-sm truncate">{current.name}</div>
          <div class="text-xs" style="color: var(--admin-text-muted)">
            {current.density || "cozy"} · {current.variant || "bordered"} · {themes.length} theme{themes.length !== 1 ? "s" : ""} total
          </div>
        </div>
      </AdminCard>
    {/if}
  {/if}

  <!-- Tab Navigation (all users: overrides + preview; admin: full workspace) -->
  <AdminCard class="shadow-sm backdrop-blur-md">
    <div class="flex flex-wrap gap-1 p-2 border-b" style="border-color: var(--admin-border-default)" data-testid="appearance-tabs">
      {#each visibleTabs as tab (tab.id)}
        <Button variant="tertiary"
          onclick={() => setActiveTab(tab.id)}
          size="sm"
          data-testid={`appearance-tab-${tab.id}`}
          class={activeTab === tab.id ? 'bg-surface-500/10 text-tertiary-600 dark:bg-surface-800 dark:text-primary-500' : ''}>
          <iconify-icon icon={tab.icon} width="16"></iconify-icon>
          <span>{tab.label}</span>
        </Button>
      {/each}
    </div>

    <!-- Tab Content -->
    <div class="p-6" in:fade={{ duration: 200 }}>
      {#key activeTab}

        <!-- ═══ MY OVERRIDES (all users) ═══ -->
        {#if activeTab === "overrides"}
          <div class="space-y-4" id="my-overrides" data-testid="appearance-overrides-panel" in:fly={{ y: 10, duration: 200 }}>
            <div class="flex items-center gap-2 mb-1">
              <iconify-icon icon="mdi:account-edit" class="text-xl text-tertiary-500 dark:text-primary-500"></iconify-icon>
              <h3 class="font-bold text-sm">My Overrides</h3>
              <span class="text-xs" style="color: var(--admin-text-muted)">Apply instantly — no reload needed</span>
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <Select
                  bind:value={myDensity}
                  label="Density"
                  disabled={isPreferenceLocked(loadedTheme?.lockedSettings, "density")}
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
                  disabled={isPreferenceLocked(loadedTheme?.lockedSettings, "variant")}
                  options={[
                    { value: "", label: "Use theme default" },
                    { value: "flat", label: "Flat" },
                    { value: "bordered", label: "Bordered" },
                    { value: "elevated", label: "Elevated" },
                  ]}
                />
              </div>
              <div class="flex flex-col justify-end">
                <Toggle bind:value={myReducedMotion} label="Reduced Motion" disabled={isPreferenceLocked(loadedTheme?.lockedSettings, "reducedMotion")} />
              </div>
              <div class="flex flex-col justify-end">
                <Toggle bind:value={myHighContrast} label="High Contrast" disabled={isPreferenceLocked(loadedTheme?.lockedSettings, "highContrast")} />
              </div>
            </div>

            <div class="mt-2 pt-4 border-t" style="border-color: var(--admin-border-default)">
              <div class="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <h4 class="font-semibold text-sm">My Layout</h4>
                  <p class="text-xs" style="color: var(--admin-text-muted)">
                    Personal sidebar and shell region visibility. Sidebar toggles also auto-save after 2 seconds.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onclick={captureCurrentLayout}
                  disabled={layoutLocked}
                >
                  Use current layout
                </Button>
              </div>
              {#if layoutLocked}
                <p class="text-xs text-warning-600 dark:text-warning-400 mb-3">
                  Layout is locked by your workspace admin — tenant defaults apply.
                </p>
              {/if}
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {#each USER_LAYOUT_PREF_KEYS as key (key)}
                  <Select
                    id={`layout-pref-${key}`}
                    bind:value={myLayoutPrefs[key]}
                    label={getLayoutPrefLabel(key)}
                    disabled={layoutLocked}
                    options={layoutVisibilityOptions}
                  />
                {/each}
              </div>
            </div>

            <div class="flex gap-2 mt-3">
              <Button variant="primary" size="sm" onclick={saveMyOverrides} data-testid="appearance-save-overrides">Save My Preferences</Button>
              <Button variant="ghost" size="sm" onclick={clearMyOverrides} data-testid="appearance-clear-overrides">Clear Overrides</Button>
            </div>
          </div>

        <!-- ═══ LIVE PREVIEW (design system playground) ═══ -->
        {:else if activeTab === "preview"}
          <div data-testid="appearance-preview-panel" in:fly={{ y: 10, duration: 200 }}>
            <DesignSystemPreview bind:density bind:variant />
          </div>

        <!-- ═══ THEMES (MULTI-THEME MANAGEMENT) ═══ -->
        {:else if activeTab === "themes" && isAdmin}
          <div class="space-y-6" data-testid="appearance-themes-panel" in:fly={{ y: 10, duration: 200 }}>
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
              <div class="space-y-3 max-w-2xl" data-testid="appearance-theme-list">
                {#each themes as t (t.id)}
                  <AdminCard
                    data-testid={`appearance-theme-card-${t.id}`}
                    data-theme-name={t.name}
                    class="p-4 border-2 {t.isActive
                    ? 'border-tertiary-500 dark:border-primary-500 bg-tertiary-500/30 dark:bg-primary-900/10'
                    : 'border-surface-500/30 dark:border-surface-500/40'} flex items-center gap-3 flex-wrap">
                    <iconify-icon icon={t.isActive ? "mdi:checkbox-marked-circle" : "mdi:theme-light-dark"}
                      class="text-xl {t.isActive ? 'text-tertiary-500 dark:text-primary-500' : 'text-surface-400'}"></iconify-icon>
                    <div class="flex-1 min-w-0">
                      <div class="font-bold text-sm flex items-center gap-2">
                        {t.name}
                        {#if t.isActive}<Badge preset="tonal" color="success" size="sm" data-testid="appearance-theme-active-badge">Active</Badge>{/if}
                        {#if t.isDefault}<Badge preset="tonal" color="surface" size="sm">Default</Badge>{/if}
                      </div>
                      <div class="text-xs text-surface-500 dark:text-surface-400">
                        {t.density || "cozy"} · {t.variant || "bordered"}
                      </div>
                    </div>
                    <div class="flex items-center gap-1">
                      {#if !t.isActive}
                        <Button variant="primary" size="sm" onclick={() => handleActivate(t.id)} data-testid={`appearance-theme-activate-${t.id}`}>Activate</Button>
                      {/if}
                      <Button variant="ghost" size="sm" leadingIcon="mdi:content-copy"
                        onclick={() => { cloneName = ""; handleClone(t.id); }}
                        aria-label="Clone {t.name}"
                        data-testid={`appearance-theme-clone-${t.id}`}></Button>
                      {#if !t.isActive && !t.isDefault}
                        <Button variant="ghost" size="sm" leadingIcon="mdi:delete"
                          onclick={() => handleDelete(t.id)}
                          aria-label="Delete {t.name}"
                          data-testid={`appearance-theme-delete-${t.id}`}></Button>
                      {/if}
                    </div>
                  </AdminCard>
                {/each}
              </div>

              <!-- Create new theme -->
              <AdminCard
                class="mt-6 max-w-2xl border border-surface-500/30 p-4 dark:border-surface-500/40"
                data-testid="appearance-theme-create"
              >
                <h4 class="font-bold text-sm mb-3">Create New Theme</h4>
                <div class="flex gap-2">
                  <Input
                    bind:value={newThemeName}
                    class="flex-1"
                    placeholder="Theme name (e.g. Midnight Blue, High Contrast)"
                    aria-label="New theme name"
                    data-testid="appearance-theme-name"
                    onkeydown={(e) => { if (e.key === 'Enter') handleCreate(); }}
                  />
                  <Button variant="tertiary" onclick={handleCreate} leadingIcon="mdi:plus" data-testid="appearance-theme-create-btn">Create</Button>
                </div>
                <p class="text-xs text-surface-400 mt-2">
                  New themes start with current density/variant/features as defaults.
                </p>
              </AdminCard>
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
	              <p class="text-sm text-surface-500 dark:text-surface-400 mb-2">
	                Edit brand colors in the palette studio, apply layout presets, or import theme JSON.
	              </p>
              <p class="text-sm mb-4">
                <button
                  type="button"
                  aria-label="Theme preview"
                  class="text-tertiary-500 dark:text-primary-500 underline inline-flex items-center gap-1"
                  onclick={() => setActiveTab("preview")}
                >
                  <iconify-icon icon="mdi:compass-outline" width="16"></iconify-icon>
                  Open Live Preview
                </button>
                — preview all native components and tokens live.
              </p>

              <PaletteStudio
                bind:customCss
                onApplied={() => {
                  hasChanges = true;
                }}
                onOpenPreview={() => setActiveTab("preview")}
              />

              <h4 class="font-bold text-sm mb-2 mt-2">Layout presets</h4>
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                				<AdminCard
                					class="cursor-pointer p-4 border-2 {density === 'cozy' && variant === 'bordered'
                						? 'border-tertiary-500 dark:border-primary-500'
                						: 'border-surface-500/30 dark:border-surface-500/40'} hover:border-tertiary-500 dark:hover:border-primary-400 transition-colors"
                					onclick={() => { density = 'cozy'; variant = 'bordered'; }}
					role="button"
					tabindex={0}
					aria-label="Apply Cozy Default preset"
                				>
                					<iconify-icon icon="mdi:monitor-dashboard" class="text-2xl text-tertiary-500 dark:text-primary-500 mb-2"></iconify-icon>
                					<h4 class="font-bold text-sm">Cozy Default</h4>
                					<p class="text-xs text-surface-500 dark:text-surface-400">Standard admin density with subtle borders</p>
                				</AdminCard>

                				<AdminCard
                					class="cursor-pointer p-4 border-2 {density === 'compact' && variant === 'flat'
                						? 'border-tertiary-500 dark:border-primary-500'
                						: 'border-surface-500/30 dark:border-surface-500/40'} hover:border-tertiary-500 dark:hover:border-primary-400 transition-colors"
                					onclick={() => { density = 'compact'; variant = 'flat'; }}
					role="button"
					tabindex={0}
					aria-label="Apply Compact Pro preset"
                				>
                					<iconify-icon icon="mdi:table-large" class="text-2xl text-tertiary-500 dark:text-primary-500 mb-2"></iconify-icon>
                					<h4 class="font-bold text-sm">Compact Pro</h4>
                					<p class="text-xs text-surface-500 dark:text-surface-400">High-density for developers & data-heavy views</p>
                				</AdminCard>

                				<AdminCard
                					class="cursor-pointer p-4 border-2 {density === 'spacious' && variant === 'elevated'
                						? 'border-tertiary-500 dark:border-primary-500'
                						: 'border-surface-500/30 dark:border-surface-500/40'} hover:border-tertiary-500 dark:hover:border-primary-400 transition-colors"
                					onclick={() => { density = 'spacious'; variant = 'elevated'; }}
					role="button"
					tabindex={0}
					aria-label="Apply Spacious Writer preset"
                				>
                					<iconify-icon icon="mdi:pen" class="text-2xl text-tertiary-500 dark:text-primary-500 mb-2"></iconify-icon>
                					<h4 class="font-bold text-sm">Spacious Writer</h4>
                					<p class="text-xs text-surface-500 dark:text-surface-400">Distraction-free content authoring mode</p>
                				</AdminCard>
              </div>

              <h4 class="font-bold text-sm mb-2 flex items-center gap-2">
                <iconify-icon icon="icon-park-outline:shopping-bag" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
                Theme Marketplace
              </h4>
              <p class="text-xs text-surface-500 dark:text-surface-400 mb-3">
                Browse themes from
                <a href="https://marketplace.sveltycms.com" target="_blank" rel="noopener" class="text-tertiary-500 dark:text-primary-500 underline">marketplace.sveltycms.com</a>.
                {#if marketplaceSource === "local"}
                  Showing built-in themes until the remote catalog is available.
                {:else}
                  Catalog source: {marketplaceSource}.
                {/if}
              </p>

              {#if loadingMarketplace}
                <p class="text-sm text-surface-500 mb-4">Loading marketplace…</p>
              {:else if marketplaceThemes.length === 0}
                <p class="text-sm text-surface-500 mb-4">No marketplace themes available.</p>
              {:else}
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  {#each marketplaceThemes as item (item.id)}
                    <AdminCard class="p-4 border border-surface-500/30 dark:border-surface-500/40">
                      <h5 class="font-bold text-sm">{item.name}</h5>
                      <p class="text-xs text-surface-500 dark:text-surface-400 mt-1 mb-3 line-clamp-2">{item.description}</p>
                      <div class="flex items-center justify-between gap-2">
                        <Badge preset="tonal" color="surface" size="sm">{item.source}</Badge>
                        {#if item.installed}
                          <Badge preset="tonal" color="success" size="sm">Installed</Badge>
                        {:else if isAdmin}
                          <Button variant="tertiary" size="sm" onclick={() => installMarketplaceTheme(item.id)} loading={saving}>
                            Install
                          </Button>
                        {/if}
                      </div>
                    </AdminCard>
                  {/each}
                </div>
              {/if}

	              <h4 class="font-bold text-sm mb-2">Import Theme JSON</h4>
	              <p class="text-xs text-surface-500 dark:text-surface-400 mb-3">
	                Paste a SveltyCMS theme JSON export (or a shorthand palette block) to apply it.
	              </p>
	              <div class="space-y-3">
	                <Textarea
	                  bind:value={importPresetJson}
	                  label="Import theme JSON"
	                  textareaClass="min-h-30 font-mono text-xs"
	                  placeholder={'{"name":"My Theme","properties":{...}}'}
	                  rows={6}
	                />
	                <Button variant="tertiary" onclick={importPreset} loading={saving}>Import Theme</Button>
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
                {#each [{ d: 'compact', label: 'Compact', desc: 'Sidebar: 200px · Dense · Small text' }, { d: 'cozy', label: 'Cozy', desc: 'Sidebar: 240px · Balanced · Default' }, { d: 'spacious', label: 'Spacious', desc: 'Sidebar: 300px · Airy · Writer mode' }] as p (p.d)}
                  <AdminCard class="p-3 border {density === p.d ? 'border-tertiary-500 dark:border-primary-500 ring-2 ring-tertiary-500/20 dark:ring-primary-500/20' : 'border-surface-500/30 dark:border-surface-500/40'}">
                    <div class="text-xs font-bold mb-1">{p.label}</div>
                    <div class="text-[10px] text-surface-500">{p.desc}</div>
                  </AdminCard>
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
                <AdminCard class="p-6 {variant === 'flat' ? 'border-tertiary-500 dark:border-primary-500 ring-2' : ''}"
                  style="border-width: {variant === 'flat' ? '0' : 'var(--admin-border-width, 1px)'}; box-shadow: none;">
                  <div class="text-sm font-bold mb-2">Flat</div>
                  <div class="text-xs text-surface-500">No borders · No shadows</div>
                </AdminCard>
                <AdminCard class="p-6 {variant === 'bordered' ? 'border-tertiary-500 dark:border-primary-500 ring-2' : 'border-surface-500/30 dark:border-surface-500/40'}"
                  style="border-width: var(--admin-border-width, 1px); box-shadow: var(--admin-shadow-elevation, 0 1px 3px 0 rgb(0 0 0 / 0.1));">
                  <div class="text-sm font-bold mb-2">Bordered</div>
                  <div class="text-xs text-surface-500">Subtle border · Light shadow</div>
                </AdminCard>
                <AdminCard class="p-6 {variant === 'elevated' ? 'border-tertiary-500 dark:border-primary-500 ring-2' : ''}"
                  style="border-width: var(--admin-border-width, 1px); box-shadow: var(--admin-shadow-elevated, 0 10px 15px -3px rgb(0 0 0 / 0.05));">
                  <div class="text-sm font-bold mb-2">Elevated</div>
                  <div class="text-xs text-surface-500">Border · Prominent shadow</div>
                </AdminCard>
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
                <AdminCard class="p-4 border border-surface-500/30 dark:border-surface-500/40 flex items-center justify-between">
                  <div>
                    <div class="font-bold text-sm">Sticky Action Bar</div>
                    <div class="text-xs text-surface-500 dark:text-surface-400">Save/Delete buttons stick on scroll in content forms</div>
                  </div>
                  <Toggle bind:value={stickyActionBar} />
                </AdminCard>
                <AdminCard class="p-4 border border-surface-500/30 dark:border-surface-500/40 flex items-center justify-between">
                  <div>
                    <div class="font-bold text-sm">Collapsible Sidebar</div>
                    <div class="text-xs text-surface-500 dark:text-surface-400">Allow users to collapse the navigation sidebar</div>
                  </div>
                  <Toggle bind:value={collapsibleSidebar} />
                </AdminCard>
                <AdminCard class="p-4 border border-surface-500/30 dark:border-surface-500/40 flex items-center justify-between">
                  <div>
                    <div class="font-bold text-sm">Branded Login</div>
                    <div class="text-xs text-surface-500 dark:text-surface-400">Show tenant logo and custom colors on login page</div>
                  </div>
                  <Toggle bind:value={brandedLogin} />
                </AdminCard>
                <AdminCard class="p-4 border border-surface-500/30 dark:border-surface-500/40 flex items-center justify-between">
                  <div>
                    <div class="font-bold text-sm">High Contrast Mode</div>
                    <div class="text-xs text-surface-500 dark:text-surface-400">Enforce WCAG AAA contrast ratios across admin</div>
                  </div>
                  <Toggle bind:value={highContrastMode} />
                </AdminCard>
                <AdminCard class="p-4 border border-surface-500/30 dark:border-surface-500/40 flex items-center justify-between">
                  <div>
                    <div class="font-bold text-sm">Reduced Motion</div>
                    <div class="text-xs text-surface-500 dark:text-surface-400">Disable all animations and transitions globally</div>
                  </div>
                  <Toggle bind:value={reducedMotion} />
                </AdminCard>

                <!-- Layout Region: Collections Position -->
                <AdminCard class="p-4 border border-surface-500/30 dark:border-surface-500/40">
                  <div class="mb-3">
                    <div class="font-bold text-sm">Collections Position</div>
                    <div class="text-xs text-surface-500 dark:text-surface-400">Which sidebar shows the content collections tree</div>
                  </div>
                  <Select bind:value={collectionsLayout} options={collectionsLayoutOptions} />
                </AdminCard>

                <!-- Lock user overrides -->
                <AdminCard class="p-4 border border-warning-500/30 dark:border-warning-500/40 bg-warning-500/20 dark:bg-warning-900/10">
                  <div class="mb-3">
                    <div class="font-bold text-sm">Lock User Overrides</div>
                    <div class="text-xs text-surface-500 dark:text-surface-400">
                      Prevent users from changing these settings in My Overrides
                    </div>
                  </div>
                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Toggle bind:value={lockDensity} label="Lock density" />
                    <Toggle bind:value={lockVariant} label="Lock card style" />
                    <Toggle bind:value={lockReducedMotion} label="Lock reduced motion" />
                    <Toggle bind:value={lockHighContrast} label="Lock high contrast" />
                    <Toggle bind:value={lockLayoutState} label="Lock layout state" />
                  </div>
                </AdminCard>
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
                <Textarea
                  id="admin-custom-css"
                  label="Custom CSS"
                  bind:value={customCss}
                  textareaClass="min-h-50 font-mono text-xs"
                  placeholder={'/* Custom admin styles */\n.admin-special-header { border-color: oklch(65% 0.2 260deg); }'}
                  rows={10}
                />
                <p class="text-xs text-surface-500 dark:text-surface-400 mt-2">
                  Injected into admin panel. Dangerous constructs stripped.
                </p>
              </div>

              <AdminCard class="p-4 border border-surface-500/30 dark:border-surface-500/40">
                <h4 class="font-bold text-sm mb-3">Export / Import</h4>
                <div class="flex flex-wrap gap-2">
                  <Button variant="outline" onclick={exportTheme} leadingIcon="mdi:export">Export Theme JSON</Button>
                </div>
                <p class="text-xs text-surface-400 mt-2">Export current settings. Import via Presets tab.</p>
              </AdminCard>

              <AdminCard class="p-4 border border-error-500/30 dark:border-error-500/40 bg-error-500/30 dark:bg-error-900/10">
                <h4 class="font-bold text-sm text-error-600 dark:text-error-400 mb-2">Danger Zone</h4>
                <p class="text-xs text-surface-500 dark:text-surface-400 mb-3">Reset to factory defaults.</p>
                <Button variant="error" onclick={resetToDefaults} leadingIcon="mdi:restore-alert">Reset to Defaults</Button>
              </AdminCard>
            </div>
          </div>
        {/if}
      {/key}
    </div>
  </AdminCard>

  <!-- Save Bar (admin theme edits only) -->
  {#if hasChanges && isAdmin && activeTab !== "overrides" && activeTab !== "preview"}
    <div class="sticky bottom-0 z-30 -mx-6 -mb-6 px-6 py-4 border-t border-surface-500/30 dark:border-surface-500/40 bg-white/90 dark:bg-surface-900/90 backdrop-blur-md flex items-center justify-between">
      <p class="text-sm text-warning-600 dark:text-warning-400 font-medium">
        <iconify-icon icon="mdi:alert-circle" class="inline me-1" width="16"></iconify-icon>
        Unsaved changes — live preview active
      </p>
      <div class="flex gap-2">
        <Button variant="ghost" onclick={() => hasChanges = false} data-testid="appearance-theme-discard">Discard</Button>
        <Button variant="primary" onclick={saveTheme} loading={saving} data-testid="appearance-theme-save">Save Theme</Button>
      </div>
    </div>
  {/if}
</AdminPageShell>
