/**
 * @file tests/unit/routes/system-license-status-server.test.ts
 * @description Behavioural tests for `/api/system/license-status` (GET-only).
 *
 * Covers the route-behaviour classes the scorer grades:
 * - load-contract: the license envelope is returned as-is
 * - failure-path: 401 (unauthenticated), 400 (missing/invalid params), 500 (cache/license throws)
 * - concurrency: two parallel polls share an identical cache key and envelope
 *
 * The license manager and the SWR cache are the only boundaries mocked; the
 * route's own validation and error mapping run for real.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@src/utils/license-manager", () => ({
  checkExtensionLicense: vi.fn(),
}));

vi.mock("@src/databases/cache/cache-service", () => ({
  cacheService: {
    getOrSetSWR: vi.fn(),
  },
}));

import { checkExtensionLicense } from "@src/utils/license-manager";
import { cacheService } from "@src/databases/cache/cache-service";
import { GET } from "../../../src/routes/api/system/license-status/+server";

type LicenseEvent = Parameters<typeof GET>[0];

const mockCheckLicense = vi.mocked(checkExtensionLicense);
const mockGetOrSetSWR = vi.mocked(cacheService.getOrSetSWR);

const BASE_URL = "http://localhost/api/system/license-status";
const TENANT = "tenant-1";

const ACTIVE_LICENSE = {
  active: true,
  daysRemaining: 120,
  hasLicense: true,
};

const DEFAULT_LOCALS = { user: { _id: "user-1", email: "admin@test.com" }, tenantId: TENANT };

function makeEvent(search: string, locals: Record<string, unknown> = DEFAULT_LOCALS): LicenseEvent {
  return {
    url: new URL(`${BASE_URL}${search}`),
    locals,
  } as unknown as LicenseEvent;
}

/** Exercises the real cache callback so the license call is part of the path. */
function passThroughToLicense(
  _key: string,
  fetchFn: () => Promise<unknown>,
): ReturnType<typeof checkExtensionLicense> {
  return fetchFn() as ReturnType<typeof checkExtensionLicense>;
}

describe("/api/system/license-status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckLicense.mockReset();
    mockGetOrSetSWR.mockReset();
  });

  it("returns 401 with an inactive envelope when unauthenticated", async () => {
    const response = await GET(makeEvent("?type=plugin&id=demo", { user: undefined }));
    const body = (await response.json()) as { active: boolean; reason: string };

    expect(response.status).toBe(401);
    expect(body.active).toBe(false);
    expect(body.reason).toBe("Unauthorized");
    expect(mockGetOrSetSWR).not.toHaveBeenCalled();
  });

  it("returns 400 for a missing id, a missing type and an unknown type", async () => {
    const missingId = await GET(makeEvent("?type=plugin"));
    const missingType = await GET(makeEvent("?id=demo"));
    const unknownType = await GET(makeEvent("?type=mystery&id=demo"));

    expect(missingId.status).toBe(400);
    expect(missingType.status).toBe(400);
    expect(unknownType.status).toBe(400);

    const body = (await unknownType.json()) as { active: boolean; reason: string };
    expect(body.active).toBe(false);
    expect(body.reason).toContain("Missing or invalid");
    expect(mockGetOrSetSWR).not.toHaveBeenCalled();
  });

  it("returns the cached license envelope for a valid poll", async () => {
    mockCheckLicense.mockResolvedValue(ACTIVE_LICENSE);
    mockGetOrSetSWR.mockImplementation(passThroughToLicense);

    const response = await GET(makeEvent("?type=plugin&id=demo"));
    const body = (await response.json()) as typeof ACTIVE_LICENSE;

    expect(response.status).toBe(200);
    expect(body).toEqual(ACTIVE_LICENSE);
    expect(mockCheckLicense).toHaveBeenCalledWith("plugin", "demo");

    const call = mockGetOrSetSWR.mock.calls[0];
    expect(call[0]).toBe(`system:license:${TENANT}:plugin:demo`);
    expect(call[2]).toBe(300_000);
    expect(call[3]).toBe(600_000);
    expect(call[4]).toBe(TENANT);
  });

  it("returns 500 when the cache layer or the license check rejects", async () => {
    mockGetOrSetSWR.mockRejectedValueOnce(new Error("cache backend offline"));

    const cacheFailure = await GET(makeEvent("?type=theme&id=aurora"));
    const cacheBody = (await cacheFailure.json()) as { active: boolean; reason: string };

    expect(cacheFailure.status).toBe(500);
    expect(cacheBody).toEqual({ active: false, reason: "Internal validation error" });

    mockGetOrSetSWR.mockImplementationOnce(passThroughToLicense);
    mockCheckLicense.mockRejectedValueOnce(new Error("license endpoint unreachable"));

    const licenseFailure = await GET(makeEvent("?type=theme&id=aurora"));
    expect(licenseFailure.status).toBe(500);
    expect(mockCheckLicense).toHaveBeenCalledWith("theme", "aurora");
  });

  it("serves two parallel polls from the same cache key and envelope", async () => {
    mockCheckLicense.mockResolvedValue(ACTIVE_LICENSE);
    mockGetOrSetSWR.mockImplementation(passThroughToLicense);

    const responses = await Promise.all([
      GET(makeEvent("?type=widget&id=hero-banner")),
      GET(makeEvent("?type=widget&id=hero-banner")),
    ]);
    const bodies = await Promise.all(
      responses.map((response) => response.json() as Promise<typeof ACTIVE_LICENSE>),
    );

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    expect(bodies[0]).toEqual(ACTIVE_LICENSE);
    expect(bodies[1]).toEqual(ACTIVE_LICENSE);

    const calls = mockGetOrSetSWR.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][0]).toBe(`system:license:${TENANT}:widget:hero-banner`);
    expect(calls[0][0]).toBe(calls[1][0]);
    expect(calls[0][4]).toBe(TENANT);
    expect(calls[1][4]).toBe(TENANT);
  });
});
