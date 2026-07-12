/**
 * @file src/plugins/smart-importer/ui/migration-form-actions.ts
 * @description SvelteKit form action helpers for the migration wizard plugin page.
 */

/** Wizard field mapping row (detect + TransformationTree) */
export interface MigrationFieldMappingRow {
  source: string;
  target: string;
  confidence: number;
  type: string;
  action: string | undefined;
}

/** Dry-run validation payload shown on wizard step 3 */
export interface MigrationDryRunResult {
  estimatedItems: number | undefined;
  filterReport: { passed: number; excluded: number; reasons: Record<string, number> } | undefined;
  delta: { new: number; changed: number; skipped: number } | undefined;
  schemaDiff:
    | {
        isCompatible: boolean;
        collectionExists: boolean;
        additions: Array<{ fieldName: string; type: string }>;
        modifications: Array<{
          fieldName: string;
          fromType: string;
          toType: string;
          warning: boolean;
        }>;
        deletions: Array<{ fieldName: string }>;
      }
    | undefined;
  previewDiff:
    | {
        summary: { create: number; update: number; skip: number };
        created: Array<{ title: string }>;
        updated: Array<{ title: string; changes: Array<{ field: string }> }>;
      }
    | undefined;
}

const PLUGIN_ID = "smart-importer";
const PLUGIN_API = `/api/plugins/${PLUGIN_ID}`;

/** Unwrap plugin API or SvelteKit form action JSON payloads */
export function unwrapFormActionResult<T extends Record<string, unknown>>(
  result: { data?: T; error?: string } & T,
): T {
  if (result.error && !result.success) {
    return result as T;
  }
  return (result.data ?? result) as T;
}

export async function postPluginPageAction<T extends Record<string, unknown>>(
  actionName: string,
  formData: FormData,
): Promise<T> {
  formData.set("__action", actionName);
  const response = await fetch(PLUGIN_API, { method: "POST", body: formData });
  const result = (await response.json()) as { data?: T; error?: string } & T;
  if (!response.ok && result.error) {
    return { success: false, error: result.error } as unknown as T;
  }
  return unwrapFormActionResult(result);
}

export function postDetectAction(formData: FormData) {
  return postPluginPageAction<{
    success?: boolean;
    format?: string;
    estimatedCount?: number;
    fieldMappings?: Array<{
      source: string;
      target: string;
      confidence: number;
      type: string;
      action?: string;
    }>;
    contentTypes?: string[];
    suggestedTargetCollection?: string;
    license?: { tier?: string };
    licenseBlocked?: boolean;
    error?: string;
  }>("detect", formData);
}

export function postScaffoldAction(formData: FormData) {
  return postPluginPageAction<{
    success?: boolean;
    collectionId?: string;
    schemaDiff?: unknown;
    message?: string;
    error?: string;
  }>("scaffoldCollection", formData);
}

export function postDryRunAction(formData: FormData) {
  return postPluginPageAction<{
    success?: boolean;
    collectionId?: string;
    estimatedItems?: number;
    error?: string;
    [key: string]: unknown;
  }>("dryRun", formData);
}

export function postRollbackAction(formData: FormData) {
  return postPluginPageAction<{
    success?: boolean;
    message?: string;
    error?: string;
  }>("rollback", formData);
}
