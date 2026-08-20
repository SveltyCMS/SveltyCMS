/**
 * @file src/services/sdk/namespaces/collections/lazy-services.ts
 * @description
 * Lazy module singletons for the collections namespace.
 *
 * The write path (schedulePostWrite → workflow, invalidateCache →
 * response-cache, afterMutation → pub-sub, outbox emission) used a per-write
 * `await import(...)`, which costs 30–60µs per call even for cached modules
 * (measured via local-sdk-vs-direct micro-profile). Each service resolves
 * once on first use via the generic `lazyModule` helper; hot-path calls
 * become promise resolves.
 *
 * ### Features:
 * - memoized dynamic imports (single resolution per process)
 * - self-healing retry on failed resolution (see @src/utils/lazy-module)
 */

import { lazyModule } from "@src/utils/lazy-module";

/** Workflow service — used by post-write workflow initialization (create paths). */
export const getWorkflowServiceLazy = lazyModule(() =>
  import("@src/services/background/workflow-service").then((m) => m.workflowService),
);

/** Response cache — used by tick-debounced L2 invalidation. */
export const getResponseCacheLazy = lazyModule(() =>
  import("@src/services/cache/response-cache").then((m) => m.responseCache),
);

/** Pub/Sub — used by post-write `entryUpdated` broadcasts. */
export const getPubSubLazy = lazyModule(() =>
  import("@src/services/background/pub-sub").then((m) => m.pubSub),
);

/** Outbox service + kill-switch check — used by coalesced outbox emission. */
export const getOutboxLazy = lazyModule(() => import("@src/services/outbox"));

/** Token engine — used by collection list label/description token replacement. */
export const getTokenEngineLazy = lazyModule(() => import("@src/services/token/engine"));

/** History service — used by getRevisions. */
export const getHistoryServiceLazy = lazyModule(
  () => import("@src/services/content/history-service"),
);

/** Database module — used by refresh() to pick up a fresh adapter. */
export const getDbModuleLazy = lazyModule(() => import("@src/databases/db"));
