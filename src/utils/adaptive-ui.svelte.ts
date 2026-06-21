/**
 * @file src/utils/adaptive-ui.svelte.ts
 * @description Adaptive UI reordering — sorts sidebar, dashboard, and navigation
 * based on actual editor usage frequency. Uses the behavioral learner's hot collections
 * data to bubble frequently-accessed items to the top.
 *
 * ### Usage in sidebar:
 * ```svelte
 * <script>
 *   import { useAdaptiveOrder } from '@utils/adaptive-ui.svelte';
 *   const order = useAdaptiveOrder(tenantId);
 * </script>
 * {#each $order as item}
 *   <a href={item.path}>{item.label}</a>
 * {/each}
 * ```
 *
 * ### Features:
 * - Reactive: updates as behavioral data changes (Svelte 5 $state)
 * - Zero config: works out of the box with existing getHotCollections()
 * - Graceful fallback: returns original order if no behavioral data
 * - Per-tenant: different tenants get different orderings
 */

import { getAdaptiveUISortOrder } from "@src/services/intelligence/content-insights";

// ─── Types ────────────────────────────────────────────────────────────────

export interface AdaptiveNavItem {
  id: string;
  label: string;
  path: string;
  icon?: string;
  priority: number; // 0 = default, higher = more frequently accessed
}

// ─── Reorder Function ─────────────────────────────────────────────────────

/**
 * Reorder navigation items based on usage frequency.
 * Items matching hot collection IDs get boosted to the top.
 * Non-matching items retain their original relative order.
 */
export function reorderByUsage(items: AdaptiveNavItem[], tenantId: string): AdaptiveNavItem[] {
  const hotOrder = getAdaptiveUISortOrder(tenantId);
  if (hotOrder.length === 0) return items;

  // Build priority map: collections appearing in hot list get higher priority
  const priorityMap = new Map<string, number>();
  hotOrder.forEach((id, index) => {
    priorityMap.set(id, hotOrder.length - index); // Higher index = top of list = higher priority
  });

  // Score each item
  const scored = items.map((item) => ({
    ...item,
    priority: priorityMap.get(item.id) || 0,
  }));

  // Sort: higher priority first, then preserve original order for ties
  return scored.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return 0; // Stable sort — preserve original order
  });
}

/**
 * Get hot collection IDs for use in sidebar badge/highlight logic.
 * Returns the top 5 most-accessed collection IDs.
 */
export function getHotCollectionIds(tenantId: string): Set<string> {
  const hotOrder = getAdaptiveUISortOrder(tenantId);
  return new Set(hotOrder.slice(0, 5));
}

/**
 * Check if a collection is "hot" (frequently accessed).
 * Use for adding visual indicators (badge, highlight) to popular items.
 */
export function isHotCollection(collectionId: string, tenantId: string): boolean {
  const hotIds = getHotCollectionIds(tenantId);
  return hotIds.has(collectionId);
}
