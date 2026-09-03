/**
 * @file tests/unit/api/collection-export-stream.test.ts
 * @description Unit tests for the streaming NDJSON / CSV collection export route.
 *
 * Features:
 * - streamingExportResponse yields NDJSON lines without buffering the full payload
 * - streamingExportResponse yields CSV header + data rows
 * - isChunkedExportResponse correctly signals the dispatcher to bypass body.text()
 * - A large in-memory iterable streams completely without 1000-row truncation
 * - Content-Disposition + Content-Type are set correctly per format
 */

import { describe, it, expect } from "vitest";
import {
  streamingExportResponse,
  isChunkedExportResponse,
} from "@src/routes/api/[...path]/handlers/streaming";

// ---------------------------------------------------------------------------
// Helper: drain a ReadableStream into a raw string
// ---------------------------------------------------------------------------
async function drainText(response: Response): Promise<string> {
  const reader = response.body!.getReader();
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const total = chunks.reduce((acc, c) => acc + c.length, 0);
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(merged);
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
async function* makeRecords(count: number): AsyncGenerator<Record<string, unknown>> {
  for (let i = 0; i < count; i++) {
    yield { id: i, name: `item-${i}`, value: i * 10 };
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe("streamingExportResponse — NDJSON", () => {
  it("sets the correct Content-Type for ndjson", () => {
    const response = streamingExportResponse(makeRecords(5), {
      format: "ndjson",
      filename: "test-export.ndjson",
    });
    expect(response.headers.get("content-type")).toContain("ndjson");
  });

  it("sets Content-Disposition to attachment with the given filename", () => {
    const response = streamingExportResponse(makeRecords(5), {
      format: "ndjson",
      filename: "my-export.ndjson",
    });
    const cd = response.headers.get("content-disposition") || "";
    expect(cd).toContain("attachment");
    expect(cd).toContain("my-export.ndjson");
  });

  it("streams all records as newline-delimited JSON", async () => {
    const response = streamingExportResponse(makeRecords(10), {
      format: "ndjson",
      filename: "test.ndjson",
    });
    const body = await drainText(response);
    const lines = body.trim().split("\n").filter(Boolean);
    expect(lines).toHaveLength(10);
    // Every line must be valid JSON
    for (let i = 0; i < lines.length; i++) {
      const parsed = JSON.parse(lines[i]);
      expect(parsed.id).toBe(i);
    }
  });

  it("does NOT truncate at 1000 rows — streams all 1500 records", async () => {
    const response = streamingExportResponse(makeRecords(1500), {
      format: "ndjson",
      filename: "large.ndjson",
    });
    const body = await drainText(response);
    const lines = body.trim().split("\n").filter(Boolean);
    expect(lines).toHaveLength(1500);
  });
});

describe("streamingExportResponse — CSV", () => {
  it("sets the correct Content-Type for csv", () => {
    const response = streamingExportResponse(makeRecords(3), {
      format: "csv",
      filename: "test.csv",
      columns: ["id", "name", "value"],
    });
    expect(response.headers.get("content-type")).toContain("text/csv");
  });

  it("emits a CSV header row followed by data rows", async () => {
    const response = streamingExportResponse(makeRecords(3), {
      format: "csv",
      filename: "test.csv",
      columns: ["id", "name", "value"],
    });
    const body = await drainText(response);
    const lines = body.trim().split("\n").filter(Boolean);
    // First line is header
    expect(lines[0]).toBe("id,name,value");
    expect(lines).toHaveLength(4); // header + 3 data rows
  });
});

describe("isChunkedExportResponse", () => {
  it("returns true for responses with x-export-format header", () => {
    const r = new Response(null, { headers: { "x-export-format": "ndjson" } });
    expect(isChunkedExportResponse(r)).toBe(true);
  });

  it("returns true for ndjson Content-Type", () => {
    const r = new Response(null, { headers: { "content-type": "application/x-ndjson" } });
    expect(isChunkedExportResponse(r)).toBe(true);
  });

  it("returns true for text/csv Content-Type", () => {
    const r = new Response(null, { headers: { "content-type": "text/csv; charset=utf-8" } });
    expect(isChunkedExportResponse(r)).toBe(true);
  });

  it("returns true for Content-Disposition attachment (any format)", () => {
    const r = new Response(null, {
      headers: { "content-disposition": 'attachment; filename="data.json"' },
    });
    expect(isChunkedExportResponse(r)).toBe(true);
  });

  it("returns false for a standard JSON API response", () => {
    const r = new Response('{"success":true}', {
      headers: { "content-type": "application/json" },
    });
    expect(isChunkedExportResponse(r)).toBe(false);
  });
});
