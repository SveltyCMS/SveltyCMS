/**
 * @file src/stores/plugin-workspace.svelte.ts
 * @description Active plugin workspace state — opens plugin GUIs via slots, not routes.
 *
 * ### Features:
 * - URL-synced via `?plugin=<id>` search param
 * - slot-driven fullscreen overlay rendering
 */

import { browser } from "$app/environment";

const PLUGIN_PARAM = "plugin";

function readPluginFromUrl(): string | null {
  if (!browser) return null;
  return new URL(location.href).searchParams.get(PLUGIN_PARAM);
}

function writePluginToUrl(pluginId: string | null, replace = false): void {
  if (!browser) return;
  const url = new URL(location.href);
  if (pluginId) {
    url.searchParams.set(PLUGIN_PARAM, pluginId);
  } else {
    url.searchParams.delete(PLUGIN_PARAM);
  }
  history[replace ? "replaceState" : "pushState"]({}, "", url);
}

class PluginWorkspaceStore {
  activePluginId = $state<string | null>(readPluginFromUrl());

  open(pluginId: string): void {
    this.activePluginId = pluginId;
    writePluginToUrl(pluginId);
  }

  close(): void {
    this.activePluginId = null;
    writePluginToUrl(null);
  }

  syncFromUrl(): void {
    this.activePluginId = readPluginFromUrl();
  }

  get isOpen(): boolean {
    return this.activePluginId !== null;
  }
}

export const pluginWorkspace = new PluginWorkspaceStore();

if (browser) {
  window.addEventListener("popstate", () => pluginWorkspace.syncFromUrl());
}
