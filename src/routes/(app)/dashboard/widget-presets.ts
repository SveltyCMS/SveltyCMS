/**
 * @file src/routes/(app)/dashboard/widget-presets.ts
 * @description Curated dashboard layout presets for SveltyCMS administrators and power users.
 *
 * Features:
 * - Ready-to-use smart layout templates (Overview, Monitoring, Editorial, Governance, Minimal)
 * - Deterministic widget ordering and responsive sizing
 * - Instant layout hydration and user preference updates
 */

import type { DashboardWidgetConfig, WidgetSize } from "@src/content/types";

export interface DashboardLayoutPreset {
  id: string;
  name: string;
  description: string;
  icon: string;
  widgets: Array<{
    component: string;
    label: string;
    icon: string;
    size: WidgetSize;
  }>;
}

export const DASHBOARD_PRESETS: DashboardLayoutPreset[] = [
  {
    id: "default",
    name: "Overview",
    description: "Balanced overview of system health, active users, tasks, and system activity.",
    icon: "mdi:view-dashboard-outline",
    widgets: [
      { component: "cpu", label: "CPU Usage", icon: "mdi:cpu-64-bit", size: { w: 1, h: 2 } },
      { component: "memory", label: "Memory Usage", icon: "mdi:memory", size: { w: 1, h: 2 } },
      { component: "disk", label: "Disk Usage", icon: "mdi:harddisk", size: { w: 1, h: 2 } },
      {
        component: "system-messages",
        label: "System Messages",
        icon: "mdi:message-badge-outline",
        size: { w: 1, h: 2 },
      },
      { component: "audit-log", label: "Audit Log", icon: "mdi:history", size: { w: 2, h: 2 } },
      {
        component: "user-online",
        label: "Active Users",
        icon: "mdi:account-group",
        size: { w: 1, h: 2 },
      },
      {
        component: "todo-list",
        label: "TODO List",
        icon: "mdi:checkbox-marked-outline",
        size: { w: 1, h: 2 },
      },
    ],
  },
  {
    id: "monitoring",
    name: "System Monitoring",
    description: "Deep dive into real-time server vitals, cache hits, database pool, and uptime.",
    icon: "mdi:server-network",
    widgets: [
      { component: "cpu", label: "CPU Usage", icon: "mdi:cpu-64-bit", size: { w: 1, h: 2 } },
      { component: "memory", label: "Memory Usage", icon: "mdi:memory", size: { w: 1, h: 2 } },
      { component: "disk", label: "Disk Usage", icon: "mdi:harddisk", size: { w: 1, h: 2 } },
      {
        component: "cache-monitor",
        label: "Cache Monitor",
        icon: "mdi:lightning-bolt",
        size: { w: 1, h: 2 },
      },
      {
        component: "system-health",
        label: "System Health",
        icon: "mdi:heart-pulse",
        size: { w: 2, h: 2 },
      },
      {
        component: "database-pool-diagnostics",
        label: "Connection Pool",
        icon: "mdi:database-cog",
        size: { w: 2, h: 2 },
      },
      {
        component: "performance",
        label: "Performance",
        icon: "mdi:speedometer",
        size: { w: 2, h: 2 },
      },
      {
        component: "system-messages",
        label: "System Messages",
        icon: "mdi:message-badge-outline",
        size: { w: 2, h: 2 },
      },
    ],
  },
  {
    id: "editorial",
    name: "Content & Editorial",
    description:
      "Content management hub with recent entries, media assets, charts, and team tasks.",
    icon: "mdi:file-document-edit-outline",
    widgets: [
      {
        component: "last5-content",
        label: "Recent Content",
        icon: "mdi:file-document-multiple-outline",
        size: { w: 2, h: 2 },
      },
      {
        component: "last5-media",
        label: "Recent Media",
        icon: "mdi:image-multiple-outline",
        size: { w: 2, h: 2 },
      },
      {
        component: "collection-list",
        label: "Collections",
        icon: "mdi:folder-outline",
        size: { w: 2, h: 2 },
      },
      {
        component: "collection-chart",
        label: "Content Distribution",
        icon: "mdi:chart-bar",
        size: { w: 2, h: 2 },
      },
      {
        component: "todo-list",
        label: "Editorial Tasks",
        icon: "mdi:checkbox-marked-outline",
        size: { w: 2, h: 2 },
      },
      {
        component: "user-online",
        label: "Active Users",
        icon: "mdi:account-group",
        size: { w: 2, h: 2 },
      },
    ],
  },
  {
    id: "governance",
    name: "Security & Governance",
    description:
      "Enterprise security monitoring, identity provider status, and tenant activity audit.",
    icon: "mdi:shield-lock-outline",
    widgets: [
      {
        component: "security",
        label: "Security Status",
        icon: "mdi:shield-check",
        size: { w: 2, h: 2 },
      },
      { component: "audit-log", label: "Audit Log", icon: "mdi:history", size: { w: 2, h: 2 } },
      {
        component: "scim-status",
        label: "SCIM Identity",
        icon: "mdi:account-sync",
        size: { w: 2, h: 2 },
      },
      {
        component: "tenant-analytics",
        label: "Tenant Analytics",
        icon: "mdi:chart-timeline-variant",
        size: { w: 2, h: 2 },
      },
      {
        component: "system-messages",
        label: "System Messages",
        icon: "mdi:message-badge-outline",
        size: { w: 4, h: 2 },
      },
    ],
  },
  {
    id: "minimal",
    name: "Minimal",
    description: "Compact dashboard focusing only on high-level system status and notifications.",
    icon: "mdi:view-compact-outline",
    widgets: [
      {
        component: "system-health",
        label: "System Health",
        icon: "mdi:heart-pulse",
        size: { w: 2, h: 2 },
      },
      {
        component: "system-messages",
        label: "System Messages",
        icon: "mdi:message-badge-outline",
        size: { w: 2, h: 2 },
      },
    ],
  },
];

export interface PresetResolution {
  /** Widgets the preset can materialise for the given registry. */
  widgets: DashboardWidgetConfig[];
  /** Preset component ids that are absent from the registry (RBAC/plugin gating or drift). */
  unavailable: string[];
}

/**
 * Resolves a preset against the installed widget registry.
 *
 * The `unavailable` list is what lets the dashboard explain an empty result:
 * a preset whose every package is gated (requiresAdmin / requiresPlugin) must
 * never silently persist an empty layout.
 */
export function resolvePresetWidgets(
  preset: DashboardLayoutPreset,
  availableComponentNames?: ReadonlySet<string>,
): PresetResolution {
  const widgets: DashboardWidgetConfig[] = [];
  const unavailable: string[] = [];

  for (let i = 0; i < preset.widgets.length; i++) {
    const w = preset.widgets[i];
    // If an availability filter is provided, skip widgets that aren't installed or enabled
    if (availableComponentNames && !availableComponentNames.has(w.component)) {
      unavailable.push(w.component);
      continue;
    }

    widgets.push({
      id: `wgt-${w.component}-${Date.now()}-${widgets.length}`,
      component: w.component,
      label: w.label,
      icon: w.icon,
      size: w.size,
      settings: {},
      order: widgets.length,
      gridPosition: widgets.length,
    });
  }

  return { widgets, unavailable };
}

/**
 * Creates full DashboardWidgetConfig entries from a preset.
 */
export function buildPresetWidgets(
  preset: DashboardLayoutPreset,
  availableComponentNames?: ReadonlySet<string>,
): DashboardWidgetConfig[] {
  return resolvePresetWidgets(preset, availableComponentNames).widgets;
}
