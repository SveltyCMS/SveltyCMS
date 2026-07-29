/**
 * @file tests/integration/api/media-jsonpath.test.ts
 * @description
 * Integration: `?jsonPath=` on media gallery load reduces the media payload.
 * Seeds two media rows with distinct metadata.camera values, then asserts the
 * SvelteKit `__data.json` response includes only the matching hash when filtered.
 */

import { beforeAll, describe, expect, it } from "vitest";
import { getApiBaseUrl, safeFetch } from "../helpers/server";
import {
  initializeTestEnvironment,
  prepareAuthenticatedContext,
  testingAction,
} from "../helpers/test-setup";

const API_BASE_URL = getApiBaseUrl();
const TEST_API_SECRET =
  process.env.TEST_API_SECRET ||
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env
    ?.TEST_API_SECRET ||
  "SVELTYCMS_TEST_SECRET_2026";

describe("Media gallery ?jsonPath= load filter", () => {
  let adminCookie: string;
  let matchingHash: string;
  let nonMatchingHash: string;

  beforeAll(async () => {
    await initializeTestEnvironment();
    adminCookie = await prepareAuthenticatedContext();
    expect(adminCookie.length).toBeGreaterThan(0);

    const seeded = await testingAction("seed-media-with-metadata", {});
    expect(seeded.success).toBe(true);
    matchingHash = String(seeded.matchingHash || seeded.items?.[0]?.hash || "");
    nonMatchingHash = String(seeded.nonMatchingHash || seeded.items?.[1]?.hash || "");
    expect(matchingHash.length).toBeGreaterThan(4);
    expect(nonMatchingHash.length).toBeGreaterThan(4);
    expect(matchingHash).not.toBe(nonMatchingHash);
  }, 120_000);

  async function loadGalleryData(jsonPath?: string): Promise<string> {
    const qs = new URLSearchParams({ "x-sveltekit-invalidated": "111" });
    if (jsonPath) qs.set("jsonPath", jsonPath);
    const url = `${API_BASE_URL}/mediagallery/__data.json?${qs.toString()}`;
    const res = await safeFetch(url, {
      headers: {
        Accept: "application/json",
        Cookie: adminCookie,
        "x-test-secret": TEST_API_SECRET,
      },
    });
    expect(res.status, `mediagallery status jsonPath=${jsonPath ?? "(none)"}`).toBe(200);
    return res.text();
  }

  it("unfiltered load includes both seeded media hashes", async () => {
    const body = await loadGalleryData();
    // Redirect would mean session failure — fail loudly
    expect(body).not.toMatch(/"type"\s*:\s*"redirect"/);
    expect(body, "matching hash present without filter").toContain(matchingHash);
    expect(body, "non-matching hash present without filter").toContain(nonMatchingHash);
  });

  it("?jsonPath=metadata.camera = Canon drops the Nikon row", async () => {
    const body = await loadGalleryData("metadata.camera = Canon");
    expect(body).not.toMatch(/"type"\s*:\s*"redirect"/);
    expect(body, "Canon hash kept").toContain(matchingHash);
    expect(body, "Nikon hash filtered out").not.toContain(nonMatchingHash);
    // Echoed filter for client sync
    expect(body).toMatch(/jsonPathFilter|metadata\.camera/i);
  });

  it("non-matching jsonPath yields neither seeded hash when only those two exist in filter", async () => {
    // Filter that matches neither seeded camera value — both should be absent
    // if the only root media are our seeds (or at least our hashes should not appear).
    const body = await loadGalleryData("metadata.camera = Hasselblad-No-Match-XYZ");
    expect(body).not.toMatch(/"type"\s*:\s*"redirect"/);
    expect(body).not.toContain(matchingHash);
    expect(body).not.toContain(nonMatchingHash);
  });
});
