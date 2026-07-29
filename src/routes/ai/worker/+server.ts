/**
 * @file src/routes/ai/worker/+server.ts
 * @description
 * Serves the LiteRT.js AI Worker script with an isolated Content-Security-Policy.
 *
 * ### Why a Dedicated Route?
 * The AI Worker needs `'wasm-unsafe-eval'` and `worker-src 'self'` to:
 * 1. Compile WebAssembly modules (LiteRT.js WASM runtime ~15MB)
 * 2. Load model files via Web Workers (OffscreenCanvas for image decode)
 *
 * By serving the Worker from this dedicated endpoint with its own CSP, the
 * **admin page's security headers are NEVER modified**. The Worker runs in
 * a fully isolated context:
 * - NO DOM access (can't XSS the admin page)
 * - NO cookie / storage access (can't steal sessions)
 * - CSP only as permissive as this endpoint allows
 *
 * ### Security
 * This endpoint adds `'wasm-unsafe-eval'` which is MORE restrictive than
 * `'unsafe-eval'` — it ONLY enables WASM compilation, NOT JavaScript eval().
 * CSP Level 3 specifies this as a security best practice for applications
 * that legitimately use WebAssembly.
 *
 * ### Features:
 * - serves the compiled Worker JavaScript with isolated CSP
 * - provides a `/_health` endpoint for Worker health checks
 * - ready for WASM file serving in future iterations
 */

import type { RequestHandler } from "@sveltejs/kit";
import { dev } from "$app/environment";

// ─── CSP for the AI Worker ──────────────────────────────────────────────────

/**
 * Relaxed CSP that allows WASM compilation and Worker creation.
 *
 * Only applies to the Worker script response — NOT the admin page.
 * This is the **only** place in the codebase where `'wasm-unsafe-eval'`
 * is configured, and it's scoped to a single, isolated endpoint.
 */
const AI_WORKER_CSP = [
  "default-src 'self'",
  // WASM compilation only — strictly more restrictive than 'unsafe-eval'
  "script-src 'self' 'wasm-unsafe-eval'",
  // Allow Worker creation for OffscreenCanvas processing
  "worker-src 'self' blob:",
  // Required for LiteRT.js WASM multi-threading (future use)
  // Not yet active — kept as documentation for when XNNPACK threadpool is used
  // "require-trusted-types-for 'script'",
].join("; ");

/** Cache header for the Worker script (immutable in production, no-cache in dev). */
const CACHE_HEADER = dev
  ? "no-cache, no-store, must-revalidate"
  : "public, max-age=31536000, immutable";

// ─── Handlers ───────────────────────────────────────────────────────────────

/**
 * GET /ai/worker — serves the compiled AI Worker JavaScript.
 *
 * The Worker script is resolved via Vite's import meta URL pattern
 * (runtime.ts uses `new URL("./ai.worker.ts", import.meta.url)`).
 * In production, Vite emits it as a separate chunk with a content hash.
 *
 * This handler wraps it with the isolated CSP headers.
 */
export const GET: RequestHandler = async ({ fetch, url }) => {
  // Health check endpoint for Worker connectivity
  if (url.searchParams.has("_health")) {
    return new Response(JSON.stringify({ status: "ok", worker: true }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  // In production, the worker JS is resolved through Vite's build output.
  // We use SvelteKit's fetch to resolve the path through the asset pipeline.
  const workerPath = url.pathname;

  try {
    // Fetch the worker script through SvelteKit's internal fetch
    const response = await fetch(workerPath);

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          error: "AI Worker script not found",
          path: workerPath,
          buildHint: "Run `bun run build` to compile the Worker script",
        }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        },
      );
    }

    const script = await response.text();

    // Serve with isolated CSP — only applies to this Worker, not the admin page
    return new Response(script, {
      status: 200,
      headers: {
        "Content-Type": "application/javascript; charset=utf-8",
        "Content-Security-Policy": AI_WORKER_CSP,
        "Cache-Control": CACHE_HEADER,
        "Cross-Origin-Resource-Policy": "cross-origin",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch {
    return new Response(
      JSON.stringify({
        error: "Failed to resolve AI Worker script",
        hint: "Ensure the worker is included in the Vite build graph",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      },
    );
  }
};

/**
 * HEAD /ai/worker — same as GET but without the body.
 */
export const HEAD: RequestHandler = async ({ fetch, url }) => {
  const response = await GET({ fetch, url } as any);
  return new Response(null, {
    status: response.status,
    headers: response.headers,
  });
};
