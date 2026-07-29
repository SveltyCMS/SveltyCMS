/**
 * @file src/utils/v8-shim.ts
 * @description Hardened Bun compatibility shim for the Node.js `v8` module.
 *
 * ### Hardening (audit 2026-07):
 * - Symbol-based flagging: non-enumerable, collision-resistant Symbol.for() key
 * - Object.freeze: prevents downstream modules from modifying the shim stub
 * - Defensive error handling: try-catch on getBuiltinModule for hybrid runtimes
 * - Explicit this binding: named function preserves context, avoids Illegal invocation
 *
 * The `bson` npm package (used by `mongodb` driver → Mongoose) calls
 * `v8.startupSnapshot.isBuildingSnapshot()` at module load time. Bun
 * (JavaScriptCore) hasn't implemented this Node.js V8-specific API, so
 * accessing `startupSnapshot` properties throws `NotImplementedError`.
 *
 * This shim patches `process.getBuiltinModule('v8')` to return a safe
 * stub before any downstream module (bson, mongodb, mongoose) loads.
 *
 * ### Usage:
 * Import at the top of any file that may load the MongoDB adapter:
 * ```ts
 * import "@utils/v8-shim";
 * ```
 *
 * This is a no-op when running under Node.js (real `v8` module).
 */

// 🛡️ Use a Symbol key to avoid accidental collision with other global patches
const SHIM_KEY = Symbol.for("__SVELTY_V8_SHIM_APPLIED__");

if (!(globalThis as any)[SHIM_KEY]) {
  (globalThis as any)[SHIM_KEY] = true;

  const processRef = globalThis.process;
  if (processRef && typeof processRef.getBuiltinModule === "function") {
    const origGetBuiltinModule = processRef.getBuiltinModule;

    processRef.getBuiltinModule = function (this: any, name: string) {
      if (name === "v8") {
        // Retrieve existing module if possible, or create a safe base object
        let v8Module: any;
        try {
          v8Module = origGetBuiltinModule.call(this, "v8");
        } catch {
          v8Module = {};
        }

        // Return a frozen object to prevent downstream modification of the shim
        return Object.freeze({
          ...v8Module,
          startupSnapshot: {
            isBuildingSnapshot: () => false,
            addDeserializeCallback: () => {},
          },
        });
      }
      return origGetBuiltinModule.call(this, name);
    };
  }
}
