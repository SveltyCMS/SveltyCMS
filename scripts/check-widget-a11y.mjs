/**
 * @file scripts/check-widget-a11y.mjs
 * @description Drift guard for the widget accessibility rules in
 * docs/contributing/accessibility.mdx. Scans src/widgets/**\/*.svelte and exits 1
 * when a widget reintroduces an audited anti-pattern:
 *
 * Rule A — `cursor-pointer` on non-link elements.
 *   CSS3-UI reserves `cursor: pointer` for links; buttons, labels and form
 *   controls keep the default cursor (accessibility.mdx → Cursor semantics).
 *   Draggable handles must use `cursor-grab` instead.
 *
 * Rule B — `outline-none` / `outline-0` without a visible ring alternative.
 *   WCAG 2.4.7 / 2.4.13: removing the outline requires a >=3:1 ring in the
 *   same class list. Raw form controls (input/textarea/select) are exempt —
 *   the global utilities.css rule paints an inset focus shadow for them —
 *   and capitalized component tags (<Button>, <Input>, …) own their ring in
 *   their base class.
 *
 * Usage:
 *   bun run scripts/check-widget-a11y.mjs   # drift guard (exit 1 on findings) —
 *                                           # wired into `bun run check`
 *
 * Features:
 * - Pure `auditWidgetA11y(text, label)` export for unit tests (no fs access).
 * - Comment-safe: class="" samples inside <!-- --> comments are ignored.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Content-widget roots — dashboard widgets are a separate component family. */
const ROOT_DIRS = ["src/widgets"];

const RULE_A_MESSAGE =
  "cursor-pointer on a non-link element — pointer is reserved for links (accessibility.mdx)";
const RULE_B_MESSAGE =
  "outline-none/outline-0 without a ring alternative — add a focus-visible ring (WCAG 2.4.7/2.4.13)";

/** Raw form controls get a global inset focus shadow from utilities.css. */
const FORM_CONTROLS = new Set(["input", "textarea", "select"]);

/**
 * Yield complete class-attribute values (quoted or backtick templates) with
 * their start offsets. Svelte `{...}` expressions inside double-quoted attrs
 * and `${...}` inside backtick templates are treated as plain content.
 *
 * @param {string} text - .svelte source
 * @yields {{ content: string, start: number }} attribute value + quote offset
 */
function* classAttrs(text) {
  const re = /(?<![A-Za-z0-9_])class\s*=/g;
  for (const m of text.matchAll(re)) {
    let i = m.index + m[0].length;
    while (i < text.length && /\s/.test(text[i])) i += 1;
    const q = text[i];
    if (q !== '"' && q !== "'" && q !== "`") continue;
    let j = i + 1;
    let brace = 0;
    while (j < text.length) {
      const c = text[j];
      if (q === "`") {
        if (c === "$" && text[j + 1] === "{") {
          brace += 1;
          j += 2;
          continue;
        }
        if (c === "}" && brace > 0) {
          brace -= 1;
          j += 1;
          continue;
        }
        if (c === "`" && brace === 0) break;
      } else if (c === q) break;
      j += 1;
    }
    if (text[j] !== q) continue; // unterminated attribute — skip
    yield { content: text.slice(i + 1, j), start: i };
  }
}

/**
 * Nearest open tag owning an attribute offset, or null inside a comment.
 *
 * @param {string} text - .svelte source
 * @param {number} attrStart - offset of the class attribute value
 * @returns {string | null} tag name of the owning element
 */
function ownerTag(text, attrStart) {
  const before = text.slice(0, attrStart);
  const lastCommentOpen = before.lastIndexOf("<!--");
  const lastCommentClose = before.lastIndexOf("-->");
  if (lastCommentOpen > lastCommentClose) return null; // inside a comment
  const seg = before.slice(before.lastIndexOf(">") + 1);
  const tags = [...seg.matchAll(/<\s*\/?\s*([A-Za-z][\w-]*)/g)];
  if (tags.length === 0) return null;
  return tags[tags.length - 1][1];
}

/**
 * 1-based line/column for an offset.
 *
 * @param {string} text - source
 * @param {number} offset - character offset
 * @returns {{ line: number, col: number }}
 */
function lineCol(text, offset) {
  const lines = text.slice(0, offset).split("\n");
  return { line: lines.length, col: lines[lines.length - 1].length + 1 };
}

/**
 * Audit widget markup for the two drift rules. Pure function — unit-testable.
 *
 * @param {string} text - .svelte source
 * @param {string} label - file path or fixture label for the report
 * @returns {Array<{file: string, line: number, col: number, rule: string, tag: string, message: string}>}
 */
export function auditWidgetA11y(text, label = "<snippet>") {
  const findings = [];
  for (const attr of classAttrs(text)) {
    const tag = ownerTag(text, attr.start);
    if (!tag) continue;
    const tagLower = tag.toLowerCase();
    if (/\bcursor-pointer\b/.test(attr.content) && tagLower !== "a") {
      findings.push({
        file: label,
        ...lineCol(text, attr.start),
        rule: "A",
        tag,
        message: RULE_A_MESSAGE,
      });
    }
    const isRawTag = /^[a-z]/.test(tag);
    if (isRawTag && !FORM_CONTROLS.has(tagLower)) {
      const hasOutlineRemoval = /\boutline-(?:none|0)\b/.test(attr.content);
      const hasRing = /\bring-(?!0\b|offset\b)/.test(attr.content);
      if (hasOutlineRemoval && !hasRing) {
        findings.push({
          file: label,
          ...lineCol(text, attr.start),
          rule: "B",
          tag,
          message: RULE_B_MESSAGE,
        });
      }
    }
  }
  return findings;
}

/**
 * Recursively collect .svelte files under a directory.
 *
 * @param {string} dir - directory to walk
 * @param {string[]} out - accumulator
 * @returns {string[]} file paths
 */
function walk(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".svelte")) out.push(full);
  }
  return out;
}

function main() {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const files = ROOT_DIRS.flatMap((dir) => walk(join(root, dir), []));
  let findingsTotal = 0;
  /** @type {Record<string, number>} */
  const byRule = { A: 0, B: 0 };
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const findings = auditWidgetA11y(text, file);
    for (const f of findings) {
      byRule[f.rule] += 1;
      findingsTotal += 1;
      console.error(`${f.file}:${f.line}:${f.col}  [${f.rule}] <${f.tag}> ${f.message}`);
    }
  }
  if (findingsTotal > 0) {
    console.error(
      `check-widget-a11y: ${findingsTotal} finding(s) in ${files.length} widget files ` +
        `(A=${byRule.A}, B=${byRule.B}). Fix them or relax the rule in scripts/check-widget-a11y.mjs.`,
    );
    process.exitCode = 1;
  } else {
    console.log(`check-widget-a11y: clean — ${files.length} widget files scanned.`);
  }
}

// Windows-safe main detection: cwd casing can differ from the real on-disk path
// (import.meta.url), so compare the script basename instead of full paths.
const isMain = Boolean(
  process.argv[1]?.replaceAll("\\", "/").endsWith("scripts/check-widget-a11y.mjs"),
);
if (isMain) main();
