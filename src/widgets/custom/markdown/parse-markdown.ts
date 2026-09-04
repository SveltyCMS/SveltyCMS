/**
 * @file src/widgets/custom/markdown/parse-markdown.ts
 * @description Centralized, secure markdown parser for SveltyCMS markdown widgets.
 *
 * Features:
 * - Non-greedy inline token parsing: bold, italic, strikethrough, inline code
 * - Block parsing: headings (H1-H6), fenced code blocks, blockquotes, unordered & ordered lists, horizontal rules
 * - XSS defense: piped through sanitizeHtml
 * - Eliminates duplicate regex parser implementations across input/display components
 */

import { sanitizeHtml } from "@utils/sanitize-html";

/**
 * Parses markdown text into sanitized HTML.
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

  return sanitizeHtml(output.join("\n"));
}

/**
 * Parse inline markdown tokens using non-greedy matching.
 */
function parseInline(text: string): string {
  return (
    text
      // Images: ![alt](url)
      .replace(/!\[(.*?)\]\((.*?)\)/g, '<img alt="$1" src="$2" />')
      // Links: [text](url)
      .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>')
      // Bold: **text** or __text__ (non-greedy)
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/__(.*?)__/g, "<strong>$1</strong>")
      // Italic: *text* or _text_ (non-greedy)
      .replace(/(?<!\*)\*(?!\*)(.*?)(?<!\*)\*(?!\*)/g, "<em>$1</em>")
      .replace(/(?<!_)_(?!_)(.*?)(?<!_)_(?!_)/g, "<em>$1</em>")
      // Strikethrough: ~~text~~
      .replace(/~~(.*?)~~/g, "<del>$1</del>")
      // Inline code: `code`
      .replace(/`([^`]+)`/g, "<code>$1</code>")
  );
}
