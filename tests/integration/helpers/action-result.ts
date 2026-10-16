/**
 * @file tests/integration/helpers/action-result.ts
 * @description
 * Parse a SvelteKit Server Action response body into a plain object.
 *
 * SvelteKit serializes action return values with `devalue`, which JSON-encodes
 * as `[structure, ...values]` where numbers in `structure` are 1-based indices
 * into `values`. A naive `data[1]` read returns the first *value* (e.g. `true`)
 * instead of the recovered object, so every consumer must unmarshal the
 * structure against the trailing value array.
 */

/** Unmarshals a devalue structure against its trailing value array. */
function unmarshal(structure: unknown, values: unknown[]): unknown {
  const resolve = (val: unknown): unknown => {
    if (typeof val === "number") return values[val - 1];
    if (Array.isArray(val)) return val.map(resolve);
    if (val && typeof val === "object") {
      const obj: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(val)) obj[key] = resolve(value);
      return obj;
    }
    return val;
  };
  return resolve(structure);
}

/**
 * Recover the action's return value from a parsed SvelteKit action payload.
 * Returns the raw `data` untouched when it is not a devalue structure or the
 * envelope is not `type: "success"`.
 */
export function parseActionResult(result: { type?: string; data?: unknown }): any {
  if (result?.type === "success" && typeof result.data === "string") {
    try {
      const parsed = JSON.parse(result.data);
      if (Array.isArray(parsed)) {
        const [structure, ...values] = parsed;
        if (structure && typeof structure === "object") return unmarshal(structure, values);
        return values[0]; // primitive return value
      }
    } catch (error) {
      console.warn("[parseActionResult] Failed to parse data:", error);
    }
  }
  return result?.data;
}
