/**
 * @file tests/unit/media/sharing.test.ts
 * @description Unit tests for secure media share link generation and validation.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { scryptSync } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import {
  createLink,
  validateLink,
  revoke,
  extend,
  stats,
  filterLinks,
  newToken,
  createBulkArchive,
  cleanupArchive,
  resolveMediaPathUnderRoot,
} from "../../../src/utils/media/sharing";
import {
  hashSharePassword,
  verifySharePassword,
} from "../../../src/utils/media/share-link-hash.server";

// The global settings mock (tests/unit/setup.ts) reads JWT_SECRET_KEY from
// globalThis.privateEnv — required by the share-link pepper. A global
// beforeEach in setup.ts wipes privateEnv before every test, so it must be
// re-seeded here per test.
const TEST_JWT_SECRET = "unit-test-jwt-secret-for-share-link-hmac";

beforeEach(() => {
  (globalThis as any).privateEnv = {
    ...(globalThis as any).privateEnv,
    JWT_SECRET_KEY: TEST_JWT_SECRET,
  };
});

describe("sharing — createLink", () => {
  it("generates a valid share link with defaults", () => {
    const link = createLink("file_1" as any, "user_1" as any);

    expect(link.token).toBeTruthy();
    expect(link.rawToken).toBeTruthy();
    expect(link.rawToken.length).toBeGreaterThan(32);
    expect(link.fileId).toBe("file_1");
    expect(link.active).toBe(true);
    expect(link.downloadCount).toBe(0);

    const expiresAt = new Date(link.expiresAt);
    const diffHours = (expiresAt.getTime() - Date.now()) / 3_600_000;
    expect(diffHours).toBeGreaterThan(23);
    expect(diffHours).toBeLessThan(25);
  });

  it("applies custom hours and maxDownloads", () => {
    const link = createLink("f1" as any, "u1" as any, {
      hours: 48,
      maxDownloads: 5,
    });
    expect(link.maxDownloads).toBe(5);
    const diffHours = (new Date(link.expiresAt).getTime() - Date.now()) / 3_600_000;
    expect(diffHours).toBeGreaterThan(47);
  });

  it("generates unique tokens", () => {
    const a = createLink("f1" as any, "u1" as any);
    const b = createLink("f1" as any, "u1" as any);
    expect(a.rawToken).not.toBe(b.rawToken);
  });
});

describe("sharing — validateLink", () => {
  function makeLink(overrides: Partial<ReturnType<typeof createLink>> = {}) {
    return createLink("f1" as any, "u1" as any, overrides as any);
  }

  it("validates active link", () => {
    expect(validateLink(makeLink()).ok).toBe(true);
  });

  it("rejects inactive link", () => {
    expect(validateLink({ ...makeLink(), active: false }).reason).toBe("inactive");
  });

  it("rejects expired link", () => {
    const expired = {
      ...makeLink(),
      expiresAt: new Date(Date.now() - 1000).toISOString() as any,
    };
    expect(validateLink(expired).reason).toBe("expired");
  });

  it("rejects when download limit reached", () => {
    const limited = { ...makeLink(), maxDownloads: 3, downloadCount: 3 };
    expect(validateLink(limited).reason).toBe("limit");
  });

  it("validates IP restrictions", () => {
    const ipLink = { ...makeLink(), allowedIPs: ["192.168.1.1"] };
    expect(validateLink(ipLink, "10.0.0.1").reason).toBe("ip");
    expect(validateLink(ipLink, "192.168.1.1").ok).toBe(true);
  });
});

describe("sharing — revoke / extend", () => {
  it("revoke sets active to false", () => {
    const link = createLink("f1" as any, "u1" as any);
    expect(revoke({ ...link }).active).toBe(false);
  });

  it("extend pushes expiry forward", () => {
    const link = createLink("f1" as any, "u1" as any);
    const original = new Date(link.expiresAt).getTime();
    const extended = extend({ ...link }, 24);
    expect(new Date(extended.expiresAt).getTime()).toBeGreaterThan(original + 23 * 3_600_000);
  });
});

describe("sharing — filterLinks", () => {
  it("separates active and expired links", () => {
    const active = createLink("f1" as any, "u1" as any);
    const expired = {
      ...createLink("f2" as any, "u1" as any),
      expiresAt: new Date(Date.now() - 1).toISOString() as any,
    };
    const result = filterLinks([active, expired]);
    expect(result.active).toHaveLength(1);
    expect(result.expired).toHaveLength(1);
  });
});

describe("sharing — stats", () => {
  it("computes stats from link logs", () => {
    const link = createLink("f1" as any, "u1" as any, { maxDownloads: 10 });
    const now = new Date().toISOString() as any;

    link.logs.push(
      { action: "view", at: now, ip: "1.1.1.1", ua: "test", ok: true },
      { action: "download", at: now, ip: "1.1.1.1", ua: "test", ok: true },
    );
    link.downloadCount = 1;

    const s = stats(link);
    expect(s.total).toBe(2);
    expect(s.views).toBe(1);
    expect(s.downloads).toBe(1);
    expect(s.downloadsLeft).toBe(9);
  });
});

describe("sharing — newToken", () => {
  it("generates base64url token, 32 bytes → 43 chars", () => {
    const token = newToken();
    expect(token.length).toBe(43);
    expect(token).not.toContain("+");
    expect(token).not.toContain("/");
    expect(token).not.toContain("=");
  });
});

describe("sharing — password hashing (scrypt + pepper)", () => {
  it("stores a per-link salt and a 64-char hash", () => {
    const a = hashSharePassword("hunter2");
    expect(a).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
  });

  it("uses a fresh salt for every hash", () => {
    const a = hashSharePassword("hunter2");
    const b = hashSharePassword("hunter2");
    expect(a).not.toBe(b);
  });

  it("produces different hashes for different passwords", () => {
    expect(hashSharePassword("alpha")).not.toBe(hashSharePassword("beta"));
  });

  it("verifySharePassword accepts the stored value", () => {
    const stored = hashSharePassword("correct horse");
    expect(verifySharePassword("correct horse", stored)).toBe(true);
    expect(verifySharePassword("wrong horse", stored)).toBe(false);
  });

  it("verifies legacy static-salt hashes during the link TTL", () => {
    const legacy = scryptSync("correct horse", `sharelink-hmac:${TEST_JWT_SECRET}`, 32).toString(
      "hex",
    );
    expect(verifySharePassword("correct horse", legacy)).toBe(true);
    expect(verifySharePassword("wrong horse", legacy)).toBe(false);
  });

  it("verifySharePassword rejects malformed stored hashes without throwing", () => {
    expect(verifySharePassword("x", "")).toBe(false);
    expect(verifySharePassword("x", "not-a-hex-hash")).toBe(false);
    expect(verifySharePassword("x", hashSharePassword("y"))).toBe(false);
    expect(verifySharePassword("x", "scrypt$zzzz$zzzz")).toBe(false);
  });

  it("fails closed when JWT_SECRET_KEY is unavailable", () => {
    const env = (globalThis as any).privateEnv;
    const hadKey = env && "JWT_SECRET_KEY" in env;
    if (env) delete env.JWT_SECRET_KEY;
    expect(() => hashSharePassword("x")).toThrow(/JWT_SECRET_KEY/);
    if (hadKey) env.JWT_SECRET_KEY = TEST_JWT_SECRET;
  });
});

describe("sharing — bulk archive root resolution", () => {
  let mediaRoot: string;
  const previousFolder = process.env.MEDIA_FOLDER;

  beforeEach(async () => {
    mediaRoot = await mkdtemp(join(tmpdir(), "svelty-share-"));
    // `resolveConfiguredMediaFolder()` prefers the env folder under TEST_MODE,
    // so this also exercises the canonical-resolver path the API uses.
    process.env.MEDIA_FOLDER = mediaRoot;
  });

  afterEach(async () => {
    if (previousFolder === undefined) delete process.env.MEDIA_FOLDER;
    else process.env.MEDIA_FOLDER = previousFolder;
    await rm(mediaRoot, { recursive: true, force: true });
  });

  function storedMedia(relPath: string, filename: string, bytes: Buffer) {
    return {
      _id: "media_1",
      filename,
      path: relPath,
      size: bytes.length,
      hash: "abc123",
      mimeType: "image/jpeg",
      type: "image",
    } as any;
  }

  it("archives files stored under the configured media folder", async () => {
    const relPath = "tenant1/abc123/original/photo-abc123.jpg";
    const bytes = Buffer.from("hello-bulk-archive");
    await mkdir(join(mediaRoot, "tenant1/abc123/original"), { recursive: true });
    await writeFile(join(mediaRoot, relPath), bytes);

    const archive = await createBulkArchive([storedMedia(relPath, "photo.jpg", bytes)], tmpdir());
    try {
      expect(archive.size).toBeGreaterThan(0);
      const tar = gunzipSync(await readFile(archive.path));
      const text = tar.toString("latin1");
      expect(text).toContain("photo.jpg");
      expect(text).toContain(bytes.toString("latin1"));
    } finally {
      await cleanupArchive(archive.path);
    }
  });

  it("accepts legacy `/files/` URL prefixes", async () => {
    const relPath = "tenant1/abc123/original/doc-abc123.txt";
    const bytes = Buffer.from("legacy-prefix");
    await mkdir(join(mediaRoot, "tenant1/abc123/original"), { recursive: true });
    await writeFile(join(mediaRoot, relPath), bytes);

    const archive = await createBulkArchive(
      [storedMedia(`/files/${relPath}`, "doc.txt", bytes)],
      tmpdir(),
    );
    try {
      expect(archive.size).toBeGreaterThan(0);
    } finally {
      await cleanupArchive(archive.path);
    }
  });

  it("blocks traversal outside the media folder", async () => {
    const bytes = Buffer.from("nope");
    await expect(
      createBulkArchive([storedMedia("../../etc/passwd", "passwd", bytes)], tmpdir()),
    ).rejects.toThrow(/No valid files to archive/);
  });

  it("reports the blocked count when every entry is rejected", async () => {
    const bytes = Buffer.from("nope");
    await expect(
      createBulkArchive([storedMedia("../escape.jpg", "escape.jpg", bytes)], tmpdir()),
    ).rejects.toThrow(/\(1 blocked\)/);
  });
});

describe("sharing — share-download root resolution", () => {
  it("preserves an absolute media root instead of re-rooting it under cwd", () => {
    const root = resolve(tmpdir(), "svelty-share-absolute");
    const resolved = resolveMediaPathUnderRoot(root, "tenant/abc/original/photo.png");

    expect(isAbsolute(resolved)).toBe(true);
    expect(resolved).toBe(resolve(root, "tenant/abc/original/photo.png"));
  });

  it("preserves a POSIX leading-slash absolute root on all platforms", () => {
    const posixRoot = "/home/runner/work/SveltyCMS/tests/integration/.media";
    const resolved = resolveMediaPathUnderRoot(posixRoot, "tenant/abc/original/photo.png");

    expect(resolved).toBe(resolve(process.cwd(), posixRoot, "tenant/abc/original/photo.png"));
    expect(resolved).not.toContain(
      resolve(process.cwd(), "home/runner/work/SveltyCMS/tests/integration/.media"),
    );
  });

  it("strips only a leading ./ from a relative root and normalizes legacy /files/ stored paths", () => {
    const resolved = resolveMediaPathUnderRoot("./mediaFolder", "/files/tenant/photo.png");
    expect(resolved).toBe(resolve(process.cwd(), "mediaFolder", "tenant/photo.png"));
  });
});
