/**
 * @file tests/integration/databases/metadata-concurrent-patch.test.ts
 * @description Regression: two concurrent `media.files.updateMetadata` patches on
 * ONE row must both survive — no lost update.
 *
 * `updateMetadata` used to be a read-modify-write of the whole `metadata` JSON
 * blob: SELECT the row, spread `{...stored, ...patch}`, UPDATE the merged blob.
 * Two writers on the same row (the share-link patch in
 * `routes/api/[...path]/handlers/media.ts` and the fire-and-forget derivative job
 * in `media-service.server.ts`) therefore raced: the later UPDATE persisted a
 * snapshot taken before the other writer's UPDATE and silently dropped its keys.
 * The symptom was HTTP 500 `SHARE_LINK_PERSIST_FAILED` right after the
 * `[Share] Link patch not visible after write` log line.
 *
 * The fix moves the merge into the UPDATE (per-dialect key-level JSON set:
 * MariaDB `JSON_SET`, PostgreSQL `jsonb_set`, SQLite `json_set`), so neither
 * writer reads the document and no write can be lost.
 *
 * ### Features:
 * - 50 rounds of two concurrent patches of DISJOINT keys on one row
 * - asserts after EVERY round that both keys are present and current (fails on
 *   the old read-modify-write, which loses one of them in most rounds)
 * - runs in whichever SQL lane it is started in (sqlite / mariadb / postgresql);
 *   MongoDB already patches with dotted `$set` paths, so it is out of scope here
 */

import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ensureFullInitialization, getDb } from "@src/databases/db";
import type { DatabaseId } from "@src/databases/db-interface";

/** Rounds of the interleaving. 50 is where the RMW race shows reliably. */
const ROUNDS = 50;
/** Key owned by the share-link writer. */
const SHARE_KEY = "sharedLinks";
/** Keys owned by the derivative/status writer. */
const STATUS_KEY = "processingStatus";
const ERROR_KEY = "processingError";

/** Engines whose `updateMetadata` used the shared relational read-modify-write. */
const RELATIONAL_ENGINES = new Set(["sqlite", "mariadb", "postgresql"]);

let db: any = null;
let mediaId: DatabaseId | null = null;
/** Row scope for the writes: the created row's own tenant (none in single-tenant mode). */
let writeOptions: { tenantId: DatabaseId } | undefined;

function currentDbType(): string {
  return (process.env.DB_TYPE || process.env.db_type || "sqlite").toLowerCase().trim();
}

/**
 * SQLite stores `metadata` as TEXT, so the raw row hands back the JSON *string*
 * (MariaDB/PostgreSQL return an object). Normalise both shapes here — this test
 * is about keys surviving, not about the read path's decoding.
 */
function asMetadataObject(raw: unknown): Record<string, unknown> {
  let value: unknown = raw;
  for (let pass = 0; pass < 2 && typeof value === "string"; pass++) {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const engineSupported = RELATIONAL_ENGINES.has(currentDbType());

describe.skipIf(!engineSupported)(
  `media.files.updateMetadata: concurrent patches of different keys (${currentDbType()})`,
  () => {
    beforeAll(async () => {
      await ensureFullInitialization();
      db = getDb();
      if (!db) throw new Error("Database not initialized");

      const tag = randomUUID().slice(0, 8);
      const created = await db.media.files.upload(
        {
          filename: `metadata-race-${tag}.png`,
          originalFilename: `metadata-race-${tag}.png`,
          mimeType: "image/png",
          path: `global/metadata-race-${tag}.png`,
          size: 1024,
          hash: `metadata-race-hash-${tag}`,
          createdBy: "metadata-race-user",
          updatedBy: "metadata-race-user",
          access: "public",
          folderId: null,
          originalId: null,
          thumbnails: {},
          metadata: { processingStatus: "processing" },
          tenantId: null,
        } as any,
        undefined,
      );
      if (!created.success || !created.data) {
        throw new Error(`Could not create the media fixture: ${created.message}`);
      }
      mediaId = created.data._id;
      const rowTenant = (created.data as { tenantId?: DatabaseId | null }).tenantId;
      writeOptions = rowTenant ? { tenantId: rowTenant } : undefined;
      // Connection-resilience retries plus a first-time PostgreSQL DDL pass exceed
      // bun's 5 s default hook budget; the assertions stay on the patch rounds.
    }, 120_000);

    afterAll(async () => {
      if (db && mediaId) {
        await db.media.files.delete(mediaId, writeOptions).catch(() => {});
      }
    });

    it(`keeps both keys in all ${ROUNDS} rounds`, async () => {
      const id = mediaId!;
      /** Rounds in which one writer's patch was dropped or rolled back. */
      const lostRounds: Array<{ round: number; missing: string[] }> = [];

      for (let round = 0; round < ROUNDS; round++) {
        const sharePatch = { [SHARE_KEY]: [{ token: `race-token-${round}` }] };
        const statusPatch = { [STATUS_KEY]: "ready", [ERROR_KEY]: null };

        // Both writers start before either finishes: the old code let each read
        // the blob, then each write it back — the later write dropped the other's key.
        const [shareResult, statusResult] = await Promise.all([
          db.media.files.updateMetadata(id, sharePatch, writeOptions),
          db.media.files.updateMetadata(id, statusPatch, writeOptions),
        ]);
        expect(
          shareResult.success,
          `round ${round}: share patch failed: ${shareResult.message}`,
        ).toBe(true);
        expect(
          statusResult.success,
          `round ${round}: status patch failed: ${statusResult.message}`,
        ).toBe(true);

        const readBack = await db.media.files.getMetadata([id], writeOptions);
        expect(readBack.success, `round ${round}: read-back failed: ${readBack.message}`).toBe(
          true,
        );
        const metadata = asMetadataObject(readBack.data?.[String(id)]);

        const missing: string[] = [];
        if (!(SHARE_KEY in metadata)) missing.push(SHARE_KEY);
        if (!(STATUS_KEY in metadata)) missing.push(STATUS_KEY);
        if (!(ERROR_KEY in metadata)) missing.push(ERROR_KEY);
        if (missing.length > 0) {
          lostRounds.push({ round, missing });
          continue;
        }

        // The surviving values must be the last writers' — a stale snapshot would
        // also resurrect an older value.
        const links = metadata[SHARE_KEY] as Array<{ token?: string }> | undefined;
        if (links?.[0]?.token !== `race-token-${round}`) {
          lostRounds.push({ round, missing: [`${SHARE_KEY} (stale value)`] });
        }
        if (metadata[STATUS_KEY] !== "ready") {
          lostRounds.push({ round, missing: [`${STATUS_KEY} (stale value)`] });
        }
        // An explicit `null` patch value must stay a JSON null — a SQL NULL would
        // drop the key instead of writing it.
        if (metadata[ERROR_KEY] !== null) {
          lostRounds.push({ round, missing: [`${ERROR_KEY} (not JSON null)`] });
        }
      }

      expect(
        lostRounds,
        `lost updates in ${lostRounds.length}/${ROUNDS} rounds: ${JSON.stringify(lostRounds.slice(0, 5))}`,
      ).toEqual([]);
    }, 300_000);
  },
);
