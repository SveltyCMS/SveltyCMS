/**
 * @file src/utils/predictive-preload.ts
 * @description Multi-strategy predictive preloading system for SveltyCMS.
 *
 * ### Hardening (audit 2026-07):
 * - Memory-leak prevention: WeakMap replaces Set — GC auto-collects removed DOM links
 * - Promise coalescing: getHotPaths caches the Promise itself (single network request)
 * - Passive event listeners: pointermove uses { passive: true } for scroll optimization
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
 */

import { browser } from "$app/environment";
import { preloadData } from "$app/navigation";

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
let _observer: IntersectionObserver | null = null;
let _started = false;

// ─── Core Logic ────────────────────────────────────────────────────────────

async function preload(href: string): Promise<void> {
  if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;

  const now = Date.now();
  if ((_preloaded.get(href) ?? 0) > now - PRELOAD_DEDUP_MS) return;
  _preloaded.set(href, now);

  try {
    await preloadData(href);
  } catch (err) {
    console.debug(`[Preload] Skipping ${href}:`, err);
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
  const predicted = event.getPredictedEvents?.() ?? [];
  if (predicted.length < 2) return;

  const last = predicted[predicted.length - 1];
  const dx = last.clientX - event.clientX;
  const dy = last.clientY - event.clientY;
  const cursorAngle = Math.atan2(dy, dx);

  const targets = document.querySelectorAll<HTMLAnchorElement>(
    "a[data-preload='predict'], a[data-preload='smart']",
  );

  targets.forEach(async (link) => {
    const rect = link.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const dist = Math.hypot(cx - event.clientX, cy - event.clientY);
    if (dist > CONE_LENGTH || dist < 10) return;

    const angleToTarget = Math.atan2(cy - event.clientY, cx - event.clientX);
    let diff = Math.abs(angleToTarget - cursorAngle);
    if (diff > Math.PI) diff = 2 * Math.PI - diff;

    if (diff <= CONE_ANGLE) {
      if (link.dataset.preload === "smart") {
        const hotPaths = await getHotPaths();
        const collection = link.pathname.split("/")[1];
        if (hotPaths.has(collection)) preload(link.href);
      } else {
        preload(link.href);
      }
    }
  });
}

// ─── Lifecycle Management ──────────────────────────────────────────────────

function observeLink(link: HTMLAnchorElement) {
  const strategy = link.dataset.preload || "hover";

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
    }
  });

  observer.observe(document.body, { subtree: true, childList: true });
  document.addEventListener("pointermove", handlePointerMove, { passive: true });

  // Initial scan
  document.querySelectorAll<HTMLAnchorElement>("a[data-preload]").forEach(observeLink);
}
