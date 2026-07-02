/**
 * @file src/utils/v8-shim.ts
 * @description Bun compatibility shim for Node.js `v8` module.
 *
 * The `bson` npm package (used by `mongodb` driver → Mongoose) calls
 * `v8.startupSnapshot.isBuildingSnapshot()` at module load time. Bun
 * (JavaScriptCore) hasn't implemented this Node.js V8-specific API, so
 * accessing `startupSnapshot` properties throws `NotImplementedError`.
 *
 * This shim patches `process.getBuiltinModule('v8')` to return a safe
 * stub before any downstream module (bson, mongodb, mongoose) loads.
 *
 * ### Affected Packages:
 * - `bson` → `bson.cjs:2609`: calls `startupSnapshot?.isBuildingSnapshot?.()`
 * - `mongodb` (native driver) → re-exports bson
 * - `mongoose` → wraps mongodb driver
 *
 * ### Usage:
 * Import at the top of any file that may load the MongoDB adapter:
 * ```ts
 * import "@utils/v8-shim";
 * ```
 *
 * This is a no-op when running under Node.js (real `v8` module).
 */

// Apply the shim exactly once
if (!(globalThis as any).__V8_SHIM_APPLIED__) {
  (globalThis as any).__V8_SHIM_APPLIED__ = true;

  const origGetBuiltinModule = globalThis.process?.getBuiltinModule;

  if (origGetBuiltinModule) {
    globalThis.process.getBuiltinModule = (name: string) => {
      if (name === "v8") {
        // Return a safe stub that doesn't throw on startupSnapshot access
        return {
          ...origGetBuiltinModule.call(globalThis.process, "v8"),
          startupSnapshot: {
            isBuildingSnapshot: () => false,
            addDeserializeCallback: () => {},
          },
        };
      }
      return origGetBuiltinModule.call(globalThis.process, name);
    };
  }
}
