/**
 * @file src/stores/dashboard-preferences.svelte.ts
 * @description Dashboard widget layout preferences with server persistence (Svelte 5 runes)
 */

import type { DashboardWidgetConfig, Layout } from "@src/content/types";
import { logger } from "@utils/logger";

const LAYOUT_KEY = "dashboard.layout.default";

// --- API Helpers ---

function csrfHeaders(json = true): Record<string, string> {
  const headers: Record<string, string> = {};
  if (json) headers["Content-Type"] = "application/json";
  try {
    // Prefer page-provided token when available (SSR hydration / layout data)
    const fromPage =
      typeof document !== "undefined"
        ? (document.querySelector('meta[name="csrf-token"]') as HTMLMetaElement | null)?.content
        : null;
    // Fallback: double-submit cookie name used by csrf-utils (non-httpOnly in some envs
    // is rare; layout usually exposes csrfToken on window via page.data — callers may
    // also pass token through body if cookie is httpOnly).
    const fromCookie =
      typeof document !== "undefined"
        ? document.cookie
            .split("; ")
            .find((r) => r.startsWith("csrf_token=") || r.startsWith("__Host-csrf_token="))
            ?.split("=")[1]
        : undefined;
    const token = fromPage || fromCookie || (globalThis as any).__csrfToken;
    if (token) headers["X-CSRF-Token"] = decodeURIComponent(token);
  } catch {
    /* non-critical */
  }
  return headers;
}

async function fetchLayout(): Promise<Layout | null> {
  try {
    const res = await fetch(`/api/system-preferences?key=${LAYOUT_KEY}`);
    if (res.status === 404) {
      logger.info("No saved dashboard layout, using default");
      return null;
    }
    if (!res.ok) {
      throw new Error(`Fetch failed: ${res.statusText}`);
    }
    const body = await res.json();
    // Prefer { value: Layout } envelope, else raw Layout
    if (body && typeof body === "object" && "value" in body) {
      return body.value as Layout;
    }
    if (body && typeof body === "object" && "preferences" in body) {
      return body as Layout;
    }
    if (body?.data) return body.data as Layout;
    return null;
  } catch (e) {
    logger.error("Failed to fetch preferences:", e);
    throw e;
  }
}

async function saveLayout(layout: Layout): Promise<void> {
  try {
    const res = await fetch("/api/system-preferences", {
      method: "POST",
      headers: csrfHeaders(true),
      body: JSON.stringify({ key: LAYOUT_KEY, value: layout }),
    });
    if (!res.ok) {
      throw new Error(`Save failed: ${res.statusText}`);
    }
  } catch (e) {
    logger.error("Failed to save preferences:", e);
    throw e;
  }
}

// --- Store ---

class PreferencesStore {
  preferences = $state<DashboardWidgetConfig[]>([]);
  loading = $state(true);
  error = $state<string | null>(null);

  async load() {
    this.loading = true;
    this.error = null;

    try {
      const layout = await fetchLayout();
      this.preferences = (layout?.preferences || []).map((w) => ({
        ...w,
        size: w.size?.w && w.size?.h ? w.size : { w: 1, h: 1 },
      }));
    } catch (e) {
      this.error = e instanceof Error ? e.message : "Unknown error";
      this.preferences = [];
    } finally {
      this.loading = false;
    }
  }

  async set(preferences: DashboardWidgetConfig[]) {
    this.preferences = preferences;
    await saveLayout({
      id: "default",
      name: "Default",
      preferences,
    });
  }

  async updateWidget(widget: DashboardWidgetConfig) {
    const prefs = [...this.preferences];
    const idx = prefs.findIndex((w) => w.id === widget.id);

    if (idx > -1) {
      prefs[idx] = widget;
    } else {
      prefs.push(widget);
    }

    this.preferences = prefs;
    await saveLayout({ id: "default", name: "Default", preferences: prefs });
  }

  async updateWidgets(widgets: DashboardWidgetConfig[]) {
    const ordered = widgets.map((w, i) => ({ ...w, order: i }));
    this.preferences = ordered;
    await saveLayout({ id: "default", name: "Default", preferences: ordered });
  }

  async removeWidget(id: string) {
    const prefs = this.preferences.filter((w) => w.id !== id);
    this.preferences = prefs;
    await saveLayout({ id: "default", name: "Default", preferences: prefs });
  }

  // Compatibility aliases
  async loadPreferences() {
    return this.load();
  }

  async setPreferences(prefs: DashboardWidgetConfig[]) {
    return this.set(prefs);
  }
}

export const preferences = new PreferencesStore();
export const systemPreferences = preferences;
