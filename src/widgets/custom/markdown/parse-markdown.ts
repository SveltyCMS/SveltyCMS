/**
 * @file src/widgets/custom/markdown/parse-markdown.ts
 * @description Centralized, browser-safe markdown parser for SveltyCMS markdown widgets.
 *
 * Features:
 * - Non-greedy inline token parsing: bold, italic, strikethrough, inline code
 * - Block parsing: headings (H1-H6), fenced code blocks, blockquotes, unordered & ordered lists, horizontal rules
 * - XSS defense: every text run is HTML-escaped before our own tags are inserted;
 *   link/image URLs are scheme-checked and never re-parsed as markup
 * - Eliminates duplicate regex parser implementations across input/display components
 */

import { decodeHtmlEntities, stripHtml } from "@utils/sanitize-html";

/** Schemes a markdown link/image may use. Everything else renders as text. */
const SAFE_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const SAFE_SCHEMES = new Set(["http", "https", "mailto", "tel"]);

/** Private-use sentinel that protects tokenized HTML from later regex passes. */
const SENTINEL = "\uE000";
const TOKEN_RE = /\uE000(\d+)\uE000/g;

/** Remove ASCII control characters and whitespace (browsers ignore them in URL schemes). */
function stripUrlInvisibles(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code > 0x20 && code !== 0x7f) out += char;
  }
  return out;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Validate a URL captured from markdown and return it ready for a quoted
 * attribute. The value is already HTML-escaped by {@link parseInline}, so this
 * only decides whether the URL is allowed; it never unescapes the output.
 */
function safeHref(escapedUrl: string): string | null {
  const value = escapedUrl.trim();
  // Whitespace/control-stripped copy for scheme detection only
  // (`java\tscript:` and `javascript :` normalize to `javascript:`).
  const compact = stripUrlInvisibles(decodeHtmlEntities(value));
  if (!compact || compact.startsWith("//") || compact.startsWith("/\\")) return null;

  const scheme = SAFE_SCHEME_RE.exec(compact)?.[0].slice(0, -1).toLowerCase();
  if (scheme && !SAFE_SCHEMES.has(scheme)) return null;

  return value;
}

/** Emphasis replacements over already-escaped text. Never inserts user input. */
function applyEmphasis(text: string): string {
  return (
    text
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/__(.*?)__/g, "<strong>$1</strong>")
      // Italic: *text* or _text_ (non-greedy)
      .replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, "<em>$1</em>")
      .replace(/(?<!_)_(?!_)(.*?)(?<!_)_(?!_)/g, "<em>$1</em>")
      // Strikethrough: ~~text~~
      .replace(/~~(.*?)~~/g, "<del>$1</del>")
  );
}

/**
 * Parse inline markdown tokens using non-greedy matching.
 *
 * Code spans and links/images are replaced with sentinels first, so emphasis
 * and URL extraction can never re-read each other's output. The remaining text
 * is escaped before any tag is inserted, so raw HTML in the source renders as
 * literal text instead of markup.
 */
function parseInline(text: string): string {
  const tokens: string[] = [];
  const store = (html: string): string => `${SENTINEL}${tokens.push(html) - 1}${SENTINEL}`;

  let out = escapeHtml(text.split(SENTINEL).join(""));

  // Inline code first: backticks protect their content from emphasis and links.
  out = out.replace(/`([^`]+)`/g, (_match, content: string) => store(`<code>${content}</code>`));

  // Images: ![alt](url)
  out = out.replace(/!\[(.*?)\]\((.*?)\)/g, (_match, alt: string, url: string) => {
    const href = safeHref(url);
    return href ? store(`<img alt="${stripHtml(alt)}" src="${href}" />`) : stripHtml(alt);
  });

  // Links: [text](url) — the label may itself carry emphasis.
  out = out.replace(/\[(.*?)\]\((.*?)\)/g, (_match, label: string, url: string) => {
    const href = safeHref(url);
    return href ? store(`<a href="${href}">${applyEmphasis(label)}</a>`) : applyEmphasis(label);
  });

  out = applyEmphasis(out);

  return out.replace(TOKEN_RE, (_match, index: string) => tokens[Number(index)] ?? "");
}

/**
 * Parses markdown text into HTML with only parser-generated tags.
 * Uses non-greedy regex matching to avoid multi-span greedy capture bugs.
 */
export function parseMarkdown(md: string | null | undefined): string {
  if (!md || typeof md !== "string") return "";

  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const output: string[] = [];
  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let inList = false;
  let listType: "ul" | "ol" | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Fenced code blocks ```
    if (line.trim().startsWith("```")) {
      if (inCodeBlock) {
        output.push(`<pre><code>${codeBlockContent.join("\n")}</code></pre>`);
        codeBlockContent = [];
        inCodeBlock = false;
      } else {
        if (inList) {
          output.push(listType === "ul" ? "</ul>" : "</ol>");
          inList = false;
          listType = null;
        }
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(
        line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"),
      );
      continue;
    }

    // Unordered list items: * or -
    const ulMatch = line.match(/^(\s*)[*-]\s+(.+)$/);
    if (ulMatch) {
      if (!inList || listType !== "ul") {
        if (inList) output.push(listType === "ul" ? "</ul>" : "</ol>");
        output.push("<ul>");
        inList = true;
        listType = "ul";
      }
      output.push(`<li>${parseInline(ulMatch[2])}</li>`);
      continue;
    }

    // Ordered list items: 1. 2. etc.
    const olMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);
    if (olMatch) {
      if (!inList || listType !== "ol") {
        if (inList) output.push(listType === "ul" ? "</ul>" : "</ol>");
        output.push("<ol>");
        inList = true;
        listType = "ol";
      }
      output.push(`<li>${parseInline(olMatch[2])}</li>`);
      continue;
    }

    // If we were in a list and hit a non-list item, close it
    if (inList) {
      output.push(listType === "ul" ? "</ul>" : "</ol>");
      inList = false;
      listType = null;
    }

    // Empty lines
    if (!line.trim()) {
      continue;
    }

    // Headings # through ######
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      output.push(`<h${level}>${parseInline(headingMatch[2])}</h${level}>`);
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      output.push(`<blockquote><p>${parseInline(line.slice(2))}</p></blockquote>`);
      continue;
    }

    // Horizontal rule
    if (/^(\*{3,}|-{3,}|_{3,})$/.test(line.trim())) {
      output.push("<hr />");
      continue;
    }

    // Standard paragraph
    output.push(`<p>${parseInline(line)}</p>`);
  }

  // Clean up unclosed blocks
  if (inCodeBlock) {
    output.push(`<pre><code>${codeBlockContent.join("\n")}</code></pre>`);
  }
  if (inList) {
    output.push(listType === "ul" ? "</ul>" : "</ol>");
  }

  return output.join("\n");
}
