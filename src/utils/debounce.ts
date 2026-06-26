/**
 * @file src/utils/debounce.ts
 * @description Debounce utilities — delays function execution until after a quiet period.
 *
 * Features:
 * - `debounce(delay)` — returns a scheduler that delays the last call
 * - `debounce.create(fn, delay)` — wraps a typed function with debounce
 */

/**
 * Returns a debounced wrapper that delays `fn` by `delay` ms.
 * If `immediate` is true, the first call fires synchronously.
 */
export function debounce(delay = 300, immediate = false) {
  let timer: NodeJS.Timeout | undefined;
  let hasExecuted = false;

  return (fn: () => void) => {
    const shouldExecuteImmediately = immediate && !hasExecuted;

    if (shouldExecuteImmediately) {
      fn();
      hasExecuted = true;
      return;
    }

    clearTimeout(timer);
    timer = setTimeout(() => {
      fn();
    }, delay);
  };
}

/**
 * Traditional debounce factory — wraps a typed function and delays invocation.
 */
debounce.create = <T extends (...args: unknown[]) => unknown>(
  func: T,
  wait = 300,
): ((...args: Parameters<T>) => void) => {
  let timeout: ReturnType<typeof setTimeout>;

  return function executedFunction(...args: Parameters<T>) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
};
