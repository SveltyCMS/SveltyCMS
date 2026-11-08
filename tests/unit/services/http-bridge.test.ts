/**
 * @file tests/unit/services/http-bridge.test.ts
 * @description Unit tests for HTTP write ingestion bridge helpers.
 *
 * Features:
 * - unwrapWritePayload unwrap logic
 * - isPublishWrite publish detection
 * - extractExpectedVersion optimistic locking extraction and deletion
 * - minimalWriteAck RFC 7240 minimal response creation
 * - promoteStagedDraft publish draft promotion
 */

import { describe, it, expect, vi } from "vitest";
import {
  unwrapWritePayload,
  isPublishWrite,
  extractExpectedVersion,
  minimalWriteAck,
  promoteStagedDraft,
  PUBLISH_STATUSES,
} from "@src/services/sdk/namespaces/collections/http-bridge";
import type { RequestEvent } from "@sveltejs/kit";
import type { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/content/types";

describe("http-bridge unwrapWritePayload", () => {
  it("unwraps { data } when data is the sole key", () => {
    const payload = { data: { title: "Hello", count: 42 } };
    expect(unwrapWritePayload(payload)).toEqual({ title: "Hello", count: 42 });
  });

  it("unwraps { data, tenantId } when data and tenantId are the sole keys", () => {
    const payload = { data: { title: "Hello" }, tenantId: "tenant-1" };
    expect(unwrapWritePayload(payload)).toEqual({ title: "Hello" });
  });

  it("preserves object if extra fields exist alongside data", () => {
    const payload = { data: { title: "Hello" }, extra: true };
    expect(unwrapWritePayload(payload)).toBe(payload);
  });

  it("preserves primitive values and arrays unchanged", () => {
    expect(unwrapWritePayload(null)).toBeNull();
    expect(unwrapWritePayload(undefined)).toBeUndefined();
    expect(unwrapWritePayload("string")).toBe("string");
    expect(unwrapWritePayload(123)).toBe(123);
    expect(unwrapWritePayload([1, 2, 3])).toEqual([1, 2, 3]);
  });
});

describe("http-bridge isPublishWrite", () => {
  it("detects publish and published status", () => {
    expect(isPublishWrite({ status: "publish" })).toBe(true);
    expect(isPublishWrite({ status: "published" })).toBe(true);
  });

  it("returns false for draft, archive, or non-publish statuses", () => {
    expect(isPublishWrite({ status: "draft" })).toBe(false);
    expect(isPublishWrite({ status: "archive" })).toBe(false);
    expect(isPublishWrite({})).toBe(false);
    expect(isPublishWrite(null)).toBe(false);
    expect(isPublishWrite("publish")).toBe(false);
  });

  it("exports PUBLISH_STATUSES set", () => {
    expect(PUBLISH_STATUSES.has("publish")).toBe(true);
    expect(PUBLISH_STATUSES.has("published")).toBe(true);
  });
});

describe("http-bridge extractExpectedVersion", () => {
  function makeEvent(headers: Record<string, string>, search = ""): RequestEvent {
    const url = new URL(`https://example.com/api/collections/posts${search}`);
    const reqHeaders = new Headers(headers);
    const request = new Request(url, { headers: reqHeaders });
    return {
      request,
      url,
    } as unknown as RequestEvent;
  }

  it("extracts If-Match header with highest priority", () => {
    const event = makeEvent({ "if-match": "v1" }, "?expectedVersion=v3");
    const data = { expectedVersion: "v2", title: "Test" };
    const version = extractExpectedVersion(event, data);
    expect(version).toBe("v1");
    expect(data.expectedVersion).toBeUndefined();
    expect(data.title).toBe("Test");
  });

  it("extracts expectedVersion from payload body and deletes it from object", () => {
    const event = makeEvent({});
    const data = { expectedVersion: 5, title: "Test" };
    const version = extractExpectedVersion(event, data);
    expect(version).toBe(5);
    expect(data.expectedVersion).toBeUndefined();
  });

  it("extracts expectedVersion from URL search query param", () => {
    const event = makeEvent({}, "?expectedVersion=query-version");
    const data = { title: "Test" };
    const version = extractExpectedVersion(event, data);
    expect(version).toBe("query-version");
  });

  it("returns undefined when no version is provided", () => {
    const event = makeEvent({});
    const data = { title: "Test" };
    expect(extractExpectedVersion(event, data)).toBeUndefined();
  });

  it("supports (request, url, data) overload", () => {
    const url = new URL("https://example.com/test?expectedVersion=u1");
    const req = new Request(url);
    const data = { title: "Overload" };
    expect(extractExpectedVersion(req, url, data)).toBe("u1");
  });
});

describe("http-bridge minimalWriteAck", () => {
  function makeEvent(): RequestEvent {
    const url = new URL("https://example.com/api/collections/posts");
    return {
      request: new Request(url),
      url,
    } as unknown as RequestEvent;
  }

  it("builds minimal status-only response with fallbackId", async () => {
    const event = makeEvent();
    const res = minimalWriteAck(event, { success: true, data: { _id: "row-1" } }, 200, "entry-123");
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ success: true, data: { _id: "entry-123" } });
  });

  it("extracts _id from result.data when fallbackId is undefined (POST create)", async () => {
    const event = makeEvent();
    const res = minimalWriteAck(event, { success: true, data: { _id: "new-doc-id" } }, 201);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json).toEqual({ success: true, data: { _id: "new-doc-id" } });
  });

  it("attaches extra headers if provided", () => {
    const event = makeEvent();
    const res = minimalWriteAck(event, { success: true, data: { _id: "doc-id" } }, 200, undefined, {
      "x-custom-test": "header-val",
    });
    expect(res.headers.get("x-custom-test")).toBe("header-val");
  });
});

describe("http-bridge promoteStagedDraft", () => {
  it("returns null when no staged draft is found", async () => {
    const mockCms = {
      drafts: {
        getDraft: vi.fn().mockResolvedValue({ success: true, data: null }),
        promoteDraft: vi.fn(),
      },
    } as unknown as LocalCMS;

    const res = await promoteStagedDraft(mockCms, "posts", "entry-1", "tenant-1" as DatabaseId, {
      _id: "u1",
    });
    expect(res).toBeNull();
    expect(mockCms.drafts.promoteDraft).not.toHaveBeenCalled();
  });

  it("returns lookup failure as-is without promoting", async () => {
    const mockCms = {
      drafts: {
        getDraft: vi.fn().mockResolvedValue({ success: false, message: "Draft read failed" }),
        promoteDraft: vi.fn(),
      },
    } as unknown as LocalCMS;

    const res = await promoteStagedDraft(mockCms, "posts", "entry-1", "tenant-1" as DatabaseId, {
      _id: "u1",
    });
    expect(res).toEqual({ success: false, message: "Draft read failed" });
    expect(mockCms.drafts.promoteDraft).not.toHaveBeenCalled();
  });

  it("promotes staged draft when found", async () => {
    const mockCms = {
      drafts: {
        getDraft: vi.fn().mockResolvedValue({
          success: true,
          data: { _id: "draft-99", title: "Staged Draft" },
        }),
        promoteDraft: vi.fn().mockResolvedValue({
          success: true,
          data: { _id: "entry-1", title: "Staged Draft" },
        }),
      },
    } as unknown as LocalCMS;

    const res = await promoteStagedDraft(
      mockCms,
      "posts",
      "entry-1",
      "tenant-1" as DatabaseId,
      { _id: "u1" },
      { expectedVersion: "ver-4" },
    );
    expect(res).toEqual({
      success: true,
      data: { _id: "entry-1", title: "Staged Draft" },
    });
    expect(mockCms.drafts.promoteDraft).toHaveBeenCalledWith(
      "posts",
      "draft-99",
      expect.objectContaining({
        status: "publish",
        expectedVersion: "ver-4",
      }),
    );
  });
});
