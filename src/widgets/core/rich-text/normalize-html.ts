/**
 * @file src/widgets/core/rich-text/normalize-html.ts
 * @description Comparison-only HTML normalizer for the rich-text widget sync loop.
 *
 * TipTap serializes its default LTR alignment as `style="text-align: left;"`, while
 * content created via REST/imports is plain `<p>…</p>`. Comparing the two strings
 * verbatim made the value↔editor effect bounce until Svelte threw
 * `effect_update_depth_exceeded`. This module removes ONLY the default LTR
 * `text-align` declaration (`left`/`start`) and leaves every other declaration —
 * a real `center`/`right`/`justify` alignment still differs from plain HTML.
 *
 * Features:
 * - empty-document forms (`<p></p>`, `<p><br></p>`, styled empty `<p>`) → `''`
 * - drops only `text-align: left|start` from `style`, preserves the rest
 * - removes a `style` attribute left empty, normalizes declaration spacing/quoting
 * - also offers `isSameHtml` for the two comparison sites on the widget
 * - regex-based (no DOM parser) so it runs on the server and in the browser
 */

/** `''` for the empty documents TipTap emits, including styled empty paragraphs. */
const EMPTY_PARAGRAPH_RE = /^<p[^>]*>\s*(?:<br\s*\/?>\s*)?<\/p>$/i;

/** Matches a `style` attribute with either quoting style. */
const STYLE_ATTRIBUTE_RE = /\s+style\s*=\s*(["'])([\s\S]*?)\1/gi;

const DEFAULT_LTR_ALIGNMENTS = new Set(["left", "start"]);

/**
 * Rewrites one `style` attribute value: drops default LTR `text-align`
 * declarations, keeps the others in source order, and normalizes spacing.
 *
 * @returns The normalized declarations, or `null` when nothing remains.
 */
function normalizeStyleDeclarations(value: string): string | null {
  const declarations: string[] = [];

  for (const rawDeclaration of value.split(";")) {
    const declaration = rawDeclaration.trim();
    if (!declaration) continue;

    const separator = declaration.indexOf(":");
    if (separator === -1) {
      // Not a declaration (`color` alone, a stray token) — keep it verbatim.
      declarations.push(declaration);
      continue;
    }

    const property = declaration.slice(0, separator).trim().toLowerCase();
    const propertyValue = declaration.slice(separator + 1).trim();

    if (property === "text-align" && DEFAULT_LTR_ALIGNMENTS.has(propertyValue.toLowerCase())) {
      continue;
    }

    declarations.push(`${property}: ${propertyValue}`);
  }

  return declarations.length > 0 ? declarations.join("; ") : null;
}

/**
 * Normalizes HTML for equality comparison (never used for what is stored).
 *
 * @param html Raw editor or stored HTML.
 * @returns Trimmed, comparison-stable HTML; `''` for empty documents.
 *
 * @example
 * normalizeHtml('<p style="text-align: left; color: red">x</p>'); // '<p style="color: red">x</p>'
 * normalizeHtml('<p> x </p>') === normalizeHtml('<p style="text-align: left;"> x </p>'); // true
 */
export function normalizeHtml(html: string): string {
  if (!html) return "";

  const trimmed = html.trim();
  if (EMPTY_PARAGRAPH_RE.test(trimmed)) return "";

  return trimmed.replace(STYLE_ATTRIBUTE_RE, (_match, _quote: string, value: string) => {
    const normalized = normalizeStyleDeclarations(value);
    if (normalized === null) return "";
    // Always emit double quotes so an otherwise identical single-quoted style compares equal.
    return ` style="${normalized}"`;
  });
}

/**
 * Whether two HTML strings describe the same editor document, ignoring TipTap's
 * default LTR alignment markup and empty-document serialization differences.
 */
export function isSameHtml(a: string, b: string): boolean {
  return normalizeHtml(a) === normalizeHtml(b);
}
