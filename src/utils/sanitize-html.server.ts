/**
 * @file src/utils/sanitize-html.server.ts
 * @description Parser-based HTML and SVG sanitizers (server-only).
 *
 * Uses `sanitize-html` (htmlparser2 tree walk) with explicit allowlists instead
 * of a regex denylist, so nested or encoded reconstructions such as
 * `<scr<script>ipt>` cannot smuggle a live tag past the filter.
 *
 * Features:
 * - `sanitizeHtml()` — rich-text allowlist (formatting, links, images, tables)
 * - `sanitizeSvgMarkup()` — strict SVG allowlist; `href`/`xlink:href` only `#…`
 * - Plain-text fast path: no parser call when the input has no `<`
 * - `HTML_ALLOWED_TAGS` exported as the single source of truth for input triage
 *
 * Server-only by design: `sanitize-html` uses postcss for style parsing and is
 * not part of the browser bundle. Browser paths receive content already
 * sanitized by the write pipeline or the site loaders.
 */

import sanitize from "sanitize-html";

/** Options accepted by the `sanitize-html` entry point (avoids the CJS type namespace). */
type SanitizeOptions = NonNullable<Parameters<typeof sanitize>[1]>;

/**
 * Rich-text allowlist. Mirrors the documented safe set (formatting, links,
 * images, lists, tables) and is the same vocabulary `input-sanitizer` uses for
 * its triage reference.
 */
export const HTML_ALLOWED_TAGS = [
  "a",
  "abbr",
  "address",
  "article",
  "b",
  "blockquote",
  "br",
  "caption",
  "cite",
  "code",
  "col",
  "colgroup",
  "dd",
  "del",
  "details",
  "dfn",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "footer",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "i",
  "img",
  "ins",
  "kbd",
  "li",
  "mark",
  "nav",
  "ol",
  "p",
  "pre",
  "q",
  "s",
  "samp",
  "section",
  "small",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "time",
  "tr",
  "u",
  "ul",
  "var",
] as const;

const HTML_OPTIONS: SanitizeOptions = {
  allowedTags: [...HTML_ALLOWED_TAGS],
  allowedAttributes: {
    a: ["href", "name", "target", "rel", "title"],
    img: ["src", "alt", "title", "width", "height", "loading"],
    table: ["border", "cellpadding", "cellspacing", "width"],
    col: ["span", "width"],
    colgroup: ["span", "width"],
    td: ["colspan", "rowspan", "align", "valign", "width", "height"],
    th: ["colspan", "rowspan", "align", "valign", "width", "height"],
    "*": ["class", "id", "title", "dir", "lang"],
  },
  // No data:/vbscript:/javascript: — sanitize-html drops the attribute instead.
  allowedSchemes: ["http", "https", "mailto", "tel"],
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  transformTags: {
    a: (tagName, attribs) => {
      if (attribs.target === "_blank") attribs.rel = "noopener noreferrer";
      return { tagName, attribs };
    },
  },
};

/**
 * SVG allowlist. `style`, `script`, `foreignObject`, `animate`, `set` and every
 * `on*` handler are absent, so the parser drops them; `script`/`style` content
 * is removed as non-text, while a removed wrapper keeps only its escaped text.
 */
const SVG_ALLOWED_TAGS = [
  "svg",
  "g",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "defs",
  "linearGradient",
  "radialGradient",
  "stop",
  "clipPath",
  "mask",
  "use",
  "symbol",
  "title",
  "desc",
] as const;

/** Geometric / paint attributes plus the namespaced-plus-font attributes SVG text needs. */
const SVG_ALLOWED_ATTRIBUTES = [
  "viewBox",
  "d",
  "fill",
  "stroke",
  "stroke-width",
  "x",
  "y",
  "width",
  "height",
  "cx",
  "cy",
  "r",
  "rx",
  "ry",
  "points",
  "transform",
  "opacity",
  "offset",
  "stop-color",
  "stop-opacity",
  "gradientUnits",
  "gradientTransform",
  "clip-path",
  "mask",
  "id",
  "class",
  "xmlns",
  "xmlns:xlink",
  "font-size",
  "font-family",
  "font-weight",
  "text-anchor",
  "preserveAspectRatio",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "fill-rule",
  "fill-opacity",
  "stroke-opacity",
  "href",
  "xlink:href",
];

const SVG_OPTIONS: SanitizeOptions = {
  allowedTags: [...SVG_ALLOWED_TAGS],
  allowedAttributes: { "*": [...SVG_ALLOWED_ATTRIBUTES] },
  allowedSchemes: ["http", "https"],
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  // Preserve camelCase SVG names (`viewBox`, `linearGradient`, …).
  parser: { lowerCaseAttributeNames: false, lowerCaseTags: false },
  // A reference href is only useful for same-document paint/use targets.
  transformTags: {
    "*": (tagName, attribs) => {
      for (const name of ["href", "xlink:href"]) {
        const value = attribs[name];
        if (value !== undefined && !value.trim().startsWith("#")) delete attribs[name];
      }
      return { tagName, attribs };
    },
  },
};

/**
 * Sanitize authored rich text against the HTML allowlist.
 *
 * Accepts `unknown`: persisted rows can hold legacy or malformed shapes (a
 * localized `{ title, content }` object rather than HTML). Throwing here would
 * turn a data problem into a 500 on the site root, so non-strings sanitize to
 * the empty string instead.
 *
 * Plain text (no `<`) is returned untouched without parsing — the write path
 * calls this for every richtext/markdown field, and most values are prose.
 */
export function sanitizeHtml(html: unknown): string {
  if (typeof html !== "string" || !html) return "";
  if (!html.includes("<")) return html;
  return sanitize(html, HTML_OPTIONS);
}

/**
 * Sanitize uploaded SVG markup against the strict SVG allowlist.
 *
 * XML documents are parsed as HTML (the browser then re-parses the stored bytes
 * as XML/`image/svg+xml`), so the allowlist — not the serialization — is the
 * security boundary. Self-closing elements may be expanded to open/close pairs.
 * Non-string input sanitizes to the empty string (see `sanitizeHtml`).
 */
export function sanitizeSvgMarkup(svg: unknown): string {
  if (typeof svg !== "string" || !svg) return "";
  if (!svg.includes("<")) return svg;
  return sanitize(svg, SVG_OPTIONS);
}
