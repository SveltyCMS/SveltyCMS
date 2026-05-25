/**
 * @file src/routes/(app)/config/system-settings/settings.remote.ts
 * @description Settings Remote Functions — callable from client components.
 *
 * Wraps the REST API with typed functions. When $app/server stabilizes,
 * swap fetch() for locals.cms internally with zero component changes.
 */

export interface SettingsResult {
  success: boolean;
  values?: Record<string, unknown>;
  message?: string;
  error?: string;
}

export async function loadSettingsGroup(
  groupId: string,
  bypassCache = false,
): Promise<SettingsResult> {
  const url = bypassCache
    ? `/api/settings/${groupId}?refresh=true`
    : `/api/settings/${groupId}`;
  const r = await fetch(url);
  const d = await r.json();
  return d.success
    ? { success: true, values: d.values || {} }
    : { success: false, error: d.message };
}

export async function saveSettingsGroup(
  groupId: string,
  values: Record<string, unknown>,
): Promise<SettingsResult> {
  const r = await fetch(`/api/settings/${groupId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(values),
  });
  const d = await r.json();
  return d.success
    ? { success: true, message: "Saved", values: d.values }
    : { success: false, error: d.message };
}

export async function resetSettingsGroup(
  groupId: string,
): Promise<SettingsResult> {
  const r = await fetch(`/api/settings/${groupId}`, { method: "DELETE" });
  const d = await r.json();
  return d.success
    ? { success: true, message: "Reset to defaults" }
    : { success: false, error: d.message };
}

export async function loadAllSettings(): Promise<SettingsResult> {
  const r = await fetch("/api/settings/all");
  const d = await r.json();
  return d.success
    ? { success: true, values: d.groups || d.values }
    : { success: false, error: d.message };
}
