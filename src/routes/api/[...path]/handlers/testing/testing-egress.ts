/**
 * @file src/routes/api/[...path]/handlers/testing/testing-egress.ts
 * @description Test-only egress allowlist registration for local fixture peers.
 *
 * The production SSRF guard blocks loopback by design. A zero-mock E2E that
 * exercises remote-URL ingestion needs the app server to reach a fixture the
 * test started on 127.0.0.1, so the test registers the exact origin it owns.
 *
 * Security: `allowTestEgressOrigin()` itself refuses to run unless
 * TEST_MODE/PLAYWRIGHT_TEST is enabled, and this whole handler is behind the
 * fail-closed `/api/testing` gate (and stripped from production builds). The
 * guard is widened for one exact origin — never globally, and never in prod.
 */

import { AppError } from "@utils/error-handling";
import { rawResponse, type TestingContext } from "./testing-shared";

const ORIGIN_PATTERN = /^https?:\/\/[^/\s]+$/i;

export async function handleTestingEgressRoutes({ action, params }: TestingContext) {
  if (action !== "allow-egress-origin") return undefined;

  const origin = typeof params.origin === "string" ? params.origin.trim() : "";
  if (!ORIGIN_PATTERN.test(origin)) {
    throw new AppError("origin must be a scheme, host and optional port (no path)", 400);
  }

  const { allowTestEgressOrigin } = await import("@src/utils/egress-guard");
  // Throws unless TEST_MODE/PLAYWRIGHT_TEST is active.
  allowTestEgressOrigin(origin);

  return rawResponse({ success: true, origin });
}
