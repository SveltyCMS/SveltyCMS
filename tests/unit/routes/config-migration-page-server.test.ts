/**
 * @file tests/unit/routes/config-migration-page-server.test.ts
 * @description Legacy `/config/migration` route must permanently redirect to the
 * smart-importer plugin page slot instead of rendering an in-app wizard.
 */

import { describe, it, expect } from "vitest";

import { load } from "../../../src/routes/(app)/config/migration/+page.server";

const event = {} as unknown as Parameters<typeof load>[0];

describe("config/migration +page.server", () => {
  it("permanently redirects to the smart-importer plugin page (load-contract)", async () => {
    // `load` throws synchronously, so wrap it to get a rejected promise.
    await expect(async () => load(event)).rejects.toMatchObject({
      status: 301,
      location: "/config?plugin=smart-importer",
    });
  });

  it("no longer loops back to the removed in-app wizard route (failure-path)", async () => {
    const redirectError = (await Promise.resolve()
      .then(() => load(event))
      .catch((err: unknown) => err)) as {
      status?: number;
      location?: string;
    };

    expect(redirectError.status).toBe(301);
    expect(redirectError.location).not.toBe("/config/migration");
    expect(redirectError.location).toContain("plugin=smart-importer");
  });
});
