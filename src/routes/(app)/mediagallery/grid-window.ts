/**
 * @file src/routes/(app)/mediagallery/grid-window.ts
 * @description Pure row-window math for the media grid. The component measures the
 * resolved grid once (columns, row height, gap) and this module maps the scroll
 * position to the slice of rows that must stay mounted.
 *
 * Features:
 * - column counting from a resolved `grid-template-columns` track list
 * - row-aligned start/end indices with configurable overscan
 * - top/bottom spacer heights that preserve the scroll range of the full list
 * - a virtualisation threshold so small folders keep the existing batch reveal
 */

export interface GridWindowMetrics {
  /** Resolved column count of the `auto-fill` grid. */
  columns: number;
  /** Height of one tile row in CSS pixels. */
  rowHeight: number;
  /** Vertical gap between rows in CSS pixels. */
  rowGap: number;
}

export interface GridWindowInput extends GridWindowMetrics {
  totalItems: number;
  scrollTop: number;
  viewportHeight: number;
  /** Rows rendered beyond each viewport edge. */
  overscanRows?: number;
}

export interface GridWindow {
  /** First mounted item (inclusive). */
  startIndex: number;
  /** Last mounted item (exclusive). */
  endIndex: number;
  /** Height of the spacer that stands in for the rows above the window. */
  topSpacerHeight: number;
  /** Height of the spacer that stands in for the rows below the window. */
  bottomSpacerHeight: number;
  totalRows: number;
  /** First mounted row (inclusive). */
  firstRow: number;
  /** Last mounted row (exclusive). */
  lastRow: number;
}

const DEFAULT_OVERSCAN_ROWS = 3;

/**
 * Count the tracks in a resolved `grid-template-columns` value.
 *
 * Browsers resolve `repeat()` and `auto-fill` to a flat list of track sizes in
 * computed styles ("180px 180px 180px"), but the parser also tolerates
 * unresolved functions so the helper stays deterministic in tests and jsdom.
 */
export function countGridColumns(template: string): number {
  const value = template.trim();
  if (!value || value === "none") return 0;

  let depth = 0;
  let columns = 0;
  let inToken = false;
  for (const char of value) {
    if (char === "(") {
      depth += 1;
    } else if (char === ")") {
      depth = Math.max(0, depth - 1);
    }

    if (depth === 0 && /\s/.test(char)) {
      if (inToken) {
        columns += 1;
        inToken = false;
      }
      continue;
    }
    inToken = true;
  }

  return inToken ? columns + 1 : columns;
}

/** The grid stops mounting every tile above this count. */
export function shouldVirtualize(totalItems: number, threshold: number): boolean {
  return totalItems > threshold;
}

/**
 * Resolve the mounted slice for a grid whose rows are uniform (the gallery tiles
 * share a square preview plus a fixed badge row).
 *
 * Spacer geometry: a top spacer row of height `H` is followed by the grid gap
 * `g`, so `H + g` must equal `rowsAbove * (rowHeight + g)`. The bottom spacer
 * mirrors the same rule.
 */
export function computeGridWindow(input: GridWindowInput): GridWindow {
  const totalItems = Math.max(0, Math.floor(input.totalItems));
  const columns = Math.max(1, Math.floor(input.columns) || 1);
  const totalRows = totalItems === 0 ? 0 : Math.ceil(totalItems / columns);

  if (totalItems === 0) {
    return {
      startIndex: 0,
      endIndex: 0,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
      totalRows: 0,
      firstRow: 0,
      lastRow: 0,
    };
  }

  const rowHeight = Math.max(0, input.rowHeight);
  const rowGap = Math.max(0, input.rowGap);
  const stride = rowHeight + rowGap;

  // A zero-height tile means layout has not been measured yet. Mount everything
  // rather than guessing a window that could be wrong.
  if (stride <= 0) {
    return {
      startIndex: 0,
      endIndex: totalItems,
      topSpacerHeight: 0,
      bottomSpacerHeight: 0,
      totalRows,
      firstRow: 0,
      lastRow: totalRows,
    };
  }

  const overscanRows = Math.max(0, Math.floor(input.overscanRows ?? DEFAULT_OVERSCAN_ROWS));
  const scrollTop = Math.max(0, input.scrollTop);
  const viewportHeight = Math.max(0, input.viewportHeight);

  const firstVisibleRow = Math.min(Math.floor(scrollTop / stride), totalRows - 1);
  const visibleRows = Math.max(1, Math.ceil(viewportHeight / stride) + 1);
  const firstRow = Math.max(0, firstVisibleRow - overscanRows);
  const lastRow = Math.min(totalRows, firstVisibleRow + visibleRows + overscanRows);

  return {
    startIndex: firstRow * columns,
    endIndex: Math.min(totalItems, lastRow * columns),
    topSpacerHeight: firstRow === 0 ? 0 : firstRow * stride - rowGap,
    bottomSpacerHeight: lastRow >= totalRows ? 0 : (totalRows - lastRow) * stride - rowGap,
    totalRows,
    firstRow,
    lastRow,
  };
}
