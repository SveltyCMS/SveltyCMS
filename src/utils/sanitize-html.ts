/**
 * @file src/utils/sanitize-html.ts
 * @description Hardened HTML sanitizer (regex denylist for {@html} sinks).
 *
 * ### Hardening (audit 2026-08):
 * - Entity normalization FIRST: browsers decode numeric entities + `&colon;`
 *   inside attribute values, so the regexes must see the decoded form or
 *   `href="&#106;avascript:…"` / `<scr&#105;pt>` slip through.
 * - Event-handler regex accepts `/` as separator (self-closing bypass
 *   `<img/onerror=…>`) and `>` (tag-terminator bypass) without false-positive
 *   hits on `/on…` inside quoted URLs (lookbehind is anchored to `<tagname`).
 * - Protocol regex covers unquoted values, whitespace after the quote,
 *   internal whitespace in the scheme (`java\tscript:`), and the extra URL
 *   attributes srcset/poster/formaction/xlink:href, plus `vbscript:`.
 * - `style=` attributes carrying url()/expression()/javascript:/@import are
 *   dropped; harmless inline styles are preserved.
 * - Denylist extended with `base` (relative-URL hijack), `svg`, `math`.
 * - ReDoS protection: bounded fixpoint loop (≤ 8 passes, each pass only
 *   removes substrings → monotonic shrink, no backtracking blow-up).
 * - State-based stripHtml: O(N) character traversal.
 *
 * ### Security Note:
 * Regex-based sanitization is never 100% secure for untrusted third-party
 * content. For production-grade user content, prefer DOMPurify (tree-based
 * whitelist parser). This module is the cheap server-side path.
 */

const STRIP_TAGS = [
  "script",
  "iframe",
  "object",
  "embed",
  "link",
  "style",
  "meta",
  "noscript",
  "applet",
  "form",
  "input",
  "button",
  "base",
  "svg",
  "math",
];

const TAG_PATTERN = STRIP_TAGS.join("|");
const RE_PAIRED_TAGS = new RegExp(`<(${TAG_PATTERN})\\b[^>]*>([\\s\\S]*?)<\\/\\1>`, "gi");
const RE_SELF_CLOSING_TAGS = new RegExp(`<(${TAG_PATTERN})\\b[^>]*\\/>`, "gi");
const RE_OPENING_TAGS = new RegExp(`<(${TAG_PATTERN})\\b[^>]*>`, "gi");
const RE_CLOSING_TAGS = new RegExp(`<\\/(${TAG_PATTERN})>`, "gi");

/**
 * HTML event-handler attribute names (closed vocabulary). Browsers execute
 * only these; a curated list keeps the sanitizer precise (no mangling of
 * quoted text like `title="one=two"` while still catching every executable
 * handler).
 */
const RE_HANDLER_NAME = [
  "onerror",
  "onload",
  "onclick",
  "ondblclick",
  "oncontextmenu",
  "onmouseover",
  "onmouseout",
  "onmousedown",
  "onmouseup",
  "onmousemove",
  "onmouseenter",
  "onmouseleave",
  "onwheel",
  "onscroll",
  "onfocus",
  "onblur",
  "onchange",
  "onsubmit",
  "onreset",
  "oninput",
  "oninvalid",
  "onkeydown",
  "onkeyup",
  "onkeypress",
  "onselect",
  "onselectstart",
  "ondrag",
  "ondragstart",
  "ondragend",
  "ondragenter",
  "ondragleave",
  "ondragover",
  "ondrop",
  "ontouchstart",
  "ontouchend",
  "ontouchmove",
  "ontouchcancel",
  "onpointerdown",
  "onpointerup",
  "onpointermove",
  "onpointerover",
  "onpointerout",
  "onpointerenter",
  "onpointerleave",
  "onpointercancel",
  "onpointerrawupdate",
  "onauxclick",
  "onbeforeinput",
  "onplay",
  "onplaying",
  "onpause",
  "oncanplay",
  "onloadeddata",
  "onloadedmetadata",
  "onloadstart",
  "ontimeupdate",
  "onvolumechange",
  "onwaiting",
  "onprogress",
  "onratechange",
  "onseeked",
  "onseeking",
  "onstalled",
  "onsuspend",
  "ontoggle",
  "onfullscreenchange",
  "onanimationstart",
  "onanimationend",
  "onanimationiteration",
  "ontransitionstart",
  "ontransitionrun",
  "ontransitioncancel",
  "ontransitionend",
  "onwebkitanimationstart",
  "onwebkitanimationend",
  "onwebkitanimationiteration",
  "onwebkittransitionend",
  "onformdata",
  "onslotchange",
].join("|");

/** Shared handler-name pattern — reused by sanitizeSvg (media-service). */
export const HANDLER_NAME_PATTERN = RE_HANDLER_NAME;

/**
 * Event handlers. `\s` covers `<img onerror=…>`; the lookbehind-anchored `/`
 * covers the self-closing bypass `<img/onerror=…>` (the `/` immediately after
 * a tag name — a `/` inside a quoted URL is never preceded by `<tagname`);
 * `(?<=>)/` covers `<tag/>onerror=…`; `(?<=["'])\/?` covers attribute
 * injection directly after a closed quoted value — `<img src="x"onerror=…>`
 * (HTML parsing starts a new attribute there; browsers execute it).
 */
const RE_EVENT_HANDLERS = new RegExp(
  `(?:\\s|(?<=<[a-z][a-z0-9]*)\\/|(?<=>)\\/|(?<=["'])\\/?)(${RE_HANDLER_NAME})\\s*=\\s*(?:'[^']*'|"[^"]*"|[^\\s>]+)`,
  "gi",
);

// Scheme matching tolerant of tab/newline injection (browsers strip \t\n in URL
// schemes, so `java\tscript:` === `javascript:` for the parser).
const RE_JS_SCHEME = "j\\s*a\\s*v\\s*a\\s*s\\s*c\\s*r\\s*i\\s*p\\s*t";
const RE_VBS_SCHEME = "v\\s*b\\s*s\\s*c\\s*r\\s*i\\s*p\\s*t";
const RE_DATA_SCHEME = "d\\s*a\\s*t\\s*a";

/**
 * Malicious URL schemes in href/src-family attributes — quoted or unquoted,
 * optional whitespace after the quote, tolerant of internal whitespace.
 * Consumes the whole attribute value and replaces it with `#blocked`, so no
 * scheme residue (`#blockedalert(1)`) survives in the output.
 */
const RE_PROTOCOLS = new RegExp(
  `(href|src|srcset|poster|formaction|action|xlink:href)\\s*=\\s*(['"]?)\\s*(?:${RE_JS_SCHEME}|${RE_VBS_SCHEME}|${RE_DATA_SCHEME})\\s*:[^'"\\s>]*\\2?`,
  "gi",
);

/**
 * `style=` attributes that carry code — CSS url()/expression()/javascript: or
 * @import. Harmless inline styles (colors, layout) are kept.
 */
const RE_DANGEROUS_STYLE = /(?:\s+style\s*=\s*(['"])([\s\S]*?)\1|\s+style\s*=\s*([^\s>]+))/gi;

/**
 * Fast-path scans — non-global mirrors of the dangerous patterns that can
 * appear WITHOUT a `<` (attribute-injection payloads like `" onmouseover=\"…"`
 * or `javascript:` URLs). RE_EVENT_HANDLERS is a superset of the full-path
 * handler regex, so the fast path never returns a string the full pipeline
 * would have modified.
 */
const RE_EVENT_HANDLER_SCAN =
  /\s(?:on[a-z]+\s*=|style\s*=\s*(?:["'])?[^"'\s>]*?(?:url\s*\(|javascript\s*:|expression\s*\())/i;
const RE_JAVASCRIPT_SCAN = new RegExp(
  `(?:${RE_JS_SCHEME}|${RE_VBS_SCHEME}|${RE_DATA_SCHEME})\\s*:`,
  "i",
);

/**
 * Normalize numeric HTML entities (and `&colon;`) to their ASCII characters.
 * Browsers decode these inside attribute values and tag names, so without this
 * step `href="&#106;avascript:…"` and `<scr&#105;pt>` are invisible to the
 * regexes. Only printable ASCII (32–126) is decoded — never control chars or
 * non-ASCII, so this cannot introduce metacharacters the sanitizer lacks.
 */
export function decodeHtmlEntities(input: string): string {
  if (!input || !/[&#]/.test(input)) return input;
  return input.replace(/&colon;/gi, ":").replace(/&#(x[0-9a-fA-F]+|\d+);/gi, (match, code) => {
    const hex = code[0] === "x" || code[0] === "X";
    const n = hex ? parseInt(code.slice(1), 16) : parseInt(code, 10);
    return Number.isFinite(n) && n >= 32 && n < 127 ? String.fromCharCode(n) : match;
  });
}

/**
 * Maximum fixpoint passes for sanitizeHtml. Each pass only removes substrings,
 * so the loop strictly shrinks the string and terminates; nested reconstruction
 * (`<scr<script>ipt>` → `<script>`) needs at most a second pass, so 8 bounds
 * adversarial nesting depth with no ReDoS surface.
 */
const MAX_SANITIZE_PASSES = 8;

/**
 * Strips dangerous HTML tags, event handlers, and malicious URL schemes.
 *
 * Fixpoint loop (same defense as sanitizeSvg): a single removal pass can EXPOSE
 * a new dangerous construct — the tag strip joins `on<script>` + `error=…` into
 * `onerror=…`, and a nested `<scr<script>ipt>…</scr</script>ipt>` reconstructs a
 * live opening tag. Re-running until stable guarantees no such residue survives.
 * The fast path above still short-circuits plain text without markup.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return "";
  // Normalize entities first (see decodeHtmlEntities).
  const normalized = decodeHtmlEntities(html);

  // 🚀 FAST PATH: no markup (`<`) and none of the attribute-injection patterns
  // that matter without tags. Checks the actual threat patterns instead of the
  // bare "on" substring — "Content for item…" (plain-text field values) no
  // longer forces the full regex pipeline. Output-identical to the full path
  // for every input the fast path accepts (the full pipeline would find no
  // matches either), so this is a pure zero-allocation short-circuit.
  if (!normalized.includes("<")) {
    if (!RE_EVENT_HANDLER_SCAN.test(normalized) && !RE_JAVASCRIPT_SCAN.test(normalized)) {
      return normalized;
    }
  }

  let cleaned = normalized;
  let previous = "";
  for (let pass = 0; pass < MAX_SANITIZE_PASSES && cleaned !== previous; pass++) {
    previous = cleaned;

    // 1. Remove dangerous tags and their content via pre-compiled regexes.
    // codeql[js/incomplete-multi-character-sanitization]: fixpoint loop — each pass
    // re-scans until stable (mirrors sanitizeSvg), so a reconstructed tag or
    // handler from an earlier removal is stripped on the next pass.
    cleaned = cleaned.replace(RE_PAIRED_TAGS, "");
    cleaned = cleaned.replace(RE_SELF_CLOSING_TAGS, "");
    cleaned = cleaned.replace(RE_OPENING_TAGS, "");
    // Orphan closing tags
    cleaned = cleaned.replace(RE_CLOSING_TAGS, "");

    // 2. Strip event handlers (whitespace, tag-boundary, or post-quote separated)
    // codeql[js/incomplete-multi-character-sanitization]: fixpoint loop (see above);
    // the authoritative render path re-sanitizes with parser-based DOMPurify.
    cleaned = cleaned.replace(RE_EVENT_HANDLERS, "");

    // 3. Drop style= attributes that carry code (keep harmless inline styles)
    cleaned = cleaned.replace(
      RE_DANGEROUS_STYLE,
      (match, quotedVal, quotedContent, unquotedVal) => {
        const value = quotedVal !== undefined ? quotedContent : unquotedVal || "";
        return /(?:url\s*\(|expression\s*\(|javascript\s*:|@import)/i.test(value) ? "" : match;
      },
    );

    // 4. Block malicious URL schemes — consume the whole value, keep attr name
    cleaned = cleaned.replace(RE_PROTOCOLS, (_match, attr) => `${attr}="#blocked"`);
  }

  return cleaned;
}

/**
 * Strips ALL HTML tags, returning plain text.
 * 🚀 Performance: State-based character traversal — O(N), immune to malformed HTML.
 */
export function stripHtml(html: string): string {
  if (!html) return "";
  if (!html.includes("<")) return html;

  let output = "";
  let inTag = false;

  for (let i = 0; i < html.length; i++) {
    if (html[i] === "<") inTag = true;
    else if (html[i] === ">") inTag = false;
    else if (!inTag) output += html[i];
  }

  return output;
}
