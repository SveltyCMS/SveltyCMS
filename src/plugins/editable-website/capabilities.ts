/**
 * @file src/plugins/editable-website/capabilities.ts
 * @description Single source of truth for the Live Preview capability matrix
 * rendered by the two plugin dashboards (overview + competitive).
 *
 * ### Why a module and not markup
 * - Both dashboards, the plugin MDX and the architecture doc quote the same rows;
 *   duplicating them invites the classic "docs say Yes, code says No" drift.
 * - Scoring (`coveragePercent`) is pure and unit-tested, so the bars can never
 *   imply a number the matrix does not support.
 *
 * ### Compliance
 * Rows describe **our** implementation and, for competitors, only what their
 * public documentation states. Claims stay dated and qualified (EU Directive
 * 2006/114/EC, German UWG §6) — see `MATRIX_SOURCE_NOTE`.
 *
 * Features:
 * - Typed capability rows (yes / partial / no / n/a)
 * - Weighted coverage scoring with `n/a` excluded from the denominator
 * - Open-gap list consumed by the overview dashboard
 * - Level → UI token mapping
 */

/** How completely a product supports a capability. */
export type CapabilityLevel = "yes" | "partial" | "no" | "na";

/** Product columns in the comparison matrix. */
export type ProductId = "svelty" | "competitors" | "editable";

export interface CapabilityProduct {
  id: ProductId;
  /** Short label used inside bars and matrix headers. */
  label: string;
  /** Longer label for legends and screen readers. */
  description: string;
}

export const PRODUCTS: readonly CapabilityProduct[] = [
  {
    id: "svelty",
    label: "SveltyCMS",
    description: "SveltyCMS Live Preview (this plugin + the bundled site starter)",
  },
  {
    id: "competitors",
    label: "Payload / Directus / Strapi",
    description: "Payload, Directus and Strapi, based on their public documentation",
  },
  {
    id: "editable",
    label: "Editable.website",
    description: "Editable.website, based on its public product documentation",
  },
];

export interface CapabilityRow {
  id: string;
  label: string;
  /** What the row actually asserts — keeps the claim narrow and checkable. */
  detail: string;
  svelty: CapabilityLevel;
  competitors: CapabilityLevel;
  editable: CapabilityLevel;
}

/**
 * The matrix. Keep `docs/reference/architecture/live-preview-architecture.mdx`
 * and `editable-website.mdx` in sync when a row changes.
 */
export const CAPABILITY_MATRIX: readonly CapabilityRow[] = [
  {
    id: "signed-token",
    label: "Signed preview token + draft SSR",
    detail:
      "HMAC-SHA-256 token (audience, tenant, TTL, entry binding) validated timing-safe before draft rendering.",
    svelty: "yes",
    competitors: "yes",
    editable: "na",
  },
  {
    id: "field-focus",
    label: "Bidirectional field focus / highlight",
    detail:
      "Preview click focuses the CMS control; focusing a CMS control scrolls to and highlights the matching preview element.",
    svelty: "yes",
    competitors: "partial",
    editable: "yes",
  },
  {
    id: "inline-edit",
    label: "On-page inline editing",
    detail: "Svedit document editing inside the preview frame; edits flow back over the bridge.",
    svelty: "yes",
    competitors: "yes",
    editable: "yes",
  },
  {
    id: "device-presets",
    label: "Desktop / tablet / mobile / split canvas",
    detail: "Device presets plus a split canvas that syncs every mounted frame.",
    svelty: "yes",
    competitors: "yes",
    editable: "yes",
  },
  {
    id: "instant-publish",
    label: "Instant publish without a rebuild",
    detail:
      "One-click Publish (and optional autosave) call the normal save lane: workflow, required fields and audit hooks still run.",
    svelty: "yes",
    competitors: "no",
    editable: "yes",
  },
  {
    id: "block-editing",
    label: "Block insert / reorder / layout flip on page",
    detail:
      "Block palette (hero / paragraph / CTA / image), move up-down, delete, and a paragraph ↔ hero ↔ CTA type flip.",
    svelty: "yes",
    competitors: "yes",
    editable: "yes",
  },
  {
    id: "media-drop",
    label: "Drag-drop media + focal point on page",
    detail:
      "Drop or pick an image on the page, upload through /api/media/upload, then set the focal point by click or arrow keys.",
    svelty: "yes",
    competitors: "partial",
    editable: "yes",
  },
  {
    id: "mobile-hold",
    label: "Mobile drag-hold edit mode",
    detail: "Hold-to-edit pill toggles the preview between editing and read-only on touch devices.",
    svelty: "yes",
    competitors: "na",
    editable: "yes",
  },
  {
    id: "mcp-edit",
    label: "MCP / AI editing of the live page",
    detail:
      "WebMCP draft-only write tools plus a `get_live_preview_url` tool that hands an agent the signed draft URL.",
    svelty: "yes",
    competitors: "partial",
    editable: "yes",
  },
];

/** Date the competitor columns were last checked against public documentation. */
export const MATRIX_REVIEWED_AT = "November 2026";

/** Mandatory qualifier rendered beside every competitor claim. */
export const MATRIX_SOURCE_NOTE =
  "Comparisons reflect each vendor's public documentation as of " +
  `${MATRIX_REVIEWED_AT}; re-check the current release before citing them externally.`;

/** Human labels for the four levels. */
export const LEVEL_LABELS: Record<CapabilityLevel, string> = {
  yes: "Yes",
  partial: "Partial",
  no: "No",
  na: "n/a",
};

/** Badge variant per level (status-shade contract: one shade per role). */
export const LEVEL_BADGE_VARIANT: Record<
  CapabilityLevel,
  "success" | "warning" | "error" | "surface"
> = {
  yes: "success",
  partial: "warning",
  no: "error",
  na: "surface",
};

/** Weight applied when scoring a column; `na` is excluded from the denominator. */
const LEVEL_WEIGHT: Record<CapabilityLevel, number> = {
  yes: 1,
  partial: 0.5,
  no: 0,
  na: 0,
};

export interface CoverageCounts {
  yes: number;
  partial: number;
  no: number;
  na: number;
  /** Rows that count toward the score (`yes + partial + no`). */
  scored: number;
}

/** Count each level for one product column. */
export function countLevels(product: ProductId): CoverageCounts {
  const counts: CoverageCounts = { yes: 0, partial: 0, no: 0, na: 0, scored: 0 };
  for (const row of CAPABILITY_MATRIX) {
    const level = row[product];
    counts[level] += 1;
    if (level !== "na") counts.scored += 1;
  }
  return counts;
}

/**
 * Weighted coverage, 0–100, rounded to the nearest integer.
 * `yes` = 1, `partial` = 0.5, `no` = 0; `na` rows are not scored at all.
 */
export function coveragePercent(product: ProductId): number {
  const counts = countLevels(product);
  if (counts.scored === 0) return 0;
  let score = 0;
  for (const row of CAPABILITY_MATRIX) {
    score += LEVEL_WEIGHT[row[product]];
  }
  return Math.round((score / counts.scored) * 100);
}

/** Product columns ordered by coverage (highest first) — the "competitive bar". */
export function rankedCoverage(): Array<{
  product: CapabilityProduct;
  percent: number;
  counts: CoverageCounts;
}> {
  return PRODUCTS.map((product) => ({
    product,
    percent: coveragePercent(product.id),
    counts: countLevels(product.id),
  })).sort((a, b) => b.percent - a.percent || a.product.label.localeCompare(b.product.label));
}

export interface OpenGap {
  id: string;
  label: string;
  detail: string;
}

/**
 * Honest remaining work. Rendered by the overview dashboard and mirrored into
 * `docs/project/roadmap-2026.mdx`; an item leaves this list only when a test or
 * a doc-backed code path proves it shipped.
 */
export const OPEN_GAPS: readonly OpenGap[] = [
  {
    id: "inline-typing",
    label: "Free-text caret editing on the page",
    detail:
      "Editable.website lets an editor click body text and type anywhere. Svedit edits structured blocks; free-text caret placement outside a block is not implemented.",
  },
  {
    id: "multi-frame-preview-inline",
    label: "Inline editing in the split-canvas mobile frame",
    detail:
      "Both frames now receive every update, but only the desktop frame is used for editing sessions — the mobile frame is a pure preview surface.",
  },
  {
    id: "ai-undo",
    label: "AI edit review / undo trail",
    detail:
      "An agent edits through the draft-only WebMCP lane and previews with a signed URL; there is no per-tool diff review or one-click AI undo in the preview.",
  },
];
