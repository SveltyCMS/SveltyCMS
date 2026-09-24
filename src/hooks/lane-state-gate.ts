/**
 * @file src/hooks/lane-state-gate.ts
 * @description Operational-state gate shared by every fast lane.
 *
 * A lane answers before `handle`'s pipeline runs, so it never reaches
 * `handle-system-state` — which is the hook that refuses traffic during
 * MAINTENANCE / RECOVERY / FAILED and drives the setup redirect. A lane that
 * skipped that decision would serve normal responses while the operator
 * believes the instance is out of rotation.
 *
 * The gate therefore re-implements exactly the pipeline's own readiness
 * predicate (`isSystemOperationallyReady` in `handle-turbo-pipeline.server.ts`)
 * against the same module-level state mirror the gatekeeper reads — no cache, no
 * async, one `globalThis` lookup.
 *
 * Lives in its own module so the lane entry points and the registry dispatch can
 * each consult it without importing one another (no import cycle).
 *
 * ### Features:
 * - Mirrors the pipeline's READY/WARMED/WARMING/DEGRADED set — one source of truth
 * - Fail-closed: unknown/absent state ⇒ the lane declines, the pipeline decides
 * - Consulted three times per lane request (lane, peer lane, dispatch) on purpose:
 *   the dispatch backstop is what protects a lane that forgets to call it
 */

import { getOverallState } from "@src/stores/system/state.svelte.ts";

/** Served states — the same set `handleTurboPipeline` treats as operational. */
const SERVING_STATES: ReadonlySet<string> = new Set(["READY", "WARMED", "WARMING", "DEGRADED"]);

/**
 * True when the instance may serve lane bytes right now.
 *
 * `SETUP`, `IDLE`, `INITIALIZING`, `MAINTENANCE`, `RECOVERY` and `FAILED` all
 * return false, so those requests go to the full pipeline and get its redirect,
 * 503 or maintenance page instead of a cached-looking 200.
 */
export function isLaneServingAllowed(): boolean {
  return SERVING_STATES.has(getOverallState());
}
