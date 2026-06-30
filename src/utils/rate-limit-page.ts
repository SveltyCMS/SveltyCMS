/**
 * @file src/utils/rate-limit-page.ts
 * @description Renders a professional 429 Too Many Requests HTML page, styled consistently
 * with +error.svelte. Used by rate-limiting hooks to return user-friendly pages.
 *
 * ### Features:
 * - Dark-themed error page matching SveltyCMS design language
 * - Displays retry-after countdown (auto-refreshing via meta tag)
 * - WCAG 2.2 AA compliant (semantic HTML, ARIA labels, skip-to-content)
 * - Respects prefers-reduced-motion
 */

interface RateLimitPageOptions {
  /** Human-readable retry duration (e.g. "60 seconds") */
  retryAfter: string;
  /** Seconds until retry (used for meta refresh) */
  retryAfterSeconds: number;
  /** Current request path (shown to user for context) */
  pathname?: string;
  /** Reason override (default: "Too Many Requests") */
  reason?: string;
  /** Site name for the title */
  siteName?: string;
}

export function renderRateLimitPage(options: RateLimitPageOptions): string {
  const {
    retryAfter,
    retryAfterSeconds,
    pathname = "/",
    reason = "Too Many Requests",
    siteName = "SveltyCMS",
  } = options;

  const displayPath = pathname.length > 60 ? pathname.slice(0, 57) + "..." : pathname;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta http-equiv="refresh" content="${retryAfterSeconds}" />
<title>429 — ${reason} | ${siteName}</title>
<style>
  *, ::before, ::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { -webkit-text-size-adjust: 100%; tab-size: 4; }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    line-height: 1.5;
    background: linear-gradient(to top, #0f172a, #1e293b, #0f172a);
    color: #fff;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 1rem;
  }
  .sr-only {
    position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px;
    overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0;
  }
  .skip-link:focus {
    position: fixed; top: 1rem; inset-inline-start: 1rem; z-index: 50;
    width: auto; height: auto; padding: 0.5rem 1rem; clip: auto;
    background: #fff; color: #0f172a; border-radius: 0.5rem;
    outline: 2px solid #ef4444; outline-offset: 2px;
  }
  .container {
    display: flex; flex-direction: column; align-items: center;
    gap: 1.5rem; text-align: center; max-width: 36rem;
  }
  .status {
    font-size: clamp(6rem, 15vw, 9rem);
    font-weight: 800;
    letter-spacing: 0.05em;
    line-height: 1;
    color: #fbbf24;
    position: relative;
  }
  .badge {
    display: inline-block;
    background: rgb(220 38 38 / 0.85);
    padding: 0.5rem 1rem;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 600;
    box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.3);
  }
  .badge span { display: block; }
  .badge .path {
    max-width: 18rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 0.75rem;
    opacity: 0.8;
  }
  .message {
    font-size: clamp(1.25rem, 3vw, 2rem);
    font-weight: 700;
    color: #e2e8f0;
  }
  .hint {
    font-size: 1rem;
    color: #94a3b8;
  }
  .countdown {
    display: inline-flex; align-items: center; gap: 0.5rem;
    background: rgb(30 41 59 / 0.8);
    padding: 0.75rem 1.25rem;
    border-radius: 9999px;
    font-size: 0.875rem;
    color: #fbbf24;
    border: 1px solid rgb(251 191 36 / 0.3);
  }
  .countdown svg { width: 1.25rem; height: 1.25rem; flex-shrink: 0; }
  .actions {
    display: flex; flex-wrap: wrap; gap: 1rem; justify-content: center; margin-top: 0.5rem;
  }
  .btn {
    display: inline-flex; align-items: center; gap: 0.5rem;
    padding: 0.75rem 1.5rem;
    border-radius: 9999px;
    font-weight: 700;
    text-transform: uppercase;
    font-size: 0.875rem;
    text-decoration: none;
    transition: transform 0.15s, box-shadow 0.15s;
    cursor: pointer;
  }
  .btn:hover { transform: scale(1.05); }
  .btn:focus-visible { outline: 2px solid #ef4444; outline-offset: 2px; }
  .btn-primary {
    background: linear-gradient(to bottom right, #b91c1c, #dc2626, #b91c1c);
    color: #fff;
    box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.4);
  }
  .btn-outline {
    background: transparent;
    color: #e2e8f0;
    border: 2px solid #64748b;
  }
  .btn-outline:hover { border-color: #fff; background: rgb(255 255 255 / 0.1); }
  @media (prefers-reduced-motion: reduce) {
    .btn { transition: none; }
  }
  @media (prefers-contrast: high) {
    body { background: #000; }
    .status { color: #ff0; }
    .badge { background: #f00; color: #fff; }
  }
</style>
</head>
<body>
  <a href="#main" class="sr-only skip-link">Skip to content</a>
  <main id="main" class="container" role="alert" aria-live="assertive">
    <h1 class="status" aria-label="Error 429">429</h1>
    <div class="badge" aria-label="Error details">
      <span class="path">${escapeHtml(displayPath)}</span>
      <span>${escapeHtml(reason)}</span>
    </div>
    <p class="message">Slow down — you&rsquo;re sending requests too quickly.</p>
    <p class="hint">This page will automatically refresh when the rate limit resets.</p>
    <div class="countdown">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <span>Retry after ${escapeHtml(retryAfter)}</span>
    </div>
    <div class="actions">
      <a href="/" class="btn btn-primary">
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
        Go Home
      </a>
      <button onclick="window.history.back()" class="btn btn-outline">
        <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Go Back
      </button>
    </div>
  </main>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
