/**
 * @file src/plugins/smart-importer/import-runner.ts
 * @description Shared migration import orchestration for wizard actions and SSE API.
 */

import { nowISODateString } from "@utils/date";
import type { FieldMapping, MigrationProgress, SNCEnvelope } from "./types";
import {
  parseWizardImportOptions,
  wizardOptionsToImportFilter,
  type WizardImportOptions,
} from "./import-options";

/** Entry count above which imports are queued for background processing */
export const BACKGROUND_JOB_THRESHOLD = 500;

/** Platforms that require a Pro license */
export const PRO_PLATFORMS = new Set([
  "contentful",
  "sanity",
  "ghost",
  "typo3",
  "craft",
  "statamic",
  "storyblok",
  "prismic",
  "webflow",
  "shopify",
  "magento",
  "prestashop",
  "opencart",
  "joomla",
  "grav",
  "processwire",
  "hygraph",
  "contentstack",
  "dato",
  "builder",
  "kontent",
  "hubspot",
  "wix",
  "squarespace",
  "duda",
  "tilda",
  "contao",
  "silverstripe",
  "concrete",
  "october",
  "bolt",
  "expressionengine",
  "backdrop",
  "cockpit",
  "pimcore",
]);

export async function getMigrationLicenseTier(locals: {
  tenantId?: string;
}): Promise<{ valid: boolean; tier: "free" | "pro" }> {
  try {
    const pluginRegistry = (await import("@src/plugins/registry")).pluginRegistry;
    const tenantId = locals.tenantId || "default";
    const state = await pluginRegistry.getPluginState("smart-importer", tenantId);
    const isPro = state?.settings?.isProActivated || state?.settings?.licenseKey;
    if (isPro) {
      const { verifyMarketplaceLicense } = await import("./index.server");
      const verified = await verifyMarketplaceLicense(state?.settings?.licenseKey || "", tenantId);
      return { valid: verified, tier: verified ? "pro" : "free" };
    }
    return { valid: true, tier: "free" };
  } catch {
    return { valid: true, tier: "free" };
  }
}

export class MigrationLicenseError extends Error {
  constructor(format: string) {
    super(`${format} import requires a Pro license. Activate at marketplace.sveltycms.com`);
    this.name = "MigrationLicenseError";
  }
}

export class MigrationDeltaError extends Error {
  constructor() {
    super("Delta/incremental import requires a Pro license. Activate at marketplace.sveltycms.com");
    this.name = "MigrationDeltaError";
  }
}

export class MigrationPiiError extends Error {
  constructor() {
    super("PII scrubbing requires a Pro license. Activate at marketplace.sveltycms.com");
    this.name = "MigrationPiiError";
  }
}

export interface MigrationImportParams {
  dbAdapter: unknown;
  fileText: string;
  format: string;
  targetCollection: string;
  licenseTier: "free" | "pro";
  tenantId?: string | null;
  contentTypesRaw?: string | null;
  importOptionsRaw?: string | null;
  mappingsRaw?: string | null;
  importMedia?: boolean;
  onProgress?: (progress: MigrationProgress) => void;
}

export interface MigrationImportResult {
  success: boolean;
  imported: number;
  failed: number;
  transactionToken: string;
  timestamp: string;
  delta?: { new: number; changed: number; skipped: number };
  background?: boolean;
  jobId?: string;
  scaffold?: {
    created: boolean;
    collectionId: string;
    fieldCount: number;
    filePath?: string;
  };
}

export interface PreparedMigrationEnvelope {
  envelope: SNCEnvelope;
  filterReport?: {
    total: number;
    passed: number;
    excluded: number;
    reasons: Record<string, number>;
  };
  delta?: { new: number; changed: number; skipped: number };
}

function resolveImportOptions(
  importOptionsRaw?: string | null,
  contentTypesRaw?: string | null,
): WizardImportOptions {
  const options = parseWizardImportOptions(importOptionsRaw);
  if (!options.contentTypes?.length && contentTypesRaw) {
    try {
      const legacy = JSON.parse(contentTypesRaw) as string[];
      if (legacy.length) options.contentTypes = legacy;
    } catch {
      /* ignore */
    }
  }
  return options;
}

/** Parse, filter, and optionally apply delta to a migration export */
export async function prepareMigrationEnvelope(
  fileText: string,
  format: string,
  txnToken: string,
  importOptionsRaw?: string | null,
  contentTypesRaw?: string | null,
  dbAdapter?: unknown,
  targetCollection?: string,
  licenseTier: "free" | "pro" = "free",
): Promise<PreparedMigrationEnvelope | null> {
  const { parseFileToSNC } = await import("./index.server");
  const parsed = await parseFileToSNC(fileText, format, txnToken);
  if (!parsed?.entries.length) return null;

  const options = resolveImportOptions(importOptionsRaw, contentTypesRaw);
  const filter = wizardOptionsToImportFilter(options);

  let envelope = parsed;
  let filterReport: PreparedMigrationEnvelope["filterReport"];

  if (Object.keys(filter).length > 0) {
    const { applyImportFilters } = await import("./control-plane");
    const result = applyImportFilters(envelope, filter);
    envelope = result.filtered;
    filterReport = result.report;
  }

  if (!envelope.entries.length) return { envelope, filterReport };

  let deltaStats: PreparedMigrationEnvelope["delta"];
  if (options.deltaMode && licenseTier !== "pro") {
    throw new MigrationDeltaError();
  }
  if (options.scrubPii && licenseTier !== "pro") {
    throw new MigrationPiiError();
  }
  if (options.deltaMode && dbAdapter && targetCollection) {
    const { loadDeltaState, computeDelta } = await import("./delta-engine");
    const previous = await loadDeltaState(
      dbAdapter as Parameters<typeof loadDeltaState>[0],
      targetCollection,
      format,
    );
    const deltaResult = computeDelta(envelope, previous);
    envelope = { ...envelope, entries: deltaResult.delta };
    deltaStats = {
      new: deltaResult.new,
      changed: deltaResult.changed,
      skipped: deltaResult.skipped,
    };
  }

  return { envelope, filterReport, delta: deltaStats };
}

export async function runMigrationImport(
  params: MigrationImportParams,
): Promise<MigrationImportResult> {
  if (PRO_PLATFORMS.has(params.format) && params.licenseTier !== "pro") {
    throw new MigrationLicenseError(params.format);
  }

  const { normalizeCollectionId } = await import("./collection-scaffold");
  const targetCollection = normalizeCollectionId(params.targetCollection);

  const txnToken = crypto.randomUUID?.() || `txn_${Date.now()}`;
  const prepared = await prepareMigrationEnvelope(
    params.fileText,
    params.format,
    txnToken,
    params.importOptionsRaw,
    params.contentTypesRaw,
    params.dbAdapter,
    targetCollection,
    params.licenseTier,
  );

  if (!prepared?.envelope.entries.length) {
    if (prepared?.delta && prepared.delta.skipped > 0) {
      throw new Error(
        `Delta import: all ${prepared.delta.skipped} entries unchanged since last import`,
      );
    }
    throw new Error("No entries found after filtering");
  }

  const { executeUCPIngestion, wizardMappingsToFieldMappings } = await import("./index.server");

  let wizardMappingRows: Array<{
    source: string;
    target: string;
    confidence: number;
    type: string;
    action?: string;
  }> = [];
  if (params.mappingsRaw) {
    try {
      wizardMappingRows = JSON.parse(params.mappingsRaw);
    } catch {
      /* ignore */
    }
  }

  let scaffoldResult: MigrationImportResult["scaffold"];
  if (params.dbAdapter && wizardMappingRows.length > 0) {
    const { ensureTargetCollectionProvisioned } = await import("./collection-scaffold");
    const tenantId = (params as { tenantId?: string | null }).tenantId;
    scaffoldResult = await ensureTargetCollectionProvisioned(
      params.dbAdapter,
      tenantId,
      targetCollection,
      wizardMappingRows,
      params.format,
    );
  }

  let fieldMappings: FieldMapping[] = [];
  if (wizardMappingRows.length) {
    fieldMappings = wizardMappingsToFieldMappings(wizardMappingRows);
  }

  const options = resolveImportOptions(params.importOptionsRaw, params.contentTypesRaw);

  const ingestionOptions = {
    importMedia: params.importMedia ?? false,
    overwrite: false,
    batchSize: 100,
    useBulk: true,
    resolveStubs: true,
    optimizeMedia: params.importMedia ?? false,
    scrubPii: options.scrubPii ?? false,
  };

  if (prepared.envelope.entries.length >= BACKGROUND_JOB_THRESHOLD) {
    const { importJobQueue } = await import("./job-queue");
    const job = importJobQueue.enqueue(
      prepared.envelope,
      fieldMappings,
      targetCollection,
      params.dbAdapter,
      ingestionOptions,
    );

    if (params.onProgress) {
      const unsubscribe = importJobQueue.subscribe((updated) => {
        if (updated.id !== job.id) return;
        params.onProgress?.({
          current: updated.importedCount,
          total: updated.totalEntries,
          phase: updated.status === "completed" ? "completed" : "processing",
          currentItem: updated.currentItem,
        });
        if (updated.status === "completed" || updated.status === "failed") {
          unsubscribe();
        }
      });
    }

    return {
      success: true,
      imported: 0,
      failed: 0,
      transactionToken: txnToken,
      timestamp: nowISODateString(),
      delta: prepared.delta,
      background: true,
      jobId: job.id,
      scaffold: scaffoldResult,
    };
  }

  const result = await executeUCPIngestion(
    params.dbAdapter,
    prepared.envelope,
    fieldMappings,
    targetCollection,
    ingestionOptions,
    params.onProgress,
  );

  if (options.deltaMode && params.dbAdapter) {
    const { loadDeltaState, saveDeltaState, buildDeltaStateFromImport } =
      await import("./delta-engine");
    const previous = await loadDeltaState(
      params.dbAdapter as Parameters<typeof loadDeltaState>[0],
      targetCollection,
      params.format,
    );
    const nextState = buildDeltaStateFromImport(
      targetCollection,
      params.format,
      txnToken,
      prepared.envelope.entries,
      previous,
    );
    await saveDeltaState(params.dbAdapter as Parameters<typeof saveDeltaState>[0], nextState);
  }

  return {
    ...result,
    transactionToken: txnToken,
    timestamp: nowISODateString(),
    delta: prepared.delta,
    scaffold: scaffoldResult,
  };
}
