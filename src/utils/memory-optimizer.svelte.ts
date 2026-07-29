/**
 * @file src/utils/memory-optimizer.svelte.ts
 * @description Memory-efficient utilities with automatic cleanup
 *
 * ### Hardening (audit 2026-07):
 * - Shared global IntersectionObserver: 1 observer for all lazy images (was 1 per image)
 * - FinalizationRegistry: auto-removes dead WeakRef objects from weak subscriber set
 * - Native Set replaces SvelteSet: no reactive tracking overhead for callback collections
 * - untrack wrappers: prevent subscriber/debounce side-effects from leaking into reactive graph
 * - set value guard: skips notify when value is identical (prevents thrashing)
 * - Fixed $effect cleanup: explicit return () => {} instead of passing stop directly
 *
 * Features:
 * - WeakRef-aware store with native GC cleanup
 * - Debounced/throttled effects with untrack boundaries
 * - Resource manager for cleanup functions
 * - Shared lazy image loader with global IntersectionObserver
 */

import { logger } from "@utils/logger";
import { untrack } from "svelte";

/**
 * Memory-efficient store with WeakRef support and native GC cleanup.
 */
export function createMemoryEfficientStore<T>(initial: T) {
  let value = $state(initial);

  // Native Sets — no reactive tracking overhead for subscriber callbacks
  const strong = new Set<(v: T) => void>();
  const weak = new Set<WeakRef<(v: T) => void>>();

  // FinalizationRegistry actively removes dead WeakRef objects from the Set
  const registry =
    typeof FinalizationRegistry !== "undefined"
      ? new FinalizationRegistry<WeakRef<(v: T) => void>>((ref) => weak.delete(ref))
      : null;

  const notify = () => {
    // Isolate execution so subscriber side-effects don't bleed into caller's reactive context
    untrack(() => {
      for (const cb of strong) {
        cb(value);
      }

      for (const ref of weak) {
        const cb = ref.deref();
        if (cb) {
          cb(value);
        } else {
          weak.delete(ref); // Fallback cleanup if registry hasn't fired yet
        }
      }
    });
  };

  return {
    get value() {
      return value;
    },
    set value(v: T) {
      if (value === v) return;
      value = v;
      notify();
    },
    set(v: T) {
      if (value === v) return;
      value = v;
      notify();
    },
    subscribe(cb: (v: T) => void, useWeakRef = false) {
      if (useWeakRef && typeof WeakRef !== "undefined") {
        const ref = new WeakRef(cb);
        weak.add(ref);
        registry?.register(cb, ref, ref);
        return () => {
          weak.delete(ref);
          registry?.unregister(ref);
        };
      }

      strong.add(cb);
      return () => strong.delete(cb);
    },
    clear() {
      strong.clear();
      weak.clear();
    },
  };
}

/**
 * Debounced effect — wraps callback in untrack to prevent infinite loops.
 */
export function debouncedEffect(fn: () => void, deps: () => unknown, delay = 300) {
  let id: ReturnType<typeof setTimeout>;

  $effect(() => {
    deps(); // Register reactive dependencies

    clearTimeout(id);

    // untrack(fn) ensures state reads inside the callback don't re-trigger the effect
    id = setTimeout(() => untrack(fn), delay);

    return () => clearTimeout(id);
  });
}

/**
 * Throttled effect — limits callback execution to at most once per `delay` ms.
 */
export function throttledEffect(fn: () => void, deps: () => unknown, delay = 100) {
  let last = 0;
  let id: ReturnType<typeof setTimeout> | null = null;

  $effect(() => {
    deps();

    const now = Date.now();
    const remaining = delay - (now - last);

    if (remaining <= 0) {
      last = now;
      untrack(fn);
    } else if (!id) {
      id = setTimeout(() => {
        last = Date.now();
        id = null;
        untrack(fn);
      }, remaining);
    }

    return () => {
      if (id) {
        clearTimeout(id);
        id = null;
      }
    };
  });
}

/**
 * Resource cleanup manager — collects cleanup functions and runs them on demand.
 */
export function resourceManager() {
  const cleanups = new Set<() => void>();

  return {
    add(cleanup: () => void) {
      cleanups.add(cleanup);
      return () => cleanups.delete(cleanup);
    },
    clear() {
      for (const fn of cleanups) {
        try {
          fn();
        } catch (e) {
          logger.warn("Cleanup error:", e);
        }
      }
      cleanups.clear();
    },
  };
}

// ─── Shared Lazy Image Infrastructure ───

let globalImageObserver: IntersectionObserver | null = null;
const lazyImageCallbacks = new WeakMap<Element, () => void>();

function getGlobalImageObserver() {
  if (!globalImageObserver && typeof window !== "undefined") {
    globalImageObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          const cb = lazyImageCallbacks.get(entry.target);
          if (cb) {
            cb();
            globalImageObserver?.unobserve(entry.target);
            lazyImageCallbacks.delete(entry.target);
          }
        }
      }
    });
  }
  return globalImageObserver;
}

/**
 * Lazy image loader — uses a single shared IntersectionObserver for all images.
 */
export function lazyImage(src: string, placeholder = "") {
  let current = $state(placeholder);
  let loaded = $state(false);
  let failed = $state(false);
  let targetEl: Element | null = null;

  const triggerLoad = () => {
    const img = new Image();
    img.onload = () => {
      current = src;
      loaded = true;
    };
    img.onerror = () => {
      failed = true;
    };
    img.src = src;
  };

  $effect(() => {
    return () => {
      // Auto-cleanup if the component unmounts before intersecting
      if (targetEl) {
        getGlobalImageObserver()?.unobserve(targetEl);
        lazyImageCallbacks.delete(targetEl);
      }
    };
  });

  return {
    get src() {
      return current;
    },
    get loaded() {
      return loaded;
    },
    get error() {
      return failed;
    },
    observe(el: Element) {
      targetEl = el;
      lazyImageCallbacks.set(el, triggerLoad);
      getGlobalImageObserver()?.observe(el);
    },
  };
}
