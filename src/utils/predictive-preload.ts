/**
 * @file src/utils/predictive-preload.ts
 * @description Multi-strategy predictive preloading system for SveltyCMS.
 *
 * ### Hardening (audit 2026-07):
 * - Memory-leak prevention: WeakMap tracks processed links; the predictive set is
 *   pruned lazily (`isConnected`) on each pointer frame so removed DOM nodes drop out
 * - Promise coalescing: getHotPaths caches the Promise itself (single network request)
 * - Passive event listeners: pointermove uses { passive: true } for scroll optimization
 * - rAF-coalesced pointer evaluation: one cone check per frame, not per event
 * - Simplified lifecycle: MutationObserver + WeakMap eliminate manual destroy() calls
 *
 * Four strategies:
 * 1. `hover`    — Preload on mouseenter (150ms delay)
 * 2. `viewport` — Preload when link enters viewport (IntersectionObserver, 200px margin)
 * 3. `predict`  — Physics-based cone: uses PointerEvent.getPredictedEvents() (200px, 30° cone)
 * 4. `smart`    — Physics + behavioral learning: hot collections get priority preloading
 *
 * ### Usage:
 * ```html
 * <a href="/en/posts/123" data-preload="smart">Edit Post 123</a>
 * <a href="/en/posts/456" data-preload="predict">View Post 456</a>
 * <a href="/en/posts/789" data-preload="viewport">Preview Post 789</a>
 * <a href="/dashboard" data-preload="hover">Dashboard</a>
 * ```
 *
 * ### Server prewarm (`/api/system/prewarm-route`)
 * `src/app.html` already sets `data-sveltekit-preload-data="hover"`, so hover /
 * focus / viewport preloads are already made by SvelteKit. Firing the route
 * prewarm for those would be a second request for the same intent, so only the
 * predictive cone (the one signal SvelteKit cannot observe) warms the route.
 */

import { logger } from "@utils/logger";
import { browser } from "$app/env";
import { preloadData } from "$app/navigation";
import { shouldSkipPreload } from "./connection-detector";

// ─── Constants ─────────────────────────────────────────────────────────────

const CONE_LENGTH = 200;
const CONE_ANGLE = Math.PI / 6;
const PRELOAD_DEDUP_MS = 30_000;
const VIEWPORT_MARGIN = "200px";

// ─── State ─────────────────────────────────────────────────────────────────

const _trackedLinks = new WeakMap<
  HTMLAnchorElement,
  { strategy: string; timer?: ReturnType<typeof setTimeout> }
>();
const _preloaded = new Map<string, number>(); // href → timestamp
const MAX_PRELOADED = 50;
// Predictive-strategy links, populated by observeLink (initial scan + MutationObserver).
// Iterating this Set replaces a `document.querySelectorAll` on every pointermove.
const _predictiveLinks = new Set<HTMLAnchorElement>();
let _observer: IntersectionObserver | null = null;
let _pointerRaf = 0;
let _pendingPointer: PointerEvent | null = null;
let _started = false;

// ─── Core Logic ────────────────────────────────────────────────────────────

async function preload(href: string, options: { prewarm?: boolean } = {}): Promise<void> {
  // 🛡️ NETWORK CONSTRAINTS: respect Save-Data header, slow cellular connections, or offline state
  if (shouldSkipPreload()) return;

  // 🛡️ HARDENING: reject any URI-scheme link (case-insensitive) — `javascript:`, `data:`, `vbscript:`, etc.
  // Only same-origin relative or absolute http(s) URLs are preloadable.
  if (!href) return;
  const trimmed = href.trim();
  if (trimmed.startsWith("#")) return;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)) {
    if (!/^https?:/i.test(trimmed)) return;
  }

  const now = Date.now();
  if ((_preloaded.get(href) ?? 0) > now - PRELOAD_DEDUP_MS) return;
  _preloaded.set(href, now);
  // Bound the dedup map — Map preserves insertion order, so the first key is the
  // oldest. Without this, every visited href would live for the whole session.
  if (_preloaded.size > MAX_PRELOADED) {
    const oldest = _preloaded.keys().next().value;
    if (oldest !== undefined) _preloaded.delete(oldest);
  }

  try {
    // Server-side route cache pre-warm — predictive cone only (see file header).
    // Fire-and-forget: the navigation itself must never wait on it.
    if (options.prewarm) {
      fetch(`/api/system/prewarm-route?path=${encodeURIComponent(href)}`).catch(() => {});
    }
    await preloadData(href);
  } catch (err) {
    logger.debug(`[Preload] Skipping ${href}:`, err);
  }
}

// ─── Strategy: Smart (Physics + Behavioral) ──────────────────────────────

let _hotPaths: Promise<Set<string>> | null = null;

function getHotPaths(): Promise<Set<string>> {
  if (!_hotPaths) {
    _hotPaths = fetch("/api/system/hot-collections")
      .then((r) => r.json())
      .then((j) => new Set<string>(j.success && Array.isArray(j.data) ? (j.data as string[]) : []))
      .catch(() => new Set<string>());
  }
  return _hotPaths!;
}

// ─── Strategy: Predictive Cone ─────────────────────────────────────────────

function handlePointerMove(event: PointerEvent): void {
  _pendingPointer = event;
  if (_pointerRaf) return;
  // Coalesce bursts of pointermove events into one cone evaluation per frame.
  _pointerRaf = requestAnimationFrame(() => {
    _pointerRaf = 0;
    const pending = _pendingPointer;
    _pendingPointer = null;
    if (pending) evaluatePredictiveCone(pending);
  });
}

function evaluatePredictiveCone(event: PointerEvent): void {
  const predicted = event.getPredictedEvents?.() ?? [];
  if (predicted.length < 2) return;

  const last = predicted[predicted.length - 1];
  const dx = last.clientX - event.clientX;
  const dy = last.clientY - event.clientY;
  const cursorAngle = Math.atan2(dy, dx);

  for (const link of _predictiveLinks) {
    // Prune nodes removed from the document since they were observed.
    if (!link.isConnected) {
      _predictiveLinks.delete(link);
      continue;
    }

    const rect = link.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const dist = Math.hypot(cx - event.clientX, cy - event.clientY);
    if (dist > CONE_LENGTH || dist < 10) continue;

    const angleToTarget = Math.atan2(cy - event.clientY, cx - event.clientX);
    let diff = Math.abs(angleToTarget - cursorAngle);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;
    if (diff > CONE_ANGLE) continue;

    if (link.dataset.preload === "smart") {
      void (async () => {
        const hotPaths = await getHotPaths();
        const collection = link.pathname.split("/")[1];
        if (hotPaths.has(collection)) void preload(link.href, { prewarm: true });
      })();
    } else {
      void preload(link.href, { prewarm: true });
    }
  }
}

// ─── Lifecycle Management ──────────────────────────────────────────────────

function observeLink(link: HTMLAnchorElement) {
  const strategy = link.dataset.preload || "hover";

  // Feed the pointer-cone evaluator without re-querying the DOM per frame.
  if (strategy === "predict" || strategy === "smart") {
    _predictiveLinks.add(link);
  }

  // Cleanup previous listeners if link is re-processed
  if (_trackedLinks.has(link)) return;

  if (strategy === "viewport") {
    _observer ??= new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) preload((e.target as HTMLAnchorElement).href);
        });
      },
      { rootMargin: VIEWPORT_MARGIN },
    );
    _observer.observe(link);
  } else if (strategy === "hover" || strategy === "smart" || strategy === "predict") {
    // Hover / focus are already preloaded by SvelteKit
    // (`data-sveltekit-preload-data="hover"` on `<body>`), so no server prewarm
    // here — only the pointer-path cone asks the server to warm the route.
    const timer = setTimeout(() => {
      link.addEventListener("mouseenter", () => preload(link.href), { once: true });
      link.addEventListener("focus", () => preload(link.href), { once: true });
    }, 0);
    _trackedLinks.set(link, { strategy, timer });
  }
}

export function initPredictivePreload(): void {
  if (!browser || _started) return;
  _started = true;

  // Use a MutationObserver to handle dynamically injected content
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      m.addedNodes.forEach((node) => {
        if (node instanceof HTMLAnchorElement && node.hasAttribute("data-preload"))
          observeLink(node);
      });
      m.removedNodes.forEach((node) => {
        if (node instanceof HTMLAnchorElement) _predictiveLinks.delete(node);
      });
    }
  });

  observer.observe(document.body, { subtree: true, childList: true });
  document.addEventListener("pointermove", handlePointerMove, { passive: true });

  // Initial scan
  document.querySelectorAll<HTMLAnchorElement>("a[data-preload]").forEach(observeLink);
}
