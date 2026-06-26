/**
 * @file tests/helpers/worker-context.ts
 * @description Re-exports the test worker context from its canonical location in src/utils.
 *
 * The context must live in src/utils because server hooks (handle-test-isolation.ts,
 * handle-authorization.ts) import it at runtime — they cannot import from tests/.
 * This re-export exists so test helpers can also reference it via a clean tests/ path.
 */

export { testWorkerContext } from "@utils/test-worker-context";
