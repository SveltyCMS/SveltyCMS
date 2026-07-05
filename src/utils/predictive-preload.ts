/**
 * @file src/utils/predictive-preload.ts
 * @description Multi-strategy predictive preloading system for SveltyCMS.
 *
 * Four strategies (sv-router inspired, SveltyCMS-enhanced):
 *
 * 1. `hover`    — Preload on mouseenter (150ms delay, faster than 600ms default)
 * 2. `viewport` — Preload when link enters viewport (IntersectionObserver, 200px margin)
 * 3. `predict`  — Physics-based cone: uses PointerEvent.getPredictedEvents() to preload
 *                  links the cursor is heading toward BEFORE arrival (200px, 30° cone)
 * 4. `smart`    — SveltyCMS exclusive: combines physics prediction with behavioral
 *                  learning data. Links to hot collections/entries get preloaded first
 *                  even when multiple links are in the prediction cone.
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

// ─── Constants ─────────────────────────────────────────────────────────────

const CONE_LENGTH = 200;
const CONE_ANGLE = Math.PI / 6;
const THROTTLE_MS = 50;
const HOVER_DELAY_MS = 150;
const PRELOAD_DEDUP_MS = 30_000;
const VIEWPORT_MARGIN = "200px";

// ─── State ─────────────────────────────────────────────────────────────────

const _links = new Set<HTMLAnchorElement>();
const _predicted = new Set<HTMLAnchorElement>();
const _smartLinks = new Map<HTMLAnchorElement, number>(); // link → priority score
let _throttle: ReturnType<typeof setTimeout> | null = null;
const _hoverTimers = new Map<HTMLAnchorElement, ReturnType<typeof setTimeout>>();
let _observer: IntersectionObserver | null = null;
let _mutations: MutationObserver | null = null;
let _started = false;

// ─── Preload ───────────────────────────────────────────────────────────────

function preload(link: HTMLAnchorElement): void {
  const href = link.getAttribute("href");
  if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;

  const prev = (link as any).__sveltyPreloaded as number;
  if (prev && Date.now() - prev < PRELOAD_DEDUP_MS) return;
  (link as any).__sveltyPreloaded = Date.now();

  // Tap SvelteKit's internal prefetch
  try {
    (link as any).__sveltekit_preload?.();
  } catch {
    // Fallback: dispatch custom event for framework-agnostic consumers
    link.dispatchEvent(
      new CustomEvent("svelty-preload", {
        bubbles: true,
        detail: {
          href,
          pathname: new URL(link.href, location.origin).pathname,
        },
      }),
    );
  }
}

// ─── Strategy: Smart (Physics + Behavioral Learning) ───────────────────────

let _hotPaths: Set<string> | null = null;

async function getHotPaths(): Promise<Set<string>> {
  if (_hotPaths) return _hotPaths;
  try {
    const res = await fetch("/api/system/hot-collections");
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        _hotPaths = new Set(json.data);
      }
    }
  } catch {
    // Fallback to empty set
  }
  if (!_hotPaths) {
    _hotPaths = new Set();
  }
  return _hotPaths;
}

function smartPreload(links: HTMLAnchorElement[]): void {
  // Preload all links in the prediction cone, but hot-path links first
  getHotPaths().then((hotPaths) => {
    const scored = links.map((link) => {
      const pathname = new URL(link.href, location.origin).pathname;
      const parts = pathname.split("/").filter(Boolean);
      // Extract collection ID from path: /en/posts/123 → posts
      const collectionId = parts.length >= 2 ? parts[1] : parts[0];
      const isHot = hotPaths.has(collectionId);
      const priority = isHot ? 2 : 1; // Hot collections get double priority
      return { link, priority };
    });

    // Sort by priority (hot first), then preload all
    scored.sort((a, b) => b.priority - a.priority);
    for (const { link } of scored) {
      preload(link);
    }
    _smartLinks.clear();
  });
}

// ─── Strategy: Predictive Cone ─────────────────────────────────────────────

function pointerMove(event: PointerEvent): void {
  if (_throttle) return;
  _throttle = setTimeout(() => {
    _throttle = null;
  }, THROTTLE_MS);

  if (_predicted.size === 0 && _smartLinks.size === 0) {
    document.removeEventListener("pointermove", pointerMove);
    return;
  }

  const predicted = event.getPredictedEvents?.();
  if (!predicted || predicted.length < 2) return;

  const last = predicted[predicted.length - 1];
  const dx = last.clientX - event.clientX;
  const dy = last.clientY - event.clientY;
  const dist = Math.hypot(dx, dy);
  if (dist < 2) return;

  const cursorAngle = Math.atan2(dy / dist, dx / dist);
  const smartHits: HTMLAnchorElement[] = [];
  const predictHits: HTMLAnchorElement[] = [];

  for (const link of new Set([..._predicted, ..._smartLinks.keys()])) {
    if (!link.isConnected) {
      _predicted.delete(link);
      _smartLinks.delete(link);
      continue;
    }
    const rect = link.getBoundingClientRect();
    const points = [
      { x: rect.left, y: rect.top },
      { x: rect.right, y: rect.top },
      { x: rect.left, y: rect.bottom },
      { x: rect.right, y: rect.bottom },
      { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
    ];

    for (const p of points) {
      const td = Math.hypot(p.x - event.clientX, p.y - event.clientY);
      if (td > CONE_LENGTH || td < 0.001) continue;
      let a = Math.abs(Math.atan2(p.y - event.clientY, p.x - event.clientX) - cursorAngle);
      if (a > Math.PI) a = 2 * Math.PI - a;
      if (a <= CONE_ANGLE) {
        if (_smartLinks.has(link)) {
          smartHits.push(link);
          _smartLinks.delete(link);
        } else {
          predictHits.push(link);
          _predicted.delete(link);
        }
        break;
      }
    }
  }

  // Preload regular predict links immediately
  for (const link of predictHits) preload(link);
  // Smart links get priority-ordered preloading
  if (smartHits.length > 0) smartPreload(smartHits);
}

// ─── Strategy: Viewport ────────────────────────────────────────────────────

function viewportObserver(): IntersectionObserver {
  if (!_observer) {
    _observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            _observer!.unobserve(e.target);
            preload(e.target as HTMLAnchorElement);
          }
        }
      },
      { rootMargin: VIEWPORT_MARGIN },
    );
  }
  return _observer;
}

// ─── Strategy: Hover ───────────────────────────────────────────────────────

function attachHover(link: HTMLAnchorElement): void {
  link.addEventListener("mouseenter", () => {
    const t = _hoverTimers.get(link);
    if (t) clearTimeout(t);
    _hoverTimers.set(
      link,
      setTimeout(() => {
        _hoverTimers.delete(link);
        preload(link);
      }, HOVER_DELAY_MS),
    );
  });
  link.addEventListener("mouseleave", () => {
    const t = _hoverTimers.get(link);
    if (t) {
      clearTimeout(t);
      _hoverTimers.delete(link);
    }
  });
  link.addEventListener("focus", () => preload(link), { once: true });
}

// ─── DOM Observer ──────────────────────────────────────────────────────────

let _scanQueued = false;

function scan(): void {
  if (_scanQueued) return;
  _scanQueued = true;
  requestAnimationFrame(() => {
    _scanQueued = false;
    const links = document.querySelectorAll<HTMLAnchorElement>("a[data-preload]");
    for (const link of links) {
      if (_links.has(link)) continue;
      _links.add(link);
      const s = link.dataset.preload || "hover";

      switch (s) {
        case "smart": {
          if (_smartLinks.size === 0 && _predicted.size === 0) {
            document.addEventListener("pointermove", pointerMove);
          }
          _smartLinks.set(link, 0);
          attachHover(link); // fallback
          break;
        }
        case "predict": {
          if (_predicted.size === 0 && _smartLinks.size === 0) {
            document.addEventListener("pointermove", pointerMove);
          }
          _predicted.add(link);
          attachHover(link); // fallback
          break;
        }
        case "viewport":
          viewportObserver().observe(link);
          break;
        case "hover":
        case "":
        case "true":
          attachHover(link);
          break;
        default:
          console.warn(`[Preload] Unknown strategy "${s}". Use: hover, viewport, predict, smart`);
          attachHover(link);
      }
    }
  });
}

// ─── Public API ────────────────────────────────────────────────────────────

export function initPredictivePreload(): void {
  if (!browser || _started) return;
  _started = true;

  _mutations = new MutationObserver(() => scan());
  _mutations.observe(document.body, { subtree: true, childList: true });
  scan();
}

export function preloadUrl(url: string): void {
  if (!browser) return;
  const a = document.createElement("a");
  a.href = url;
  preload(a);
}

export function destroyPredictivePreload(): void {
  document.removeEventListener("pointermove", pointerMove);
  _observer?.disconnect();
  _observer = null;
  _mutations?.disconnect();
  _mutations = null;
  _links.clear();
  _predicted.clear();
  _smartLinks.clear();
  for (const t of _hoverTimers.values()) clearTimeout(t);
  _hoverTimers.clear();
  _hotPaths = null;
  _started = false;
}
