/**
 * @file tests/unit/utils/email-preview.test.ts
 * @description Preparation of rendered email HTML for the sandboxed `srcdoc` preview.
 *
 * The preview document has an opaque origin, so a subresource that is merely
 * same-origin on the wire is a cross-origin request for the frame and is blocked
 * when the response carries no CORP header (measured: static files leave SvelteKit
 * before the hook chain, so they never get one). These tests pin the three
 * properties that keep the preview free of console errors:
 *
 * ### Features tested
 * - allowlisted assets are inlined as `data:` URIs, whatever absolute form they use
 * - the renderer's `<base>` element is dropped
 * - scripts (closed and unclosed) and inline handlers are stripped
 * - unknown root-relative URLs still fall back to the request origin
 */

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const ORIGIN = "http://127.0.0.1:4173";
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

let preparePreviewHtml: (html: string, origin: string) => string;

beforeAll(async () => {
  // The resolver probes `<cwd>/build/client` and `<cwd>/static`; a temp root with a
  // stand-in logo is enough to exercise the inlining branch deterministically.
  const root = mkdtempSync(join(tmpdir(), "email-preview-"));
  mkdirSync(join(root, "static"), { recursive: true });
  writeFileSync(join(root, "static", "SveltyCMS.png"), PNG_MAGIC);
  process.chdir(root);

  ({ preparePreviewHtml } = await import("@utils/email-preview.server"));
});

describe("preparePreviewHtml", () => {
  it("inlines the renderer's logo instead of leaving a fetchable URL", () => {
    const html = `<img src="${ORIGIN}/SveltyCMS.png" alt="logo">`;
    const prepared = preparePreviewHtml(html, ORIGIN);

    expect(prepared).toContain("data:image/png;base64,");
    expect(prepared).not.toContain(`${ORIGIN}/SveltyCMS.png`);
  });

  it("inlines the logo for a root-relative src as well", () => {
    const prepared = preparePreviewHtml(`<img src="/SveltyCMS.png">`, ORIGIN);

    expect(prepared).toContain("data:image/png;base64,");
    expect(prepared).not.toContain('src="/SveltyCMS.png"');
  });

  it("drops the renderer's base element", () => {
    const html = `<head><base href="${ORIGIN}/email-previews"></head><body>hi</body>`;
    expect(preparePreviewHtml(html, ORIGIN)).not.toContain("<base");
  });

  it("strips closed and unclosed scripts plus inline handlers", () => {
    const html = [
      "<body>",
      "<script>console.log('x')</script>",
      '<script src="/app.js">',
      '<a href="#" onclick="alert(1)">link</a>',
      "</body>",
    ].join("");
    const prepared = preparePreviewHtml(html, ORIGIN);

    expect(prepared.toLowerCase()).not.toContain("<script");
    expect(prepared.toLowerCase()).not.toContain("onclick");
    expect(prepared).toContain(">link</a>");
  });

  it("falls back to the request origin for unlisted root-relative URLs", () => {
    const prepared = preparePreviewHtml('<a href="/legal">terms</a>', ORIGIN);
    expect(prepared).toContain(`href="${ORIGIN}/legal"`);
  });

  it("leaves data: URIs untouched", () => {
    const html = '<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">';
    expect(preparePreviewHtml(html, ORIGIN)).toBe(html);
  });
});
