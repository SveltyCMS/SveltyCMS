/**
 * @file tests/unit/api/streaming-json-response.test.ts
 * @description Pull-driven streaming JSON writer: exact bytes, maxItems, error
 * marker, and the removal of the fixed 10 ms backpressure sleep.
 */

import { describe, expect, it } from "vitest";
import { streamingJsonResponse } from "@src/routes/api/[...path]/handlers/streaming";

async function* rows(n: number) {
  for (let i = 0; i < n; i++) yield { _id: String(i), n: i };
}

describe("streamingJsonResponse", () => {
  it("emits the same envelope as the legacy writer", async () => {
    const body = await streamingJsonResponse(rows(2), 2).text();
    expect(body).toBe(
      '{"success":true,"data":[{"_id":"0","n":0},{"_id":"1","n":1}],"metadata":{"totalCount":2,"returned":2}}',
    );
  });

  it("omits metadata when no totalCount is given", async () => {
    const body = await streamingJsonResponse([{ a: 1 }]).text();
    expect(body).toBe('{"success":true,"data":[{"a":1}]}');
  });

  it("stops at maxItems and reports the returned count", async () => {
    const body = await streamingJsonResponse(rows(10), 10, { maxItems: 3 }).text();
    expect(body).toBe(
      '{"success":true,"data":[{"_id":"0","n":0},{"_id":"1","n":1},{"_id":"2","n":2}],"metadata":{"totalCount":10,"returned":3}}',
    );
  });

  it("keeps partial data and appends the error marker when the iterator throws", async () => {
    async function* failing() {
      yield { ok: 1 };
      throw new Error("cursor exploded");
    }
    const body = await streamingJsonResponse(failing()).text();
    expect(body).toBe('{"success":true,"data":[{"ok":1}],"error":"Stream interrupted"}');
  });

  it("backs up the consumer without timer sleeps (500 items in well under a second)", async () => {
    // The legacy writer slept a fixed 10 ms whenever the queue was full
    // (HWM = 1), i.e. ≥ 5 s for 500 items; pull-driven streaming must be
    // bounded by the consumer, not by a per-item timer.
    const started = Date.now();
    const body = await streamingJsonResponse(rows(500), 500).text();
    const elapsed = Date.now() - started;
    expect(body.length).toBeGreaterThan(5000);
    expect(elapsed).toBeLessThan(1500);
  });
});
