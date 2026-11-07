/**
 * @file src/components/collection-display/entry-list-export.ts
 * @description
 * CSV export utility for collection entries supporting selection and full dataset fallback.
 * Generates RFC 4180-compliant CSV exports with escaping and triggers browser download.
 *
 * Features:
 * - RFC 4180 quote escaping for fields, JSON values, and header labels
 * - Selection-aware export with fallback to current table data
 * - ISO date-stamped filename generation via nowISODateString
 * - Toast feedback for user interaction
 */

import type { CollectionEntry, TableHeader } from "@src/content/types";
import { nowISODateString } from "@utils/date";
import { toast } from "@src/stores/toast.svelte.ts";

export interface ExportEntriesOptions {
  items: CollectionEntry[];
  visibleHeaders: TableHeader[];
  fallbackHeaders: TableHeader[];
  collectionName?: string;
}

/**
 * Serializes collection entries to a CSV file and prompts a browser download.
 */
export function exportEntriesToCsv({
  items,
  visibleHeaders,
  fallbackHeaders,
  collectionName = "collection",
}: ExportEntriesOptions): void {
  if (!items || items.length === 0) {
    toast.warning("No data to export");
    return;
  }

  const headersToUse = visibleHeaders.length > 0 ? visibleHeaders : fallbackHeaders;
  const headerLabels = headersToUse.map(
    (h) => `"${(h.label || h.name || "").replace(/"/g, '""')}"`,
  );
  const headerKeys = headersToUse.map((h) => h.name || h.id || "");

  const rowsCsv = items.map((item) => {
    const rowRecord = item as Record<string, unknown>;
    return headerKeys
      .map((k) => {
        const val = rowRecord[k];
        if (val == null) return '""';
        if (typeof val === "object") return `"${JSON.stringify(val).replace(/"/g, '""')}"`;
        return `"${String(val).replace(/"/g, '""')}"`;
      })
      .join(",");
  });

  const csvContent = [headerLabels.join(","), ...rowsCsv].join("\r\n");
  if (typeof document === "undefined") return;

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${collectionName}-export-${nowISODateString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  toast.success(`Exported ${items.length} ${items.length === 1 ? "entry" : "entries"} to CSV`);
}
