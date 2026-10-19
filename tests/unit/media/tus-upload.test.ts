/**
 * @file tests/unit/media/tus-upload.test.ts
 * @description TUS session protocol: metadata decoding, ownership tokens,
 * offset serialization, and one-shot finalization.
 */

import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const spoolRoot = await mkdtemp(path.join(os.tmpdir(), "sveltycms-tus-test-"));
process.env.TUS_SPOOL_DIR = spoolRoot;
process.env.JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || "tus-test-secret";

const {
  appendTusChunk,
  createTusSession,
  deleteTusSession,
  getTusSession,
  parseTusMetadata,
  sanitizeTusFilename,
  serializeTusMetadata,
  signTusToken,
  TUS_MAX_BYTES,
} = await import("@src/services/media/tus-upload.server");

const TENANT = "tenant-a";
const USER = "user-1";

function createInput(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: TENANT,
    userId: USER,
    filename: "clip.mp4",
    mimeType: "video/mp4",
    size: 11,
    folder: "global",
    access: "private" as const,
    ...overrides,
  };
}

beforeEach(async () => {
  // Each test starts with an empty spool.
  const entries = await readdir(spoolRoot);
  await Promise.all(entries.map((entry) => rm(path.join(spoolRoot, entry), { force: true })));
});

afterAll(async () => {
  await rm(spoolRoot, { recursive: true, force: true });
});

describe("TUS metadata", () => {
  it("round-trips UTF-8 metadata", () => {
    const header = serializeTusMetadata({
      filename: "Grüße 2026.mp4",
      filetype: "video/mp4",
      folder: "global",
    });
    expect(parseTusMetadata(header)).toEqual({
      filename: "Grüße 2026.mp4",
      filetype: "video/mp4",
      folder: "global",
    });
  });

  it("ignores malformed keys and keeps valueless keys", () => {
    expect(parseTusMetadata("filename, filen@me, filetype dmlkZW8vbXA0")).toEqual({
      filename: "",
      filetype: "video/mp4",
    });
  });

  it("strips traversal, control characters, and Windows reserved names", () => {
    expect(sanitizeTusFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeTusFilename("a\u0000b.jpg")).toBe("ab.jpg");
    expect(sanitizeTusFilename("CON.txt")).toBe("file-CON.txt");
    expect(sanitizeTusFilename("")).toBe("upload");
  });
});

describe("TUS sessions", () => {
  it("serializes chunks and finalizes exactly once", async () => {
    const session = await createTusSession(createInput());
    const token = signTusToken(session.id, TENANT, USER);

    const first = await appendTusChunk(
      session.id,
      token,
      TENANT,
      USER,
      0,
      Buffer.from("hello "),
      async () => ({ mediaId: "unexpected" }),
    );
    expect(first.offset).toBe(6);
    expect(first.finalized).toBe(false);

    let finalizedPath = "";
    const second = await appendTusChunk(
      session.id,
      token,
      TENANT,
      USER,
      6,
      Buffer.from("world"),
      async (_session, filePath) => {
        finalizedPath = filePath;
        expect(await readFile(filePath, "utf8")).toBe("hello world");
        return { mediaId: "media-1" };
      },
    );
    expect(second.finalized).toBe(true);
    expect(second.mediaId).toBe("media-1");

    // The spool part is removed after ingestion; the session metadata remains
    // until TTL so a retried final PATCH can report the media id.
    await expect(stat(finalizedPath)).rejects.toThrow();
    const replay = await appendTusChunk(
      session.id,
      token,
      TENANT,
      USER,
      11,
      Buffer.alloc(0),
      async () => ({ mediaId: "should-not-run" }),
    );
    expect(replay.finalized).toBe(true);
    expect(replay.mediaId).toBe("media-1");
  });

  it("returns the expected offset on a conflict", async () => {
    const session = await createTusSession(createInput());
    const token = signTusToken(session.id, TENANT, USER);
    await appendTusChunk(session.id, token, TENANT, USER, 0, Buffer.from("abc"), async () => ({}));

    await expect(
      appendTusChunk(session.id, token, TENANT, USER, 0, Buffer.from("x"), async () => ({})),
    ).rejects.toMatchObject({ status: 409, expectedOffset: 3 });
  });

  it("rejects a different owner and an invalid token", async () => {
    const session = await createTusSession(createInput());
    const token = signTusToken(session.id, TENANT, USER);

    await expect(getTusSession(session.id, token, "tenant-b", USER)).rejects.toMatchObject({
      status: 403,
    });
    await expect(getTusSession(session.id, "1:bad", TENANT, USER)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("enforces the upload ceiling and positive length", async () => {
    await expect(createTusSession(createInput({ size: 0 }))).rejects.toMatchObject({
      status: 400,
    });
    await expect(createTusSession(createInput({ size: TUS_MAX_BYTES + 1 }))).rejects.toMatchObject({
      status: 413,
    });
  });

  it("deletes a session and its spool", async () => {
    const session = await createTusSession(createInput());
    const token = signTusToken(session.id, TENANT, USER);
    expect(await getTusSession(session.id, token, TENANT, USER)).not.toBeNull();
    await deleteTusSession(session.id);
    expect(await getTusSession(session.id, token, TENANT, USER)).toBeNull();
  });
});
