/**
 * @file src/utils/modify-request.ts
 * @description Agnostic data transformation pipeline.
 */

import type { FieldInstance } from "@src/content/types";
import type { User } from "@src/databases/auth/types";
import type { CollectionModel } from "@src/databases/db-interface";
import { widgetRegistryService } from "@src/services/core/widget-registry-service";
import { logger } from "@utils/logger";
import { getFieldName } from "@utils/schema/field-utils";

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
 * Guaranteed to preserve all physical database columns.
 */
export async function modifyRequest(params: ModifyRequestParams) {
  const { data, fields, type } = params;

  if (!data || data.length === 0) return data;

  // 🛡️ INPUT SANITIZATION: Strip XSS vectors from all string values in mutation payloads
  // Runs before widget processing to catch encoded/nested vectors early
  if (type === "POST" || type === "PATCH" || type === "PUT") {
    const { sanitizeObject } = await import("@utils/security/input-sanitizer");
    for (let i = 0; i < data.length; i++) {
      if (data[i]) {
        data[i] = sanitizeObject(data[i]);
      }
    }
  }

  // 1. Resolve Widget Functions once per batch
  const activeWidgets = fields
    .map((f) => {
      const wFn = widgetRegistryService.getWidgetSync(f.widget.Name);
      if (wFn && (wFn as any).modifyRequest) {
        return { field: f, widget: wFn as any, name: getFieldName(f) };
      }
      return null;
    })
    .filter((w): w is any => w !== null);

  if (activeWidgets.length === 0) return data;

  // 2. Transform Data
  for (let i = 0; i < data.length; i++) {
    const entry = data[i];
    if (!entry) continue;

    for (const { field, widget, name } of activeWidgets) {
      try {
        const val = entry[name];
        // Only transform if the field exists in the data
        if (val !== undefined) {
          // 🚀 UNIVERSAL ACCESSOR: Provides both new and legacy API compatibility
          const dataAccessor = {
            get: () => entry[name],
            update: (newVal: any) => {
              entry[name] = newVal;
            },
          };

          await widget.modifyRequest({
            ...params,
            field,
            value: val,
            data: dataAccessor,
            entry,
            type: type || "GET",
          });
        }
      } catch (err) {
        logger.error(`[modifyRequest] Widget '${widget.Name}' failed for field '${name}':`, err);
      }
    }
  }

  return data;
}

export async function* modifyStream(
  stream: AsyncIterable<EntryData>,
  params: Omit<ModifyRequestParams, "data">,
) {
  for await (const item of stream) {
    const data = [item];
    await modifyRequest({ ...params, data });
    yield data[0];
  }
}
