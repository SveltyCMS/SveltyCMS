/**
 * @file tests/unit/components/dom/mocks/optional-zstd.ts
 * @description Stub for `@mongodb-js/zstd`, an optional native peer of the MongoDB driver.
 *
 * `src/hooks/handle-compression.ts` imports it lazily behind a try/catch so a host
 * without the binding falls back to another encoder. Vite still has to resolve the
 * literal specifier when a component's import graph reaches `@utils/error-handling`,
 * and the binding is not installed in every checkout — hence this inert module.
 */

export function compress(): Promise<Uint8Array> {
  return Promise.reject(new Error("zstd is not available in the DOM test suite"));
}

export default { compress };
