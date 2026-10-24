/**
 * @file tests/unit/routes/share-page-server.test.ts
 * @description Public share-link load contract.
 *
 * Covers the capability model of `/share/[token]?id=…`:
 * - a password-protected link is flagged for the landing page (`passwordRequired`)
 * - both the API field (`expiresAt`) and the legacy field (`expiry`) expire a link
 * - a request that resolves a tenant cannot open another tenant's media
 * - a tenantless request (bare domain) may, because the token is the capability
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const { findOne } = vi.hoisted(() => ({ findOne: vi.fn() }));

vi.mock("@src/databases/db", () => ({
  getDbSafe: vi.fn(async () => ({ crud: { findOne } })),
}));

import { load } from "../../../src/routes/share/[token]/+page.server";
import type { DatabaseId, ISODateString } from "@src/content/types";

const MEDIA_ID = "media_share_1" as DatabaseId;
const TOKEN = "share-token-abc";

interface SharedLinkFixture {
  active?: boolean;
  expiresAt?: string;
  expiry?: string;
  passwordHash?: string;
  token: string;
}

interface MediaFixture {
  _id: DatabaseId;
  createdAt: ISODateString;
  filename: string;
  metadata: { sharedLinks: SharedLinkFixture[] };
  mimeType: string;
  size: number;
  tenantId?: DatabaseId | null;
  type?: string;
  url?: string;
}

function mediaFixture(
  links: SharedLinkFixture[],
  overrides: Partial<MediaFixture> = {},
): MediaFixture {
  const now = new Date().toISOString() as ISODateString;
  return {
    _id: MEDIA_ID,
    createdAt: now,
    filename: "quarterly-report.pdf",
    metadata: { sharedLinks: links },
    mimeType: "application/pdf",
    size: 4096,
    tenantId: null,
    type: "document",
    url: "/files/quarterly-report.pdf",
    ...overrides,
  };
}

function loadEvent(id: string | null, tenantId: DatabaseId | null = null) {
  const url = new URL(`http://localhost/share/${TOKEN}`);
  if (id !== null) url.searchParams.set("id", id);
  return {
    params: { token: TOKEN },
    url,
    locals: { tenantId },
  } as unknown as Parameters<typeof load>[0];
}

describe("share page server load", () => {
  beforeEach(() => {
    findOne.mockReset();
  });

  it("flags a password-protected link so the page renders the unlock form", async () => {
    findOne.mockResolvedValue({
      success: true,
      data: mediaFixture([
        { token: TOKEN, passwordHash: "scrypt$00112233445566778899aabbccddeeff$deadbeef" },
      ]),
    });

    const data = await load(loadEvent(String(MEDIA_ID)));

    expect(data).toMatchObject({
      token: TOKEN,
      mediaId: String(MEDIA_ID),
      filename: "quarterly-report.pdf",
      size: 4096,
      type: "document",
      mimeType: "application/pdf",
      passwordRequired: true,
    });
    // The capability lookup must work without a tenant and must not widen the
    // page payload with the stored hash/tenant.
    expect(data).not.toHaveProperty("passwordHash");
    expect(findOne).toHaveBeenCalledOnce();
    const query = findOne.mock.calls[0]?.[1] as { _id?: unknown } | undefined;
    const options = findOne.mock.calls[0]?.[2] as
      | { systemScope?: { kind?: string; reason?: string } }
      | undefined;
    expect(query?._id).toBe(MEDIA_ID);
    expect(options?.systemScope).toMatchObject({ kind: "system", reason: "bootstrap" });
  });

  it("leaves links without a password hash downloadable", async () => {
    findOne.mockResolvedValue({ success: true, data: mediaFixture([{ token: TOKEN }]) });

    const data = await load(loadEvent(String(MEDIA_ID)));

    expect(data).toMatchObject({ passwordRequired: false });
  });

  it("expires a link that stores the API field `expiresAt`", async () => {
    findOne.mockResolvedValue({
      success: true,
      data: mediaFixture([
        { token: TOKEN, expiresAt: new Date(Date.now() - 60_000).toISOString() },
      ]),
    });

    await expect(load(loadEvent(String(MEDIA_ID)))).rejects.toMatchObject({ status: 410 });
  });

  it("expires a link that stores the legacy field `expiry`", async () => {
    findOne.mockResolvedValue({
      success: true,
      data: mediaFixture([{ token: TOKEN, expiry: new Date(Date.now() - 60_000).toISOString() }]),
    });

    await expect(load(loadEvent(String(MEDIA_ID)))).rejects.toMatchObject({ status: 410 });
  });

  it("rejects a cross-tenant media id when the request resolves a tenant", async () => {
    findOne.mockResolvedValue({
      success: true,
      data: mediaFixture([{ token: TOKEN }], { tenantId: "tenant_b" as DatabaseId }),
    });

    await expect(load(loadEvent(String(MEDIA_ID), "tenant_a" as DatabaseId))).rejects.toMatchObject(
      { status: 404 },
    );
  });

  it("allows the same tenant and tenantless (bare-domain) requests", async () => {
    findOne.mockResolvedValue({
      success: true,
      data: mediaFixture([{ token: TOKEN }], { tenantId: "tenant_a" as DatabaseId }),
    });

    await expect(
      load(loadEvent(String(MEDIA_ID), "tenant_a" as DatabaseId)),
    ).resolves.toMatchObject({ token: TOKEN });

    findOne.mockResolvedValue({
      success: true,
      data: mediaFixture([{ token: TOKEN }], { tenantId: "tenant_a" as DatabaseId }),
    });
    await expect(load(loadEvent(String(MEDIA_ID), null))).resolves.toMatchObject({ token: TOKEN });
  });

  it("rejects revoked and unknown tokens", async () => {
    findOne.mockResolvedValue({
      success: true,
      data: mediaFixture([{ token: TOKEN, active: false }]),
    });
    await expect(load(loadEvent(String(MEDIA_ID)))).rejects.toMatchObject({ status: 404 });

    findOne.mockResolvedValue({
      success: true,
      data: mediaFixture([{ token: "some-other-token" }]),
    });
    await expect(load(loadEvent(String(MEDIA_ID)))).rejects.toMatchObject({ status: 404 });
  });

  it("rejects a request without a media id or an unknown asset", async () => {
    await expect(load(loadEvent(null))).rejects.toMatchObject({ status: 404 });
    expect(findOne).not.toHaveBeenCalled();

    findOne.mockResolvedValue({ success: true, data: null });
    await expect(load(loadEvent(String(MEDIA_ID)))).rejects.toMatchObject({ status: 404 });
  });
});
