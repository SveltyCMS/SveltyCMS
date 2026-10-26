/**
 * @file tests/e2e/helpers/hydration.ts
 * @description Interaction helpers that close the SSR-paint → hydration gap.
 *
 * SvelteKit renders the page on the server, so every element exists before
 * Svelte attaches its listeners. An event issued in that window is a silent
 * no-op — a `select` change that never navigates, a `fill` that never sets the
 * dirty flag, a response awaited instead of the rendered result. Locator
 * auto-waiting cannot see this: the element is attached and visible, it is
 * simply not wired yet (three separate flakes in one day came from this).
 *
 * `html[data-hydrated="true"]` is set by `src/routes/+layout.svelte`'s
 * `onMount` -> `hydration.markHydrated()`, which only runs after the
 * synchronous SSR hydration walk — so it is the truthful "listeners exist now"
 * signal. The attribute name is owned by `src/stores/hydration.svelte.ts`
 * (`HYDRATION_ATTRIBUTE`); it is mirrored here as `HYDRATION_ATTRIBUTE` so a
 * rename breaks one constant, not every spec. (`waitForHydration` in
 * `tests/e2e/helpers/auth.ts` waits for the same marker one-shot.)
 *
 * These helpers retry through Playwright's `expect.toPass` budget. They never
 * sleep and never widen a locator's auto-wait; each one fails with a message
 * naming the interaction that never took effect.
 *
 * Usage:
 *   await selectAndWaitForUrl(page, picker, "email", /group=email/);
 *   await fillUntil(page, input, "121", () => expect(save).toBeEnabled());
 *   await runAfterHydration(page, () => page.getByTestId("save").click());
 */

import { expect, type Locator, type Page } from "@playwright/test";

/**
 * The root layout flips this attribute after the hydration walk completes.
 * Must match `HYDRATION_ATTRIBUTE` in `src/stores/hydration.svelte.ts`.
 */
export const HYDRATION_ATTRIBUTE = "data-hydrated";

/** Selector form used by `waitFor`/`locator`. */
export const HYDRATION_SELECTOR = `html[${HYDRATION_ATTRIBUTE}='true']`;

/** Where the marker is published — quoted in every failure message. */
const HYDRATION_PUBLISHER = "src/routes/+layout.svelte";

/** Default budget for hydration + retries (matches the settings spec's). */
const DEFAULT_TIMEOUT = 20_000;

/** Escalating retry cadence — it is a retry schedule, not a sleep. */
const DEFAULT_INTERVALS = [500, 1_000, 2_000];

/** Timeout for a single inner assertion inside one `toPass` attempt. */
const DEFAULT_ASSERT_TIMEOUT = 2_000;

export interface HydrationOptions {
  /** Extra element (string selector or Locator) that must be attached first. */
  selector?: string | Locator;
  /** Total budget for the hydration wait and the retries. */
  timeout?: number;
  /** Retry intervals handed to `expect.toPass`. */
  intervals?: number[];
}

export interface SelectHydrationOptions extends HydrationOptions {
  /** Timeout for the URL assertion inside one attempt. */
  urlTimeout?: number;
}

function describeTarget(target: string | Locator): string {
  if (typeof target === "string") return target;
  try {
    return target.toString();
  } catch {
    return "the target locator";
  }
}

function describePattern(pattern: string | RegExp): string {
  return typeof pattern === "string" ? `"${pattern}"` : pattern.toString();
}

function asLocator(page: Page, target: string | Locator): Locator {
  return typeof target === "string" ? page.locator(target) : target;
}

/**
 * Wait until Svelte has hydrated the page (and, optionally, until an extra
 * element is attached). Throws a message that distinguishes the two misses:
 * "the app never became interactive" vs "hydration finished, the element never
 * rendered".
 */
async function waitForHydrationSignal(page: Page, options: HydrationOptions): Promise<void> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;

  try {
    await page.locator(HYDRATION_SELECTOR).waitFor({ state: "attached", timeout });
  } catch (err) {
    // Loud by design: a bare TimeoutError hides the one thing worth knowing —
    // which attribute never appeared and which file is supposed to publish it.
    throw new Error(
      `"${HYDRATION_ATTRIBUTE}" was never set to "true" on <html> within ${timeout}ms — ` +
        `published by ${HYDRATION_PUBLISHER} (onMount -> hydration.markHydrated()), attribute ` +
        `name owned by HYDRATION_ATTRIBUTE in src/stores/hydration.svelte.ts; if it was ` +
        `renamed, update that constant AND HYDRATION_ATTRIBUTE in this file. Until it is set, ` +
        `every listener in the tree is still unwired, so the interaction would have been a ` +
        `silent no-op. Check the trace for a client-side error thrown before the root ` +
        `layout's onMount.`,
      { cause: err },
    );
  }

  if (options.selector === undefined) return;

  try {
    await asLocator(page, options.selector).waitFor({ state: "attached", timeout });
  } catch (err) {
    throw new Error(
      `Hydrated, but ${describeTarget(options.selector)} never attached within ${timeout}ms.`,
      { cause: err },
    );
  }
}

/**
 * Wait for the hydration marker alone (no action), failing with the message that
 * names the attribute and its publisher.
 *
 * This is the single loud wait for the marker: `waitForHydration()` in
 * `tests/e2e/helpers/auth.ts` delegates here, so both names report the same
 * diagnosis instead of a bare TimeoutError.
 */
export async function waitForHydrationMarker(page: Page, timeout = DEFAULT_TIMEOUT): Promise<void> {
  await waitForHydrationSignal(page, { timeout });
}

/**
 * Wait for hydration, then run `action`.
 *
 * Use this for a one-shot interaction (click, type, upload) whose handler only
 * exists after hydration. Returns whatever `action` returns.
 */
export async function runAfterHydration<T>(
  page: Page,
  action: () => Promise<T>,
  options: HydrationOptions = {},
): Promise<T> {
  await waitForHydrationSignal(page, options);
  return await action();
}

/**
 * Select `value` in `select` and retry the `change` dispatch until the page URL
 * matches `urlPattern`.
 *
 * `selectOption` already fires `input`/`change`, so the first attempt normally
 * wins; the re-dispatch repairs an attempt that raced the hydration walk. Fails
 * with the selected value, the select's locator, and the expected URL pattern.
 */
export async function selectAndWaitForUrl(
  page: Page,
  select: Locator,
  value: string,
  urlPattern: string | RegExp,
  options: SelectHydrationOptions = {},
): Promise<void> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const urlTimeout = options.urlTimeout ?? DEFAULT_ASSERT_TIMEOUT;

  await waitForHydrationSignal(page, options);
  await select.selectOption(value);

  try {
    await expect(async () => {
      await select.dispatchEvent("change");
      await expect(page).toHaveURL(urlPattern, { timeout: urlTimeout });
    }).toPass({ timeout, intervals: options.intervals ?? DEFAULT_INTERVALS });
  } catch (err) {
    throw new Error(
      `Selected "${value}" in ${describeTarget(select)}, but the URL never matched ` +
        `${describePattern(urlPattern)} within ${timeout}ms. The change handler is attached on ` +
        `hydration, so the event was dropped or the selection no longer triggers navigation.`,
      { cause: err },
    );
  }
}

/**
 * Fill `locator` with `value` and retry until `assertion` passes.
 *
 * For bindings that derive state from `input` events (dirty flags, validation,
 * live preview): a fill that lands before hydration never reaches the binding,
 * and the value stays stale in the component even though the DOM shows it.
 * Each attempt re-fills, so the retry is idempotent.
 */
export async function fillUntil(
  page: Page,
  locator: Locator,
  value: string,
  assertion: () => Promise<unknown>,
  options: HydrationOptions = {},
): Promise<void> {
  const timeout = options.timeout ?? DEFAULT_TIMEOUT;

  await waitForHydrationSignal(page, options);

  try {
    await expect(async () => {
      await locator.fill(value);
      await assertion();
    }).toPass({ timeout, intervals: options.intervals ?? DEFAULT_INTERVALS });
  } catch (err) {
    throw new Error(
      `Filling ${describeTarget(locator)} with "${value}" never satisfied the assertion within ` +
        `${timeout}ms — the hydrated input binding (dirty/validation state) did not update.`,
      { cause: err },
    );
  }
}
