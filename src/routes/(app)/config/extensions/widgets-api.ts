/**
 * @file src/routes/(app)/config/extensions/widgets-api.ts
 * @description Browser API client for extension widget management (Testing 2026).
 *
 * Mutations go through fetchApi so CSRF is automatic.
 */

import { fetchApi, type ApiResponse } from "@utils/api";

export interface WidgetListItem {
  name: string;
  isActive: boolean;
  isCore?: boolean;
  canDisable?: boolean;
  description?: string;
  icon?: string;
  dependencies?: string[];
  pillar?: {
    input?: { exists: boolean };
    display?: { exists: boolean };
  };
}

export function unwrapWidgetList(result: ApiResponse<unknown>): WidgetListItem[] {
  if (!result.success) return [];
  const raw = (result as { data?: unknown }).data ?? result;
  if (Array.isArray(raw)) return raw as WidgetListItem[];
  if (raw && typeof raw === "object") {
    const obj = raw as { widgets?: unknown; data?: { widgets?: unknown } };
    if (Array.isArray(obj.widgets)) return obj.widgets as WidgetListItem[];
    if (Array.isArray(obj.data?.widgets)) return obj.data!.widgets as WidgetListItem[];
  }
  return [];
}

export async function listWidgets(): Promise<ApiResponse<{ widgets: WidgetListItem[] }>> {
  return fetchApi<{ widgets: WidgetListItem[] }>("/api/widgets/list");
}

export async function setWidgetStatus(
  widgetName: string,
  isActive: boolean,
  tenantId?: string,
): Promise<ApiResponse<unknown>> {
  const headers: Record<string, string> = {};
  if (tenantId) headers["X-Tenant-ID"] = tenantId;
  return fetchApi("/api/widgets/status", {
    method: "POST",
    headers,
    body: JSON.stringify({ widgetName, isActive }),
  });
}

export async function uninstallWidget(
  widgetName: string,
  tenantId?: string,
): Promise<ApiResponse<unknown>> {
  const headers: Record<string, string> = {};
  if (tenantId) headers["X-Tenant-ID"] = tenantId;
  return fetchApi("/api/widgets/uninstall", {
    method: "POST",
    headers,
    body: JSON.stringify({ widgetName }),
  });
}
