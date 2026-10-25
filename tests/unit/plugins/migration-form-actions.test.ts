/**
 * @file tests/unit/plugins/migration-form-actions.test.ts
 * @description Error-surfacing contract for the Smart Importer plugin API client.
 *
 * The dispatcher returns `{ success: false, message, code }` (not `error`), so a
 * plain `error` field check degraded every failure to the generic
 * "Format detection failed" toast — including the 413 size guard.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  describeApiError,
  postPluginPageAction,
} from "@plugins/smart-importer/ui/migration-form-actions";

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("describeApiError", () => {
  it("reads the dispatcher message envelope", () => {
    expect(
      describeApiError(
        {
          success: false,
          message: "Request body too large (15.3MB). Maximum is 15MB.",
          code: "PAYLOAD_TOO_LARGE",
        },
        413,
      ),
    ).toContain("too large");
  });

  it("reads nested action failure data", () => {
    expect(describeApiError({ status: 500, data: { error: "Detection failed: boom" } }, 500)).toBe(
      "Detection failed: boom",
    );
  });

  it("reads an object error message", () => {
    expect(describeApiError({ error: { message: "Plugin disabled" } }, 403)).toBe(
      "Plugin disabled",
    );
  });

  it("falls back to a status message and explains 413", () => {
    expect(describeApiError(null, 500)).toBe("Request failed (HTTP 500).");
    expect(describeApiError(null, 413)).toContain("upload limit");
  });
});

describe("postPluginPageAction", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("surfaces the server message on a non-OK envelope", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            success: false,
            message: "Request body too large (15.3MB). Maximum is 15MB.",
            code: "PAYLOAD_TOO_LARGE",
          },
          413,
        ),
      ),
    );

    const result = await postPluginPageAction("detect", new FormData());

    expect(result).toMatchObject({ success: false });
    expect(String((result as { error?: unknown }).error)).toContain("too large");
  });

  it("unwraps a successful action payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ success: true, format: "csv" }, 200)),
    );

    await expect(postPluginPageAction("detect", new FormData())).resolves.toMatchObject({
      success: true,
      format: "csv",
    });
  });

  it("survives a non-JSON error body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>oops</html>", { status: 502 })),
    );

    const result = await postPluginPageAction("detect", new FormData());
    expect(String((result as { error?: unknown }).error)).toContain("HTTP 502");
  });
});
