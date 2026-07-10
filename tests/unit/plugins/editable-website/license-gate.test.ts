/**
 * @file tests/unit/plugins/editable-website/license-gate.test.ts
 * @description License gate for Editable Website Live Preview bridge (not CMS saves).
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  collectionHasLivePreview,
  EDITABLE_WEBSITE_PLUGIN_ID,
} from "@src/plugins/editable-website/license-gate";

const licenseMock = vi.fn();

vi.mock("@src/utils/license-manager", () => ({
  checkExtensionLicense: (...args: unknown[]) => licenseMock(...args),
}));

describe("editable-website license gate", () => {
  beforeEach(() => {
    licenseMock.mockReset();
  });

  it("detects livePreview on string patterns and boolean true", () => {
    expect(collectionHasLivePreview(true)).toBe(true);
    expect(collectionHasLivePreview("/{slug}?lang={lang}")).toBe(true);
    expect(collectionHasLivePreview("")).toBe(false);
    expect(collectionHasLivePreview(undefined)).toBe(false);
  });

  it("requireEditableWebsiteLicense throws 403 when inactive", async () => {
    licenseMock.mockResolvedValue({ active: false, daysRemaining: 0, hasLicense: false });
    const { requireEditableWebsiteLicense } =
      await import("@src/plugins/editable-website/license-gate.server");

    await expect(requireEditableWebsiteLicense()).rejects.toMatchObject({ status: 403 });
    expect(licenseMock).toHaveBeenCalledWith("plugin", EDITABLE_WEBSITE_PLUGIN_ID);
  });

  it("requireEditableWebsiteLicense passes when trial or license is active", async () => {
    licenseMock.mockResolvedValue({ active: true, daysRemaining: 10, hasLicense: false });
    const { requireEditableWebsiteLicense } =
      await import("@src/plugins/editable-website/license-gate.server");

    const status = await requireEditableWebsiteLicense();
    expect(status.active).toBe(true);
  });
});
