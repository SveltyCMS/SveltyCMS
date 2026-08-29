/**
 * @file tests/unit/api/json-response-headers.test.ts
 * @description Content-Length on JSON envelopes so gzip skips tiny create/update bodies.
 *
 * ### Features:
 * - successResponse sets content-length
 * - collection mutations skip handleCompression wrapping
 */

import { describe, expect, it } from "vitest";
import { successResponse } from "@src/routes/api/[...path]/handlers/base";
import { handleCompression } from "@src/hooks/handle-compression";
import type { RequestEvent } from "@sveltejs/kit";

describe("successResponse Content-Length", () => {
  it("sets content-length to the UTF-8 byte size of the JSON body", () => {
    const event = { locals: {} } as RequestEvent;
    const res = successResponse(event, { success: true, data: { _id: "a" } }, 201);
    const len = Number(res.headers.get("content-length"));
    expect(len).toBeGreaterThan(0);
    expect(len).toBe(Buffer.byteLength((event.locals as { apiBody?: string }).apiBody || ""));
  });
});

describe("handleCompression collection mutations", () => {
  it("returns the inner response untouched for POST /api/collections", async () => {
    const inner = new Response('{"ok":true}', {
      headers: { "content-type": "application/json" },
    });
    const event = {
      locals: { __flags: { isStatic: false, isTestMode: false } },
      request: { method: "POST", headers: new Headers({ "accept-encoding": "gzip, br" }) },
      url: new URL("http://127.0.0.1/api/collections/Articles"),
    };
    const res = await handleCompression({
      event: event as unknown as RequestEvent,
      resolve: async () => inner,
    });
    expect(res).toBe(inner);
    expect(res.headers.get("content-encoding")).toBeNull();
  });
});
