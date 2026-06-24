/**
 * @file src/plugins/smart-importer/import-options.ts
 * @description Parses wizard import options into control-plane ImportFilter.
 */

import type { ImportFilter } from "./control-plane";

export interface WizardImportOptions {
  contentTypes?: string[];
  createdAfter?: string;
  createdBefore?: string;
  modifiedAfter?: string;
  statuses?: Array<"published" | "draft" | "pending" | "archived">;
  language?: string;
  sampleType?: "first" | "random" | "every_nth" | "";
  sampleCount?: number;
  deltaMode?: boolean;
  scrubPii?: boolean;
}

/** Parse JSON from wizard form field */
export function parseWizardImportOptions(raw: string | null): WizardImportOptions {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as WizardImportOptions;
  } catch {
    return {};
  }
}

/** Convert wizard options to control-plane ImportFilter */
export function wizardOptionsToImportFilter(options: WizardImportOptions): ImportFilter {
  const filter: ImportFilter = {};

  if (options.contentTypes?.length) filter.contentTypes = options.contentTypes;
  if (options.createdAfter) filter.createdAfter = options.createdAfter;
  if (options.createdBefore) filter.createdBefore = options.createdBefore;
  if (options.modifiedAfter) filter.modifiedAfter = options.modifiedAfter;
  if (options.statuses?.length) filter.statuses = options.statuses;
  if (options.language) filter.language = options.language;

  if (options.sampleType && options.sampleCount && options.sampleCount > 0) {
    filter.sample = {
      type: options.sampleType as "first" | "random" | "every_nth",
      count: options.sampleCount,
    };
  }

  return filter;
}
