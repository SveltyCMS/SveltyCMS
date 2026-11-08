/**
 * @file tests/unit/core/response-cache-worker-isolation.test.ts
 * @description A cached response body must never cross E2E worker databases.
 *
 * Playwright restarts a worker after a failed test; the preview server keeps
 * running, and the restarted worker gets a fresh SQLite file. A list body
 * cached by the previous worker was replayed to the new one, whose rows have
 * different entry ids — clicking a row then failed with
 * `[Edit] Could not load entry …: Entry not found`.
 *
 * Features:
 * - keys a body under one worker index and asserts a miss under another
 * - asserts a plain (non-test) read cannot see a worker-scoped entry
 */

import { describe, expect, it } from "vitest";
import { responseCache } from "@src/services/cache/response-cache";
import { testWorkerContext } from "@src/utils/test-worker-context";

const KEY = "u:user-1:/api/collections/pages?publicationFilter=all";
const BODY = '{"success":true,"data":[]}';

const entry = () => ({ body: BODY, etag: '"etag-1"' });

describe("response cache worker isolation", () => {
  it("serves a body only to the worker that cached it", () => {
    testWorkerContext.run("0", () => {
      responseCache.set(KEY, entry(), 60_000, "global");
      expect(responseCache.get(KEY, "global")?.body).toBe(BODY);
    });

    testWorkerContext.run("1", () => {
      expect(responseCache.get(KEY, "global")).toBeNull();
    });

    // Outside any worker context the key has no worker segment at all.
    expect(responseCache.get(KEY, "global")).toBeNull();
  });

  it("does not let a worker read a plain cached body", () => {
    const plainKey = "u:user-2:/api/collections/posts?publicationFilter=all";
    responseCache.set(plainKey, entry(), 60_000, "global");

    testWorkerContext.run("2", () => {
      expect(responseCache.get(plainKey, "global")).toBeNull();
    });
  });
});
