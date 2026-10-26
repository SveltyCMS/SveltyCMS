/**
 * @file tests/unit/mocks/$app/navigation.ts
 * @description Runner-agnostic `$app/navigation` mock with SvelteKit 3 hook semantics.
 *
 * The unit suites run under both Vitest and Bun; `mockFn` picks the runner's mock
 * factory. Besides the plain router functions, this module emulates the hook
 * pipeline closely enough to exercise page-level guards:
 *
 * - `beforeNavigate` handlers run first and may `cancel()` the navigation.
 * - `onNavigate` handlers run only when the navigation actually proceeds
 *   (SvelteKit 3 semantics — a cancelled guard never reaches them).
 * - `afterNavigate` handlers run last, once the destination is current.
 *
 * `goto()` drives that same pipeline, so a page that resumes a cancelled
 * destination through `goto` is observed exactly like a router navigation.
 *
 * ### Features:
 * - hook registration with unsubscribe
 * - cancellation short-circuits on/after hooks
 * - deterministic test helpers to simulate navigation and reset hooks
 */

// Runner-agnostic mock helper
const mockFn = (fn?: any) => {
  // Use global mock if available (from bun-preload.ts)
  if ((globalThis as any).mock) return (globalThis as any).mock(fn);
  // Fallback to vitest vi if available
  if (typeof (globalThis as any).vi !== "undefined") return (globalThis as any).vi.fn(fn);
  // Simple fallback
  return fn || (() => {});
};

export interface MockNavigationTarget {
  url: URL;
  route: { id: string | null };
}

export type MockNavigationType = "enter" | "goto" | "link" | "popstate" | "leave";

export interface MockNavigation {
  from: MockNavigationTarget | null;
  to: MockNavigationTarget | null;
  type: MockNavigationType;
  willUnload: boolean;
  delta: number;
  complete: Promise<void>;
}

export type BeforeNavigateHandler = (
  navigation: MockNavigation & { cancel: () => void },
) => void | Promise<void>;
export type NavigateHandler = (navigation: MockNavigation) => void | Promise<void>;

const beforeHandlers = new Set<BeforeNavigateHandler>();
const onHandlers = new Set<NavigateHandler>();
const afterHandlers = new Set<NavigateHandler>();

const START_URL = "http://localhost/";
let currentUrl: URL = new URL(START_URL);
let currentRouteId: string | null = null;

function subscribe<T>(handlers: Set<T>, handler: T): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

function routeIdFor(url: URL): string {
  return url.pathname;
}

function toUrl(target: string | URL): URL {
  return target instanceof URL ? new URL(target.href) : new URL(target, currentUrl.href);
}

/**
 * Run the hook pipeline for a navigation.
 *
 * @returns `true` when the navigation proceeded, `false` when a guard cancelled
 * it (or the navigation unloads the document, which cannot be resumed).
 */
async function dispatchNavigation(
  target: string | URL,
  type: MockNavigationType = "goto",
  willUnload = false,
  delta = 0,
): Promise<boolean> {
  const to = toUrl(target);
  const navigation: MockNavigation = {
    from: { url: currentUrl, route: { id: currentRouteId } },
    to: { url: to, route: { id: routeIdFor(to) } },
    type,
    willUnload,
    delta,
    complete: Promise.resolve(),
  };

  let cancelled = false;
  for (const handler of Array.from(beforeHandlers)) {
    await handler({ ...navigation, cancel: () => (cancelled = true) });
  }

  if (cancelled || willUnload) return false;

  for (const handler of Array.from(onHandlers)) {
    await handler(navigation);
  }

  currentUrl = to;
  currentRouteId = navigation.to?.route.id ?? null;

  for (const handler of Array.from(afterHandlers)) {
    await handler(navigation);
  }

  return true;
}

export const goto = mockFn(async (url: string | URL) => {
  await dispatchNavigation(url, "goto");
});

export const invalidate = mockFn(() => Promise.resolve());
export const invalidateAll = mockFn(() => Promise.resolve());
export const refreshAll = mockFn(() => Promise.resolve());
export const preloadData = mockFn(() => Promise.resolve());
export const preloadCode = mockFn(() => Promise.resolve());
export const pushState = mockFn();
export const replaceState = mockFn();

export const beforeNavigate = mockFn((handler: BeforeNavigateHandler) =>
  subscribe(beforeHandlers, handler),
);
export const onNavigate = mockFn((handler: NavigateHandler) => subscribe(onHandlers, handler));
export const afterNavigate = mockFn((handler: NavigateHandler) =>
  subscribe(afterHandlers, handler),
);

export const applyAction = mockFn(() => Promise.resolve());
export const deserialize = mockFn((v: any) => {
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
});

/**
 * Test helper: simulate a router navigation (as a link click would) and report
 * whether it proceeded. `beforeNavigate` handlers may cancel it; `onNavigate`
 * and `afterNavigate` only run when it was not cancelled.
 */
export async function __navigateForTest(
  target: string | URL,
  options: { willUnload?: boolean; type?: MockNavigationType; delta?: number } = {},
): Promise<boolean> {
  return dispatchNavigation(
    target,
    options.type ?? "link",
    options.willUnload ?? false,
    options.delta ?? 0,
  );
}

/** Test helper: drop every registered hook and reset the simulated location. */
export function __resetNavigationForTest(): void {
  beforeHandlers.clear();
  onHandlers.clear();
  afterHandlers.clear();
  currentUrl = new URL(START_URL);
  currentRouteId = null;
}
