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
  /** Caller already sanitized (create/update prepareWritePayload). */
  skipSanitize?: boolean;
}

type ActiveWidget = { field: FieldInstance; widget: any; name: string };

/** Widget context reused across entries/fields; only the mutable slots change. */
interface WidgetContextState {
  entry: EntryData | null;
  name: string;
}

/** Resolve (and cache on the fields array) the widgets that implement `modifyRequest`. */
function resolveActiveWidgets(fields: FieldInstance[]): ActiveWidget[] {
  let activeWidgets: ActiveWidget[] = (fields as any)._activeWidgets;
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
  return activeWidgets;
}

/** Build the reused widget context once; `state` supplies the current entry/field. */
function createWidgetContext(
  params: Omit<ModifyRequestParams, "data">,
  type: string,
  state: WidgetContextState,
): Record<string, unknown> {
  return {
    collection: params.collection,
    collectionName: params.collectionName,
    user: params.user,
    tenantId: params.tenantId,
    skipValidation: params.skipValidation,
    action: params.action,
    system: params.system,
    type: type || "GET",
    data: {
      get: () => (state.entry ? state.entry[state.name] : undefined),
      update: (newVal: unknown) => {
        if (state.entry) state.entry[state.name] = newVal;
      },
    },
    field: undefined,
    value: undefined,
    entry: undefined,
  };
}

/** Run every widget handler for one entry. Shared by the batch and stream paths. */
async function applyEntryWidgets(
  entry: EntryData,
  activeWidgets: ActiveWidget[],
  ctx: Record<string, unknown>,
  state: WidgetContextState,
  params: Omit<ModifyRequestParams, "data">,
): Promise<void> {
  state.entry = entry;
  ctx.entry = entry;

  for (let w = 0; w < activeWidgets.length; w++) {
    const { field, widget, name } = activeWidgets[w];
    if (!Object.hasOwn(entry, name)) continue;
    state.name = name;
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

/**
 * 🚀 High-Performance Request Modification Pipeline
 * Guaranteed to preserve all physical database columns while safely applying
 * widget-based transforms.
 */
export async function modifyRequest(params: ModifyRequestParams) {
  const { data, fields, type } = params;

  if (!data || data.length === 0) return data;

  // 🛡️ INPUT SANITIZATION: Fast single-pass sanitization
  if (!params.skipSanitize && (type === "POST" || type === "PATCH" || type === "PUT")) {
    for (let i = 0; i < data.length; i++) {
      if (data[i]) {
        data[i] = sanitizeObject(data[i]);
      }
    }
  }

  // 1. Resolve Widget Functions & Cache on the fields array (0ms after first call)
  const activeWidgets = resolveActiveWidgets(fields);

  // 🛡️ FAST EXIT: If no widgets have modifyRequest, data is returned directly (0ms)
  if (activeWidgets.length === 0) return data;

  // One context reused across fields/entries: widgets finish (including their
  // own awaits) before these slots are overwritten for the next entry.
  const state: WidgetContextState = { entry: null, name: "" };
  const ctx = createWidgetContext(params, type, state);

  for (let i = 0; i < data.length; i++) {
    const entry = data[i];
    if (!entry) continue;
    await applyEntryWidgets(entry, activeWidgets, ctx, state, params);
  }

  return data;
}

/**
 * Stream-based modification for large result sets.
 * Processes items individually to minimize memory pressure. The widget list,
 * context and state are resolved once and reused for the whole stream — no
 * per-row `[item]` array or `{ ...params }` spread allocation.
 */
export async function* modifyStream(
  stream: AsyncIterable<EntryData>,
  params: Omit<ModifyRequestParams, "data">,
) {
  const activeWidgets = resolveActiveWidgets(params.fields);
  const needsSanitize =
    !params.skipSanitize &&
    (params.type === "POST" || params.type === "PATCH" || params.type === "PUT");

  const state: WidgetContextState = { entry: null, name: "" };
  const ctx = activeWidgets.length > 0 ? createWidgetContext(params, params.type, state) : null;

  for await (const item of stream) {
    let entry = item;
    if (needsSanitize && entry) {
      entry = sanitizeObject(entry);
    }
    if (ctx && entry) {
      await applyEntryWidgets(entry, activeWidgets, ctx, state, params);
    }
    yield entry;
  }
}
