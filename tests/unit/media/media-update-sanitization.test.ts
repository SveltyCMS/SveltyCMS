/**
 * @file tests/unit/media/media-update-sanitization.test.ts
 * @description Regression tests for media PATCH mass-assignment hardening.
 *
 * The client may only write the explicit media update allowlist. Managed
 * columns (`tenantId`, `_id`, ownership/timestamps, storage coordinates) must
 * never reach the adapter, while editorial metadata keeps working.
 */

import { describe, it, expect, vi } from "vitest";
import {
  MEDIA_UPDATE_FIELDS,
  MediaService,
  sanitizeMediaUpdatePayload,
} from "@src/utils/media/media-service.server";
import type { IDBAdapter } from "@src/databases/db-interface";
import type { DatabaseId } from "@src/content/types";

describe("sanitizeMediaUpdatePayload", () => {
  it("keeps only allowlisted top-level fields", () => {
    expect(MEDIA_UPDATE_FIELDS).toEqual(
      expect.arrayContaining(["alt", "caption", "tags", "metadata"]),
    );

    const payload = sanitizeMediaUpdatePayload({
      alt: "A",
      caption: "C",
      tags: ["t1", "t2"],
      metadata: { alt: "nested", focalPoint: { x: 20, y: 80 } },
    });

    expect(payload).toEqual({
      alt: "A",
      caption: "C",
      tags: ["t1", "t2"],
      metadata: { alt: "nested", focalPoint: { x: 20, y: 80 } },
    });
  });

  it("round-trips server-owned processing state without accepting invented values", () => {
    expect(
      sanitizeMediaUpdatePayload({
        metadata: { name: "renamed", processingStatus: "ready", processingError: "boom" },
      }),
    ).toEqual({
      metadata: { name: "renamed", processingStatus: "ready", processingError: "boom" },
    });
    expect(sanitizeMediaUpdatePayload({ metadata: { processingStatus: "admin" } })).toEqual({
      metadata: {},
    });
  });

  it("strips tenant, identity, ownership and storage columns", () => {
    const payload = sanitizeMediaUpdatePayload({
      tenantId: "tenant-B",
      _id: "forged-id",
      uploadedBy: "attacker",
      createdBy: "attacker",
      createdAt: "2000-01-01T00:00:00.000Z",
      updatedAt: "2000-01-01T00:00:00.000Z",
      storagePath: "/etc/passwd",
      url: "https://evil.example/x.jpg",
      size: 123,
      mimeType: "text/html",
      hash: "forged-hash",
      isDeleted: true,
      path: "../../etc/passwd",
      bucket: "other-bucket",
      provider: "s3",
      alt: "A",
    });

    expect(payload).toEqual({ alt: "A" });
  });

  it("drops prototype-pollution keys at every depth", () => {
    const raw = JSON.parse(
      '{"alt":"ok","__proto__":{"polluted":true},"metadata":{"alt":"nested","constructor":{"prototype":{"polluted":true}}}}',
    ) as Record<string, unknown>;

    const payload = sanitizeMediaUpdatePayload(raw);

    expect(payload).toEqual({ alt: "ok", metadata: { alt: "nested" } });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("rejects unknown nested metadata keys with a 400", () => {
    try {
      sanitizeMediaUpdatePayload({ metadata: { alt: "ok", tenantId: "tenant-B" } });
      throw new Error("expected sanitizeMediaUpdatePayload to throw");
    } catch (err) {
      expect(err).toMatchObject({
        status: 400,
        code: "INVALID_MEDIA_METADATA_FIELD",
      });
    }
  });

  it("rejects a non-object payload", () => {
    expect(() => sanitizeMediaUpdatePayload("nope")).toThrow();
    expect(() => sanitizeMediaUpdatePayload({ metadata: [] })).toThrow();
  });
});

describe("MediaService.updateMedia tenant scope", () => {
  it("passes the ambient tenantId as an adapter option and drops body tenant identity", async () => {
    const update = vi.fn().mockResolvedValue({ success: true, data: {} });
    const db = { crud: { update } } as unknown as IDBAdapter;
    const service = new MediaService(db);

    await service.updateMedia(
      "media-1",
      {
        tenantId: "tenant-B",
        _id: "forged-id",
        uploadedBy: "attacker",
        createdBy: "attacker",
        storagePath: "/etc/passwd",
        url: "https://evil.example/x.jpg",
        path: "../../etc/passwd",
        alt: "A",
      },
      "tenant-A" as DatabaseId,
    );

    expect(update).toHaveBeenCalledWith("media", "media-1", { alt: "A" }, { tenantId: "tenant-A" });
  });

  it("lets internal maintenance writes patch managed columns", async () => {
    const update = vi.fn().mockResolvedValue({ success: true, data: {} });
    const db = { crud: { update } } as unknown as IDBAdapter;
    const service = new MediaService(db);

    await service.updateMedia(
      "media-1",
      { hash: "new", path: "tenant-a/x.jpg", size: 10, updatedBy: "u1", tenantId: "tenant-B" },
      "tenant-A" as DatabaseId,
      { internal: true },
    );

    expect(update).toHaveBeenCalledWith(
      "media",
      "media-1",
      { hash: "new", path: "tenant-a/x.jpg", size: 10, updatedBy: "u1" },
      { tenantId: "tenant-A" },
    );
  });
});
