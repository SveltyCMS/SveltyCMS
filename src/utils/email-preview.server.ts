/**
 * @file src/utils/email-preview.server.ts
 * @description Prepare rendered email HTML for the sandboxed `srcdoc` preview iframe.
 *
 * The preview renders arbitrary transactional-email markup inside
 * `<iframe sandbox="" srcdoc="…">`. That document has an **opaque origin**, which
 * changes how its subresources resolve and load:
 *
 * - the renderer emits `<base href="<origin>/email-previews">`, so root-relative
 *   URLs (`/SveltyCMS.png`) resolve against the app route rather than the document;
 * - the embedding page enforces COEP, so any cross-origin subresource without a
 *   `Cross-Origin-Resource-Policy` header is blocked. SvelteKit serves `static/`
 *   files before the hook chain, so the CMS cannot add CORP to them — measured on
 *   a production build: `GET /SveltyCMS.png` answers **without** a CORP header.
 *
 * Chromium reports the resulting blocked image as `net::ERR_INVALID_ARGUMENT` and
 * logs it as a `console.error`, which the E2E zero-error guard rightly fails on.
 * The fix is therefore to make the preview **self-contained**: every asset the
 * templates embed is inlined as a `data:` URI, the `<base>` element is removed,
 * and scripts/inline handlers are stripped (the frame is sandboxed without
 * `allow-scripts`; every script Chrome blocks is another console error).
 *
 * Inlining is preview-only — the HTML that is actually sent by mail keeps the
 * hosted logo URL.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Public assets the email templates embed, inlined into the preview document. */
const INLINE_ASSETS: ReadonlyArray<{ publicPath: string; mime: string; file: string }> = [
  { publicPath: "/SveltyCMS.png", mime: "image/png", file: "SveltyCMS.png" },
];

let inlineUrls: Map<string, string> | null = null;

/**
 * Resolve the allowlisted public assets to `data:` URIs.
 *
 * The file lives in `static/` in the source tree and in `build/client/` in an
 * adapter-node build; both are probed once and cached for the process lifetime.
 * An asset that cannot be found is simply not inlined — the caller then falls
 * back to the absolute-URL rewrite.
 */
function resolveInlineAssets(): Map<string, string> {
  if (inlineUrls) return inlineUrls;

  const roots = [join(process.cwd(), "build", "client"), join(process.cwd(), "static")];
  const resolved = new Map<string, string>();

  for (const asset of INLINE_ASSETS) {
    const file = roots.map((root) => join(root, asset.file)).find((path) => existsSync(path));
    if (!file) continue;
    resolved.set(
      asset.publicPath,
      `data:${asset.mime};base64,${readFileSync(file).toString("base64")}`,
    );
  }

  inlineUrls = resolved;
  return resolved;
}

/** Public path of an asset URL in any of the forms the templates emit. */
function toPublicPath(url: string, origin: string): string | null {
  const withoutQuery = url.split(/[?#]/)[0];
  if (withoutQuery.startsWith("/")) return withoutQuery;
  if (withoutQuery.startsWith(`${origin}/`)) return withoutQuery.slice(origin.length);
  try {
    return new URL(withoutQuery).pathname;
  } catch {
    return null;
  }
}

/**
 * Make rendered email HTML safe and self-contained for the `srcdoc` preview.
 *
 * @param html   Markup produced by the email renderer.
 * @param origin Request origin, used as the fallback base for root-relative URLs.
 */
export function preparePreviewHtml(html: string, origin: string): string {
  const assets = resolveInlineAssets();

  return (
    html
      // Drop the renderer's <base>: nothing in a self-contained document needs it,
      // and it silently rebinds every relative URL to the app route.
      .replace(/<base\b[^>]*>/gi, "")
      // The frame is sandboxed without allow-scripts. Strip closed AND unclosed
      // script tags plus inline handlers so Chrome logs no blocked-script error.
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<script\b[^>]*>/gi, "")
      .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
      // Inline known assets so the preview fetches nothing at all.
      .replace(/\s(src|href)="([^"]*)"/gi, (full: string, attr: string, url: string) => {
        const publicPath = toPublicPath(url, origin);
        const data = publicPath ? assets.get(publicPath) : undefined;
        return data ? ` ${attr}="${data}"` : full;
      })
      // Fallback for anything else that is still root-relative.
      .replace(
        /\s(src|href)="\/(?!\/)([^"]*)"/gi,
        (_full: string, attr: string, path: string) => ` ${attr}="${origin}/${path}"`,
      )
  );
}
