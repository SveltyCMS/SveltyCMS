/**
 * @file tests/unit/media/direct-upload.test.ts
 * @description Direct-to-storage instruction primitives: staging-key scoping,
 * ownership tokens, and deterministic SigV4 presigning.
 */

import { beforeEach, describe, expect, it } from "vitest";

process.env.JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || "direct-upload-test-secret";

const {
  buildStagingKey,
  filenameFromStagingKey,
  presignS3Put,
  signDirectUploadToken,
  verifyDirectUploadToken,
} = await import("@src/utils/media/direct-upload.server");

const UPLOAD_ID = "11111111-1111-1111-1111-111111111111";
const KEY = `tenant-a/staging/${UPLOAD_ID}/hero.jpg`;

describe("staging keys", () => {
  it("scopes the key to tenant, upload id and basename", () => {
    expect(buildStagingKey("tenant-a", UPLOAD_ID, "hero.jpg")).toBe(KEY);
    expect(buildStagingKey("tenant-a", UPLOAD_ID, "../../etc/passwd")).toBe(
      `tenant-a/staging/${UPLOAD_ID}/passwd`,
    );
    expect(filenameFromStagingKey(KEY)).toBe("hero.jpg");
  });

  it("rejects traversal tenants and malformed upload ids", () => {
    expect(() => buildStagingKey("../tenant", UPLOAD_ID, "a.jpg")).toThrow();
    expect(() => buildStagingKey("tenant-a", "not-a-uuid", "a.jpg")).toThrow();
  });
});

describe("direct-upload tokens", () => {
  beforeEach(() => {
    process.env.JWT_SECRET_KEY = "direct-upload-test-secret";
  });

  it("binds tenant, user, key and size", () => {
    const token = signDirectUploadToken(UPLOAD_ID, "tenant-a", "user-1", KEY, 1234);
    expect(
      verifyDirectUploadToken({
        uploadId: UPLOAD_ID,
        tenantId: "tenant-a",
        userId: "user-1",
        key: KEY,
        size: 1234,
        token,
      }),
    ).toBe(true);
    expect(
      verifyDirectUploadToken({
        uploadId: UPLOAD_ID,
        tenantId: "tenant-b",
        userId: "user-1",
        key: KEY,
        size: 1234,
        token,
      }),
    ).toBe(false);
    expect(
      verifyDirectUploadToken({
        uploadId: UPLOAD_ID,
        tenantId: "tenant-a",
        userId: "user-1",
        key: KEY,
        size: 9999,
        token,
      }),
    ).toBe(false);
  });
});

describe("presignS3Put", () => {
  const common = {
    accessKeyId: "AKIAIOSFODNN7EXAMPLE",
    secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    bucket: "media-bucket",
    region: "eu-central-1",
    key: KEY,
    now: new Date("2026-10-19T12:00:00.000Z"),
  };

  it("produces a deterministic virtual-hosted URL", () => {
    const first = presignS3Put(common);
    const second = presignS3Put(common);
    expect(first.url).toBe(second.url);
    expect(first.url.startsWith("https://media-bucket.s3.eu-central-1.amazonaws.com/")).toBe(true);
    expect(first.url).toContain("X-Amz-Algorithm=AWS4-HMAC-SHA256");
    expect(first.url).toContain("X-Amz-Expires=900");
    expect(first.url).toMatch(/X-Amz-Signature=[0-9a-f]{64}$/);
    expect(first.expiresAt).toBe("2026-10-19T12:15:00.000Z");
  });

  it("switches to path-style addressing for custom endpoints (R2/MinIO)", () => {
    const { url } = presignS3Put({
      ...common,
      endpoint: "https://account.r2.cloudflarestorage.com",
    });
    expect(
      url.startsWith("https://account.r2.cloudflarestorage.com/media-bucket/tenant-a/staging/"),
    ).toBe(true);
  });

  it("clamps absurd expiry values", () => {
    const { url } = presignS3Put({ ...common, expiresInSeconds: 99_999_999 });
    expect(url).toContain("X-Amz-Expires=604800");
  });
});
