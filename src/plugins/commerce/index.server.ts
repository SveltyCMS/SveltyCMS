/**
 * @file src/plugins/commerce/index.server.ts
 * @description Records the previous product price so a reduction can show the 30-day low.
 */

import { nowISODateString } from "@utils/date";
import type { PluginLifecycleHooks } from "../types";
import { withPriceHistory } from "./vat";

export const hooks: PluginLifecycleHooks = {
  beforeSave: async (context, collection, data) => {
    if (collection !== "products" || !data || typeof data !== "object") return data;
    const incoming = data as Record<string, unknown>;
    if (!("price" in incoming)) return data;
    const id = String(incoming._id || "");
    let existing: Record<string, unknown> | null = null;
    if (id && context.dbAdapter?.crud) {
      const found = await context.dbAdapter.crud.findOne("products", { _id: id } as never, {
        tenantId: context.tenantId as never,
      });
      const row =
        found && typeof found === "object" && "data" in found
          ? (found as { data?: unknown }).data
          : found;
      if (row && typeof row === "object") existing = row as Record<string, unknown>;
    }
    return withPriceHistory(existing, incoming, nowISODateString());
  },
};
