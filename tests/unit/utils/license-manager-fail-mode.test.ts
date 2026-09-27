/**
 * @file tests/unit/utils/license-manager-fail-mode.test.ts
 * @description Fail-open (with key) vs fail-closed (no key) on marketplace errors.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getPrivateSettingSync = vi.fn();

vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: (...args: unknown[]) => getPrivateSettingSync(...args),
  getPublicSettingSync: vi.fn(() => undefined),
}));

const FAIL_OPEN: LicenseStatusShape = {
  active: true,
  daysRemaining: null,
  hasLicense: true,
};

interface LicenseStatusShape {
  active: boolean;
  daysRemaining: number | null;
  hasLicense: boolean;
}

/** Point `getPrivateSettingSync` at a master license key. */
function withMasterKey(key = "test-master-key") {
  getPrivateSettingSync.mockImplementation((setting: string) =>
    setting === "LICENSE_KEY" ? key : undefined,
  );
}

describe("checkExtensionLicense fail modes", () => {
  beforeEach(() => {
    vi.resetModules(); // the license cache and in-flight map are module singletons
    getPrivateSettingSync.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("fails closed when marketplace is down and no license key is configured", async () => {
    getPrivateSettingSync.mockReturnValue(undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("marketplace unreachable");
      }),
    );

    const { checkExtensionLicense } = await import("@utils/license-manager");
    const status = await checkExtensionLicense("plugin", "pagespeed");

    expect(status.active).toBe(false);
    expect(status.hasLicense).toBe(false);
  });

  it("fails open when marketplace is down but a license key is present", async () => {
    withMasterKey();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("marketplace unreachable");
      }),
    );

    const { checkExtensionLicense } = await import("@utils/license-manager");
    const status = await checkExtensionLicense("plugin", "pagespeed");

    // A marketplace outage must not brick a paid install. (The previous assertion —
    // `status` is an object — also passed when the manager wrongly failed closed.)
    expect(status).toEqual(FAIL_OPEN);
  });

  it("does not fail open when the marketplace answers but rejects the key", async () => {
    withMasterKey("revoked-key");
    const fetchMock = vi.fn(async () => ({
      status: 200,
      ok: true,
      json: async () => ({ valid: false }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const { checkExtensionLicense } = await import("@utils/license-manager");
    const status = await checkExtensionLicense("plugin", "pagespeed");

    // A reachable marketplace that says "invalid" is not an outage: fail-open is
    // reserved for transport failures, so a revoked key must not stay licensed.
    expect(fetchMock).toHaveBeenCalled();
    expect(status.active).toBe(false);
    expect(status.hasLicense).toBe(false);
  });
});
