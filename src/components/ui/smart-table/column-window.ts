/**
 * @file src/components/ui/smart-table/column-window.ts
 * @description
 * Pure horizontal body-cell window for the Smart Table.
 *
 * Row virtualization keeps the DOM proportional to the viewport height, but a
 * wide table still renders one `<td>` per column for every visible row. This
 * helper computes the contiguous body-cell slice that intersects the horizontal
 * viewport (plus an overscan on both edges). The header row stays complete:
 * headers are a single row and carry sort, resize and column semantics.
 *
 * Measurement belongs to the caller: `offsets[i]` is the cumulative left edge
 * of column `i`, `widths[i]` its measured width. When no measurement is
 * available (SSR, jsdom, `offsetWidth === 0`) every width is zero and the
 * window stays inactive so the full table renders.
 *
 * ### Features:
 * - binary search over cumulative offsets (O(log n))
 * - overscan columns on both edges to hide scroll jitter
 * - inactive below `minColumns`, without a viewport, or without measurement
 * - leading/trailing cell widths preserve the table's total width
 */

export interface ColumnWindowInput {
  /** Cumulative left edge of each column (px) */
  offsets: readonly number[];
  /** Measured width of each column (px) */
  widths: readonly number[];
  /** Visible scroll-container width (px) */
  viewportWidth: number;
  /** Current horizontal scroll offset (px) */
  scrollLeft: number;
  /** Extra columns rendered on each side of the viewport (default 2) */
  overscan?: number;
  /** Minimum column count before windowing is worthwhile (default 16) */
  minColumns?: number;
}

export interface ColumnWindow {
  /** First rendered body-cell index (inclusive) */
  start: number;
  /** Last rendered body-cell index (exclusive) */
  end: number;
  /** Columns skipped before `start` */
  leadingCount: number;
  /** Columns skipped after `end` */
  trailingCount: number;
  /** Total width of the skipped leading columns (px) */
  leadingWidth: number;
  /** Total width of the skipped trailing columns (px) */
  trailingWidth: number;
  /** False → render every column (narrow table, SSR, unmeasured layout) */
  active: boolean;
}

function inactiveWindow(length: number): ColumnWindow {
  return {
    start: 0,
    end: length,
    leadingCount: 0,
    trailingCount: 0,
    leadingWidth: 0,
    trailingWidth: 0,
    active: false,
  };
}

/** First column whose right edge is strictly past `edge`. */
function firstIndexRightEdgeAfter(
  offsets: readonly number[],
  widths: readonly number[],
  edge: number,
): number {
  let low = 0;
  let high = widths.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    const right = (offsets[mid] ?? 0) + (widths[mid] ?? 0);
    if (right > edge) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  return low;
}

/** First column whose left edge is at or past `edge`. */
function firstIndexLeftEdgeAt(offsets: readonly number[], edge: number): number {
  let low = 0;
  let high = offsets.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if ((offsets[mid] ?? 0) >= edge) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  return low;
}

function sumWidths(widths: readonly number[], start: number, end: number): number {
  let total = 0;
  for (let index = start; index < end; index += 1) {
    const width = widths[index];
    if (typeof width === "number" && Number.isFinite(width)) {
      total += width;
    }
  }
  return total;
}

/**
 * Compute the body-cell window for a horizontally scrolled table.
 *
 * @example
 * ```ts
 * const window = computeColumnWindow({
 *   offsets: [0, 120, 240, 360, 480, 600, 720, 840],
 *   widths: [120, 120, 120, 120, 120, 120, 120, 120],
 *   viewportWidth: 150,
 *   scrollLeft: 0,
 *   overscan: 1,
 *   minColumns: 4
 * });
 * // start 0, end 3, trailingCount 5, active true
 * ```
 */
export function computeColumnWindow(input: ColumnWindowInput): ColumnWindow {
  const { offsets, widths, viewportWidth, scrollLeft, overscan = 2, minColumns = 16 } = input;
  const length = widths.length;
  const threshold = Number.isFinite(minColumns) ? Math.max(1, Math.floor(minColumns)) : 16;

  if (length < threshold || offsets.length !== length) {
    return inactiveWindow(length);
  }

  const viewport = Number.isFinite(viewportWidth) && viewportWidth > 0 ? viewportWidth : 0;
  if (viewport === 0) {
    return inactiveWindow(length);
  }

  let measured = false;
  for (const width of widths) {
    if (typeof width === "number" && width > 0) {
      measured = true;
      break;
    }
  }
  if (!measured) {
    return inactiveWindow(length);
  }

  const extra = Number.isFinite(overscan) ? Math.max(0, Math.floor(overscan)) : 0;
  const left = Number.isFinite(scrollLeft) && scrollLeft > 0 ? scrollLeft : 0;
  const right = left + viewport;

  // Always keep at least one column when the scroll offset is past the content.
  const firstVisible = Math.min(firstIndexRightEdgeAfter(offsets, widths, left), length - 1);
  const firstAfterViewport = Math.max(
    firstVisible + 1,
    Math.min(firstIndexLeftEdgeAt(offsets, right), length),
  );

  const start = Math.max(0, firstVisible - extra);
  const end = Math.min(length, firstAfterViewport + extra);

  return {
    start,
    end,
    leadingCount: start,
    trailingCount: length - end,
    leadingWidth: sumWidths(widths, 0, start),
    trailingWidth: sumWidths(widths, end, length),
    active: true,
  };
}
