/**
 * @file src/routes/api/[...path]/handlers/dashboard-license.ts
 * @description Server-side license gate for premium dashboard widget endpoints.
 *
 * Dashboard widgets enforce licensing on BOTH sides, mirroring custom widgets
 * and plugins:
 * - Client: each widget checks `/api/system/license-status?type=dashboard&id=<id>`
 *   and renders an upgrade prompt when the trial expired without a license.
 * - Server (here): the backing API endpoint calls `checkExtensionLicense` and
 *   returns 403 when the widget's trial expired and no license is configured —
 *   premium data can never be fetched without entitlement.
 *
 * ### Features:
 * - endpoint → widget-id map for premium dashboard endpoints
 * - fail-open for free/unregistered widgets (treated as licensed by the manager)
 * - 14-day key-less trial + `SLM-`/`SLM-DEMO-` keys handled by the license manager
 */

import { checkExtensionLicense } from "@src/utils/license-manager";
import { raise } from "@utils/error-handling";
import { logger } from "@utils/logger";

/**
 * Premium dashboard endpoints → the widget id (from `widget.json`) whose license
 * gates the endpoint. Free widgets (cpu, memory, disk, system-health,
 * last5-content, last5media, system-messages, tenant-analytics,
 * media-storage-analytics) are intentionally NOT gated.
 *
 * `metrics` feeds both the unified-metrics and performance widgets — both use
 * the same install-wide trial model, so gating on unified-metrics covers both.
 */
export const DASHBOARD_ENDPOINT_LICENSE: Readonly<Record<string, string>> = {
  audit: "audit-log",
  logs: "logs",
  security: "security",
  scim: "scim-status",
  "cache-metrics": "cache-monitor",
  "online-user": "user-online",
  metrics: "unified-metrics",
};

/**
 * Returns the widget id that gates an endpoint (undefined for free endpoints).
 */
export function getDashboardEndpointLicense(method: string): string | undefined {
  return DASHBOARD_ENDPOINT_LICENSE[method.toLowerCase()];
}

/**
 * Throws 403 when the widget's trial expired and no license is configured.
 * No-op for free/unregistered widgets (license manager treats them as licensed).
 */
export async function requireDashboardWidgetLicense(widgetId: string): Promise<void> {
  const status = await checkExtensionLicense("dashboard", widgetId);
  if (!status.active && !status.hasLicense) {
    logger.warn(`[Dashboard] License gate blocked widget "${widgetId}" (no active license/trial)`);
    raise(
      403,
      `The "${widgetId}" dashboard widget requires an active license or trial`,
      "LICENSE_REQUIRED",
    );
  }
}

/**
 * Convenience: gate the current dashboard endpoint by method name.
 */
export async function checkDashboardEndpointLicense(method: string): Promise<void> {
  const widgetId = getDashboardEndpointLicense(method);
  if (widgetId) {
    await requireDashboardWidgetLicense(widgetId);
  }
}
