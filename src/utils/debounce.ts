/**
 * @file src/utils/debounce.ts
 * @description Hardened, type-safe debounce utility for Svelte 5.
 *
 * ### Hardening notes:
 * - `this` context preserved via `func.apply(context, args)`
 * - `.cancel()` method prevents memory leaks on component unmount
 * - `timeout = null` after execution for proper GC
 * - Factory-based pattern (namespace `debounce.create`) for tree-shaking
 *
 * ### Usage:
 * ```ts
 * import { debounce } from "@utils/debounce";
 * const save = debounce.create(saveData, 300);
 * // In Svelte cleanup (onMount return / $effect return):
 * save.cancel();
 * ```
 */

/**
 * 🛡️ Hardened: Factory-based debounce with explicit cancellation support.
 */
export const debounce = {
  /**
   * Wraps a function with a delay.
   * Returns a debounced function with a `.cancel()` method to prevent
   * memory leaks on component unmount.
   *
   * @param func  The function to debounce
   * @param wait  Delay in milliseconds (default 300)
   */
  create: <T extends (...args: any[]) => any>(
    func: T,
    wait = 300,
  ): ((...args: Parameters<T>) => void) & { cancel: () => void } => {
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const debounced = function (this: any, ...args: Parameters<T>) {
      if (timeout) clearTimeout(timeout);

      timeout = setTimeout(() => {
        func.apply(this, args);
        timeout = null;
      }, wait);
    };

    debounced.cancel = () => {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
    };

    return debounced;
  },
};
