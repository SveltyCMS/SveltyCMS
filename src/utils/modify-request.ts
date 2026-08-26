/**
 * @file src/utils/modify-request.ts
 * @description High-Performance Request Modification Pipeline.
 *
 * ### Features:
 * - Field-cached active widget list (`fields._activeWidgets`) — 0ms after first call
 * - Reused data accessor + request context (no per-field object/closure/spread alloc)
 * - Prototype-pollution-safe field checks via `Object.hasOwn`
 * - Error boundary per widget so one failure cannot abort the mutation pipeline
 */

import type { FieldInstance } from "@src/content/types";
import type { User } from "@src/databases/auth/types";
import type { CollectionModel } from "@src/databases/db-interface";
import { widgetRegistryService } from "@src/services/core/widget-registry-service";
import { logger } from "@utils/logger";
import { getFieldName } from "@utils/schema/field-utils";

import { sanitizeObject } from "@utils/security/input-sanitizer";

export interface EntryData {
  _id?: string;
  [key: string]: unknown;
}

interface ModifyRequestParams {
  collection: CollectionModel;
  data: EntryData[];
  fields: FieldInstance[];
  tenantId?: string | null;
  type: string;
  user: User;
  skipValidation?: boolean;
  action?: string;
  system?: boolean;
  collectionName?: string;
}

/**
 * 🚀 High-Performance Request Modification Pipeline
 * Guaranteed to preserve all physical database columns while safely applying
 * widget-based transforms.
 */
export async function modifyRequest(params: ModifyRequestParams) {
  const { data, fields, type } = params;

  if (!data || data.length === 0) return data;

  // 🛡️ INPUT SANITIZATION: Fast single-pass sanitization
  if (type === "POST" || type === "PATCH" || type === "PUT") {
    for (let i = 0; i < data.length; i++) {
      if (data[i]) {
        data[i] = sanitizeObject(data[i]);
      }
    }
  }

  // 1. Resolve Widget Functions & Cache on the fields array (0ms after first call)
  let activeWidgets: { field: FieldInstance; widget: any; name: string }[] = (fields as any)
    ._activeWidgets;
  if (!activeWidgets) {
    activeWidgets = [];
    if (Array.isArray(fields)) {
      for (let i = 0; i < fields.length; i++) {
        const f = fields[i];
        const widgetName = f.widget?.Name;
        if (!widgetName) continue;
        const wFn = widgetRegistryService.getWidgetSync(widgetName);
        if (wFn && (wFn as any).modifyRequest) {
          activeWidgets.push({ field: f, widget: wFn, name: getFieldName(f) });
        }
      }
    }
    (fields as any)._activeWidgets = activeWidgets;
  }

  // 🛡️ FAST EXIT: If no widgets have modifyRequest, data is returned directly (0ms)
  if (activeWidgets.length === 0) return data;

  // Reused across fields/entries. Widgets finish (including their own awaits)
  // before these slots are overwritten for the next field.
  let currentEntry: EntryData | null = null;
  let currentName = "";
  const dataAccessor = {
    get: () => (currentEntry ? currentEntry[currentName] : undefined),
    update: (newVal: unknown) => {
      if (currentEntry) currentEntry[currentName] = newVal;
    },
  };
  const ctx: Record<string, unknown> = {
    collection: params.collection,
    collectionName: params.collectionName,
    user: params.user,
    tenantId: params.tenantId,
    skipValidation: params.skipValidation,
    action: params.action,
    system: params.system,
    type: type || "GET",
    data: dataAccessor,
    field: undefined,
    value: undefined,
    entry: undefined,
  };

  for (let i = 0; i < data.length; i++) {
    const entry = data[i];
    if (!entry) continue;
    currentEntry = entry;
    ctx.entry = entry;

    for (let w = 0; w < activeWidgets.length; w++) {
      const { field, widget, name } = activeWidgets[w];
      if (!Object.hasOwn(entry, name)) continue;
      currentName = name;
      ctx.field = field;
      ctx.value = entry[name];
      try {
        await widget.modifyRequest(ctx);
      } catch (err: any) {
        logger.error(`[modifyRequest] Widget '${widget.Name}' failed for field '${name}':`, {
          message: err.message,
          stack: err.stack,
          collection: params.collectionName,
        });
      }
    }
  }

  return data;
}

/**
 * Stream-based modification for large result sets.
 * Processes items individually to minimize memory pressure.
 */
export async function* modifyStream(
  stream: AsyncIterable<EntryData>,
  params: Omit<ModifyRequestParams, "data">,
) {
  for await (const item of stream) {
    // Wrap the single item in a temporary array to maintain compatibility
    // with the batch processing logic in modifyRequest
    const batch = [item];
    await modifyRequest({ ...params, data: batch });
    yield batch[0];
  }
}
