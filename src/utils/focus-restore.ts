/**
 * @file src/utils/focus-restore.ts
 * @description Remember and restore the focused element across timers/navigation.
 *
 * The root layout used to keep the focused element as a CSS selector string
 * (`#${el.id}`) and hand that string to `document.querySelector`. Element ids are
 * NOT selector-safe: the table search input takes its id from its label
 * ("Search..." → id `search...`), schema field ids can start with a digit, and a
 * label can contain `.`, `:`, spaces or quotes. `querySelector('#search...')`
 * throws `SyntaxError: '#search...' is not a valid selector` inside a `setTimeout`
 * callback, so the error is uncaught, the focus restore is skipped and the console
 * fills up (15 pageerrors per E2E shard).
 *
 * A selector built from data is also an injection surface: an id such as
 * `x, body` or `a:has(*)` would silently select unrelated nodes.
 *
 * This module therefore never parses data as CSS. It resolves the remembered
 * element by id lookup (`getElementById`, no selector parsing) or by scanning a
 * fixed node list and comparing attribute VALUES in JS (`getElementsByTagName`
 * with a validated tag name, or the constant `[data-testid]` selector whose
 * result is compared, never interpolated).
 */

/** What the layout remembers about the last focused element. */
export interface FocusSnapshot {
  /** `id` attribute (empty when absent). */
  id: string;
  /** `data-testid` attribute (empty when absent). */
  testId: string;
  /** `name` attribute (empty when absent). */
  name: string;
  /** Lower-case tag name — only used as a lookup scope for `name`. */
  tagName: string;
}

/** Tag names we are willing to pass to `getElementsByTagName` (never data-shaped CSS). */
const SAFE_TAG_NAME = /^[a-z][a-z0-9-]*$/;

/** Constant selector — the `data-testid` attribute is matched by value comparison. */
const TESTID_SCOPE_SELECTOR = "[data-testid]";

/**
 * Snapshot an element so it can be found again later.
 *
 * Returns `null` for anything that is not an element carrying at least one of
 * `id` / `data-testid` / `name` — the caller then simply skips the restore.
 * Duck-typed instead of `instanceof Element` so it is safe to call from code
 * that is also loaded during SSR (no `Element` global there).
 */
export function captureFocusTarget(target: unknown): FocusSnapshot | null {
  if (!target || typeof (target as Element).getAttribute !== "function") return null;

  const el = target as Element;
  const id = typeof el.id === "string" ? el.id : "";
  const testId = el.getAttribute("data-testid") ?? "";
  const name = el.getAttribute("name") ?? "";

  if (!id && !testId && !name) return null;

  return {
    id,
    testId,
    name,
    tagName: (el.tagName ?? "").toLowerCase(),
  };
}

/** First element in `collection` whose `attr` equals `value` exactly. */
function firstWithAttribute(
  collection: ArrayLike<Element>,
  attr: string,
  value: string,
): HTMLElement | null {
  for (let i = 0; i < collection.length; i++) {
    const candidate = collection[i];
    if (candidate && candidate.getAttribute(attr) === value) {
      return candidate as HTMLElement;
    }
  }
  return null;
}

/**
 * Find the remembered element in the current document.
 *
 * Never throws: an element that no longer exists simply resolves to `null`
 * (the same no-op the caller had before, minus the uncaught exception).
 */
export function resolveFocusTarget(
  doc: Document | null | undefined,
  snapshot: FocusSnapshot | null | undefined,
): HTMLElement | null {
  if (!doc || !snapshot) return null;

  // `getElementById` treats the value literally — no CSS parsing at all.
  if (snapshot.id) {
    return doc.getElementById(snapshot.id);
  }

  if (snapshot.testId) {
    return firstWithAttribute(
      doc.querySelectorAll(TESTID_SCOPE_SELECTOR),
      "data-testid",
      snapshot.testId,
    );
  }

  if (snapshot.name) {
    const scope = SAFE_TAG_NAME.test(snapshot.tagName) ? snapshot.tagName : "*";
    return firstWithAttribute(doc.getElementsByTagName(scope), "name", snapshot.name);
  }

  return null;
}

/**
 * Resolve and focus, reporting whether focus actually moved.
 *
 * Wrapped in `try`/`catch` because focus() can throw on detached nodes in some
 * engines; a failed restore must never escape a timer callback.
 */
export function restoreFocus(
  doc: Document | null | undefined,
  snapshot: FocusSnapshot | null | undefined,
): boolean {
  const el = resolveFocusTarget(doc, snapshot);
  if (!el) return false;
  try {
    el.focus();
    return true;
  } catch {
    return false;
  }
}
