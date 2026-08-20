/**
 * @file src/stores/floating-nav-store.svelte.ts
 * @description
 * Shared per-user FloatingNav preferences: system defaults + custom page favorites.
 * PageTitle star and FloatingNav radial menu read/write the same store so they stay in sync.
 *
 * Responsibilities include:
 * - Providing system endpoint catalog with sensible first-run defaults.
 * - Letting users enable/disable system routes and pin arbitrary page favorites.
 * - Persisting prefs in localStorage keyed by user id.
 * - Guaranteeing fixed anchors (Home + Settings) so an "empty" menu never crashes the CMS.
 *
 * ### Features:
 * - system defaults on first start
 * - per-user localStorage namespace
 * - migration from legacy floatingNav_pins / floatingNav_favorites keys
 * - role-aware admin-only endpoints
 * - empty-safe resolve (fixed Home center + Settings)
 */

import { browser } from "$app/env";
import { isAdmin } from "@src/databases/auth/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FloatingNavItem {
  id: string;
  tooltip: string;
  path: string;
  icon: string;
  color?: string;
  external?: boolean;
}

export interface SystemEndpointDef extends FloatingNavItem {
  /** Hidden unless user is admin / role === admin */
  adminOnly?: boolean;
  /**
   * Always present in the radial menu. Cannot be removed via PageTitle star.
   * Used so an empty custom nav still shows a usable Home (and Settings) anchor.
   */
  fixed?: boolean;
}

export interface FloatingNavFavorite {
  id: string;
  path: string;
  tooltip: string;
  icon: string;
  color?: string;
  external?: boolean;
}

export interface FloatingNavPrefs {
  version: 1;
  /** System endpoint ids the user wants shown (fixed ids are always forced on resolve). */
  enabledSystemIds: string[];
  favorites: FloatingNavFavorite[];
}

export interface FloatingNavUserContext {
  role?: string;
  isAdmin?: boolean;
  _id?: string;
  id?: string;
}

// ---------------------------------------------------------------------------
// Catalog & defaults
// ---------------------------------------------------------------------------

/** Canonical system shortcuts available for the floating radial menu. */
export const SYSTEM_ENDPOINTS: readonly SystemEndpointDef[] = [
  {
    id: "home",
    tooltip: "Home",
    path: "/",
    icon: "solar:home-bold",
    fixed: true,
  },
  {
    id: "dashboard",
    tooltip: "Dashboard",
    path: "/dashboard",
    icon: "mdi:view-dashboard",
    color: "bg-blue-500",
  },
  {
    id: "user",
    tooltip: "User Profile",
    path: "/user",
    icon: "radix-icons:avatar",
    color: "bg-orange-500",
  },
  {
    id: "collectionbuilder",
    tooltip: "Collection Builder",
    path: "/config/collectionbuilder",
    icon: "fluent-mdl2:build-definition",
    color: "bg-green-500",
    adminOnly: true,
  },
  {
    id: "graphql",
    tooltip: "GraphQL Explorer",
    path: "/api/graphql",
    icon: "teenyicons:graphql-outline",
    color: "bg-pink-500",
    external: true,
  },
  {
    id: "config",
    tooltip: "System Configuration",
    path: "/config",
    icon: "mynaui:config",
    color: "bg-surface-400",
  },
  {
    id: "access",
    tooltip: "Access Management",
    path: "/config/access-management",
    icon: "mdi:shield-account",
    color: "bg-purple-500",
  },
  {
    id: "marketplace",
    tooltip: "Marketplace",
    path: "https://www.sveltycms.com",
    icon: "icon-park-outline:shopping-bag",
    color: "bg-primary-700",
    external: true,
  },
  {
    id: "media",
    tooltip: "Media Gallery",
    path: "/mediagallery",
    icon: "mdi:image-multiple",
    color: "bg-teal-500",
  },
  {
    id: "settings",
    tooltip: "System Settings",
    path: "/config/system-settings",
    icon: "mdi:cog",
    color: "bg-slate-500",
    fixed: true,
  },
] as const;

/** First-run system shortcuts (fixed ids are always included even if omitted). */
export const DEFAULT_ENABLED_SYSTEM_IDS: readonly string[] = [
  "home",
  "dashboard",
  "user",
  "config",
  "media",
  "settings",
] as const;

export const PREFS_VERSION = 1 as const;
export const LEGACY_PINS_KEY = "floatingNav_pins";
export const LEGACY_FAVORITES_KEY = "floatingNav_favorites";
/** Default radial spoke bg when PageTitle does not pass `navColor`. */
export const DEFAULT_FAVORITE_COLOR = "bg-amber-500";

/**
 * Allowed Tailwind bg utilities for custom favorite spokes.
 * MUST stay literals in source: Tailwind v4's JIT only emits classes it scans,
 * so a runtime-only class string would render an uncolored spoke. Pick from this
 * list (typed as `NavFavoriteColor`) instead of inventing new class strings.
 */
export const NAV_FAVORITE_COLORS = [
  "bg-amber-500",
  "bg-teal-500",
  "bg-blue-500",
  "bg-indigo-500",
  "bg-purple-500",
  "bg-pink-500",
  "bg-red-500",
  "bg-orange-500",
  "bg-green-500",
  "bg-slate-500",
  "bg-surface-400",
  "bg-primary-700",
  "bg-tertiary-500",
] as const;

export type NavFavoriteColor = (typeof NAV_FAVORITE_COLORS)[number];

/** Runtime guard for legacy/plain-JS callers — also the JIT allowlist. */
export function isNavFavoriteColor(color: string): color is NavFavoriteColor {
  return (NAV_FAVORITE_COLORS as readonly string[]).includes(color);
}

const STORAGE_PREFIX = "floatingNav_prefs:v1:";

// ---------------------------------------------------------------------------
// Pure helpers (unit-testable)
// ---------------------------------------------------------------------------

/** Normalize path for membership checks (trailing slash, empty → `/`). */
export function normalizeNavPath(path: string): string {
  if (!path || path === "/") return "/";
  // External URLs: leave intact
  if (/^https?:\/\//i.test(path)) return path;
  const trimmed = path.replace(/\/+$/, "");
  return trimmed.length > 0 ? trimmed : "/";
}

export function getUserStorageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

export function isAdminUser(user?: FloatingNavUserContext | null): boolean {
  return isAdmin(user);
}

export function findSystemEndpointByPath(pathname: string): SystemEndpointDef | undefined {
  const norm = normalizeNavPath(pathname);
  return SYSTEM_ENDPOINTS.find((e) => normalizeNavPath(e.path) === norm);
}

export function getFixedSystemEndpoints(): SystemEndpointDef[] {
  return SYSTEM_ENDPOINTS.filter((e) => e.fixed);
}

export function createDefaultPrefs(): FloatingNavPrefs {
  return {
    version: PREFS_VERSION,
    enabledSystemIds: [...DEFAULT_ENABLED_SYSTEM_IDS],
    favorites: [],
  };
}

/** Flatten legacy favorite shapes (`url.path` or `path`) into canonical favorites. */
export function migrateLegacyFavorites(raw: unknown): FloatingNavFavorite[] {
  if (!Array.isArray(raw)) return [];
  const out: FloatingNavFavorite[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const f = entry as Record<string, unknown>;
    const url = f.url as { path?: string; external?: boolean } | undefined;
    const pathRaw =
      typeof url?.path === "string" ? url.path : typeof f.path === "string" ? f.path : null;
    if (!pathRaw) continue;
    const path = normalizeNavPath(pathRaw);
    if (seen.has(path)) continue;
    seen.add(path);

    out.push({
      id: typeof f.id === "string" ? f.id : `fav_${path}`,
      path,
      tooltip: typeof f.tooltip === "string" ? f.tooltip : path,
      icon: typeof f.icon === "string" ? f.icon : "mdi:bookmark",
      color: typeof f.color === "string" ? f.color : DEFAULT_FAVORITE_COLOR,
      external: url?.external === true || f.external === true,
    });
  }

  return out;
}

export function migrateLegacyPins(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const ids = raw.filter((id): id is string => typeof id === "string");
  return ids;
}

/**
 * Parse stored JSON into prefs, migrating legacy pin/favorite keys when needed.
 * Pure: does not touch localStorage.
 */
export function parsePrefsPayload(
  raw: string | null,
  legacyPins: string | null = null,
  legacyFavorites: string | null = null,
): FloatingNavPrefs {
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<FloatingNavPrefs>;
      if (parsed && typeof parsed === "object") {
        const enabled =
          Array.isArray(parsed.enabledSystemIds) &&
          parsed.enabledSystemIds.every((x) => typeof x === "string")
            ? [...parsed.enabledSystemIds]
            : [...DEFAULT_ENABLED_SYSTEM_IDS];
        return {
          version: PREFS_VERSION,
          enabledSystemIds: enabled,
          favorites: migrateLegacyFavorites(parsed.favorites ?? []),
        };
      }
    } catch {
      // fall through to legacy / defaults
    }
  }

  // Legacy migration path
  let enabledSystemIds = [...DEFAULT_ENABLED_SYSTEM_IDS];
  if (legacyPins) {
    try {
      const pins = migrateLegacyPins(JSON.parse(legacyPins));
      if (pins) {
        // Legacy always forced home; keep that contract + merge defaults user never saw UI for
        const set = new Set<string>(["home", ...pins]);
        // If only home was stored (old default), upgrade to full first-run defaults
        if (pins.length === 0 || (pins.length === 1 && pins[0] === "home")) {
          enabledSystemIds = [...DEFAULT_ENABLED_SYSTEM_IDS];
        } else {
          enabledSystemIds = [...set];
        }
      }
    } catch {
      /* keep defaults */
    }
  }

  let favorites: FloatingNavFavorite[] = [];
  if (legacyFavorites) {
    try {
      favorites = migrateLegacyFavorites(JSON.parse(legacyFavorites));
    } catch {
      favorites = [];
    }
  }

  return {
    version: PREFS_VERSION,
    enabledSystemIds,
    favorites,
  };
}

/**
 * Build the ordered list of radial endpoints for the current user.
 * Fixed endpoints (Home, Settings) are always present — never returns empty.
 */
export function resolveFloatingNavEndpoints(
  prefs: FloatingNavPrefs,
  user?: FloatingNavUserContext | null,
): FloatingNavItem[] {
  const admin = isAdminUser(user);
  const enabled = new Set(prefs.enabledSystemIds);
  for (const fixed of getFixedSystemEndpoints()) {
    enabled.add(fixed.id);
  }

  const systemItems: FloatingNavItem[] = [];
  for (const endpoint of SYSTEM_ENDPOINTS) {
    if (endpoint.adminOnly && !admin) continue;
    if (!enabled.has(endpoint.id) && !endpoint.fixed) continue;
    systemItems.push({
      id: endpoint.id,
      tooltip: endpoint.tooltip,
      path: endpoint.path,
      icon: endpoint.icon,
      color: endpoint.color,
      external: endpoint.external,
    });
  }

  // Favorites never re-list known system routes (enabled or not) — those are toggled via enabledSystemIds only
  const allSystemPaths = new Set(SYSTEM_ENDPOINTS.map((e) => normalizeNavPath(e.path)));
  const uniqueFavorites: FloatingNavItem[] = [];
  for (const fav of prefs.favorites) {
    const path = normalizeNavPath(fav.path);
    if (!path || allSystemPaths.has(path)) continue;
    uniqueFavorites.push({
      id: fav.id,
      tooltip: fav.tooltip,
      path,
      icon: fav.icon || "mdi:bookmark",
      color: fav.color || DEFAULT_FAVORITE_COLOR,
      external: fav.external,
    });
  }

  const list = [...systemItems, ...uniqueFavorites];

  // Hard guarantee: never empty (Home at minimum)
  if (list.length === 0) {
    const home = SYSTEM_ENDPOINTS.find((e) => e.id === "home")!;
    return [
      {
        id: home.id,
        tooltip: home.tooltip,
        path: home.path,
        icon: home.icon,
        color: home.color,
        external: home.external,
      },
    ];
  }

  // Ensure Home is first so FloatingNav can use index 0 as the fixed center button
  const homeIdx = list.findIndex((e) => e.id === "home");
  if (homeIdx > 0) {
    const [home] = list.splice(homeIdx, 1);
    list.unshift(home);
  } else if (homeIdx === -1) {
    const home = SYSTEM_ENDPOINTS.find((e) => e.id === "home")!;
    list.unshift({
      id: home.id,
      tooltip: home.tooltip,
      path: home.path,
      icon: home.icon,
      color: home.color,
      external: home.external,
    });
  }

  return list;
}

/** Whether the current page is pinned in system defaults or custom favorites. */
export function isPathActiveInPrefs(prefs: FloatingNavPrefs, pathname: string): boolean {
  const norm = normalizeNavPath(pathname);
  const system = findSystemEndpointByPath(norm);
  if (system) {
    if (system.fixed) return true;
    return prefs.enabledSystemIds.includes(system.id);
  }
  return prefs.favorites.some((f) => normalizeNavPath(f.path) === norm);
}

/** Whether the star control can remove this path (fixed system routes cannot). */
export function isPathFixed(pathname: string): boolean {
  const system = findSystemEndpointByPath(pathname);
  return system?.fixed === true;
}

/**
 * Toggle membership of the current page in prefs.
 * System routes toggle enabledSystemIds; other routes toggle favorites.
 * Fixed routes are no-ops (always on).
 */
/** Meta captured from PageTitle when starring a custom route. */
export type FloatingNavPageMeta = {
  name: string;
  icon?: string;
  /** Tailwind bg utility for the radial spoke — must be a NAV_FAVORITE_COLORS literal (JIT). */
  color?: NavFavoriteColor;
};

export function togglePathInPrefs(
  prefs: FloatingNavPrefs,
  pathname: string,
  meta: FloatingNavPageMeta,
): FloatingNavPrefs {
  const norm = normalizeNavPath(pathname);
  const system = findSystemEndpointByPath(norm);

  if (system) {
    if (system.fixed) {
      return prefs;
    }
    const enabled = new Set(prefs.enabledSystemIds);
    if (enabled.has(system.id)) {
      enabled.delete(system.id);
    } else {
      enabled.add(system.id);
    }
    // Always keep fixed ids in the stored list for clarity
    for (const fixed of getFixedSystemEndpoints()) {
      enabled.add(fixed.id);
    }
    // Drop any legacy favorites that mirror this system path
    const favorites = prefs.favorites.filter((f) => normalizeNavPath(f.path) !== norm);
    return {
      ...prefs,
      enabledSystemIds: [...enabled],
      favorites,
    };
  }

  const favorites = [...prefs.favorites];
  const existingIdx = favorites.findIndex((f) => normalizeNavPath(f.path) === norm);
  if (existingIdx >= 0) {
    favorites.splice(existingIdx, 1);
  } else {
    favorites.push({
      // CSPRNG id — these key the FloatingNav {#each}, and Date.now() collisions
      // (same-ms double toggle) would corrupt keyed reconciliation.
      id: `fav_${crypto.randomUUID()}`,
      path: norm,
      tooltip: meta.name,
      icon: meta.icon || "mdi:bookmark",
      // Runtime-guard the color so unknown class strings (and their missing JIT
      // CSS) can never reach the spoke — fall back to the compiled default.
      color: meta.color && isNavFavoriteColor(meta.color) ? meta.color : DEFAULT_FAVORITE_COLOR,
      external: false,
    });
  }

  return {
    ...prefs,
    favorites,
  };
}

// ---------------------------------------------------------------------------
// Reactive store (singleton)
// ---------------------------------------------------------------------------

class FloatingNavStore {
  /** Currently scoped user id (localStorage namespace). */
  userId = $state<string | null>(null);
  enabledSystemIds = $state<string[]>([...DEFAULT_ENABLED_SYSTEM_IDS]);
  favorites = $state<FloatingNavFavorite[]>([]);
  /** Bumps on every mutation so consumers can `$derived` off it. */
  version = $state(0);
  ready = $state(false);
  /** Cross-tab sync listener bound once (storage events fire in OTHER tabs only). */
  private _tabSyncBound = false;

  get prefs(): FloatingNavPrefs {
    return {
      version: PREFS_VERSION,
      enabledSystemIds: this.enabledSystemIds,
      favorites: this.favorites,
    };
  }

  /**
   * Scope prefs to a user. Re-loads from localStorage when the user changes.
   * Call from layout / FloatingNav / PageTitle with `page.data.user`.
   */
  bindUser(user?: FloatingNavUserContext | null): void {
    if (!browser) {
      this.ready = true;
      return;
    }

    const nextId = String(user?._id ?? user?.id ?? "anonymous");
    if (this.userId === nextId && this.ready) {
      return;
    }

    // 🛡️ Hardening: a page whose +page.server.ts shadows `data.user` with a partial
    // shape (no _id/id) resolves to "anonymous". Such a bind must never evict an
    // already-bound real user — otherwise two bindUser() effects (layout vs a
    // component reading page.data.user) flip-flop the store into an infinite
    // effect loop (Svelte effect_update_depth_exceeded).
    if (this.ready && this.userId !== "anonymous" && nextId === "anonymous") {
      return;
    }

    this.userId = nextId;
    this.load();
    this._bindTabSync();
  }

  /** Keep multiple tabs in sync — storage events fire in every OTHER tab. */
  private _bindTabSync(): void {
    if (this._tabSyncBound) return;
    this._tabSyncBound = true;
    window.addEventListener("storage", this._onStorageEvent);
  }

  private _onStorageEvent = (event: StorageEvent): void => {
    const key = getUserStorageKey(this.userId ?? "anonymous");
    if (event.key !== key || event.newValue == null) return;
    // Equality guard prevents a persist() feedback loop between tabs.
    if (event.newValue === JSON.stringify(this.prefs)) return;
    this.applyPrefs(parsePrefsPayload(event.newValue));
  };

  load(): void {
    if (!browser) {
      this.ready = true;
      return;
    }

    const key = getUserStorageKey(this.userId ?? "anonymous");
    let raw: string | null = null;
    let legacyPins: string | null = null;
    let legacyFavorites: string | null = null;

    try {
      raw = localStorage.getItem(key);
      // Only migrate legacy global keys into the first user that binds without prefs
      if (!raw) {
        legacyPins = localStorage.getItem(LEGACY_PINS_KEY);
        legacyFavorites = localStorage.getItem(LEGACY_FAVORITES_KEY);
      }
    } catch {
      /* ignore */
    }

    const prefs = parsePrefsPayload(raw, legacyPins, legacyFavorites);
    this.enabledSystemIds = prefs.enabledSystemIds;
    this.favorites = prefs.favorites;
    this.version += 1;
    this.ready = true;

    // Persist migrated shape under the per-user key and drop legacy globals once
    if (!raw && (legacyPins || legacyFavorites)) {
      this.persist();
      try {
        localStorage.removeItem(LEGACY_PINS_KEY);
        localStorage.removeItem(LEGACY_FAVORITES_KEY);
      } catch {
        /* ignore */
      }
    }
  }

  persist(): void {
    if (!browser || !this.userId) return;
    try {
      localStorage.setItem(getUserStorageKey(this.userId), JSON.stringify(this.prefs));
    } catch {
      /* quota / private mode */
    }
  }

  applyPrefs(prefs: FloatingNavPrefs): void {
    this.enabledSystemIds = [...prefs.enabledSystemIds];
    this.favorites = prefs.favorites.map((f) => ({ ...f }));
    this.version += 1;
    this.persist();
  }

  resolveEndpoints(user?: FloatingNavUserContext | null): FloatingNavItem[] {
    // Touch version so callers re-run when prefs change
    void this.version;
    return resolveFloatingNavEndpoints(this.prefs, user);
  }

  isActive(pathname: string): boolean {
    void this.version;
    return isPathActiveInPrefs(this.prefs, pathname);
  }

  isFixed(pathname: string): boolean {
    return isPathFixed(pathname);
  }

  togglePage(pathname: string, meta: FloatingNavPageMeta): void {
    const next = togglePathInPrefs(this.prefs, pathname, meta);
    this.applyPrefs(next);
  }

  /** Reset to first-run system defaults (clears custom favorites). */
  resetToDefaults(): void {
    this.applyPrefs(createDefaultPrefs());
  }
}

export const floatingNavStore = new FloatingNavStore();
