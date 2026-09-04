/**
 * @file tests/unit/utils/export-encode.test.ts
 * @description Unit tests for streamed collection export CSV/NDJSON encoding.
 */

import { describe, it, expect } from "vitest";
import {
  collectExportColumns,
  csvRowFromRecord,
  encodeCsvField,
  encodeCsvHeader,
  encodeNdjsonLine,
  parseExportFormat,
  sanitizeExportBasename,
  utcDateStamp,
} from "@utils/export-encode";
import {
  isChunkedExportResponse,
  streamingExportResponse,
} from "@src/routes/api/[...path]/handlers/streaming";

describe("export-encode", () => {
  it("quotes CSV cells that contain commas, quotes, or newlines", () => {
    expect(encodeCsvField("plain")).toBe("plain");
    expect(encodeCsvField("a,b")).toBe('"a,b"');
    expect(encodeCsvField('say "hi"')).toBe('"say ""hi"""');
    expect(encodeCsvField("line\nbreak")).toBe('"line\nbreak"');
    expect(encodeCsvField(null)).toBe("");
    expect(encodeCsvField({ en: "Hello" })).toBe('"{""en"":""Hello""}"');
  });

  it("builds a stable CSV header from system + schema columns", () => {
    const columns = collectExportColumns([
      { db_fieldName: "title" },
      { db_fieldName: "_id" },
      { db_fieldName: "body" },
    ]);
    expect(columns[0]).toBe("_id");
    expect(columns).toContain("title");
    expect(columns).toContain("body");
    expect(columns.filter((c) => c === "_id")).toHaveLength(1);
    expect(encodeCsvHeader(["_id", "title"])).toBe("_id,title\n");
  });

  it("encodes a CSV row in column order", () => {
    const row = csvRowFromRecord({ _id: "1", title: "Hello, world", missing: "x" }, [
      "_id",
      "title",
      "status",
    ]);
    expect(row).toBe('1,"Hello, world",\n');
  });

  it("encodes one NDJSON line per record", () => {
    expect(encodeNdjsonLine({ _id: "1", title: "Hi" })).toBe('{"_id":"1","title":"Hi"}\n');
  });

  it("sanitizes download basenames and parses format", () => {
    expect(sanitizeExportBasename("../posts")).toBe(".._posts");
    expect(sanitizeExportBasename("my posts!")).toBe("my_posts_");
    expect(parseExportFormat("csv")).toBe("csv");
    expect(parseExportFormat("ndjson")).toBe("ndjson");
    expect(parseExportFormat("nope")).toBe("json");
  });
});

describe("streamingExportResponse", () => {
  async function* records() {
    yield { _id: "1", title: "One" };
    yield { _id: "2", title: "Two, too" };
  }

  it("streams NDJSON without wrapping in a JSON array", async () => {
    const res = streamingExportResponse(records(), {
      format: "ndjson",
      filename: "posts.ndjson",
    });
    expect(res.headers.get("Content-Type")).toContain("ndjson");
    expect(res.headers.get("Content-Disposition")).toContain("posts.ndjson");
    const body = await res.text();
    expect(body).toBe('{"_id":"1","title":"One"}\n{"_id":"2","title":"Two, too"}\n');
  });

  it("streams CSV with a header row", async () => {
    const res = streamingExportResponse(records(), {
      format: "csv",
      filename: "posts.csv",
      columns: ["_id", "title"],
    });
    expect(res.headers.get("Content-Type")).toContain("text/csv");
    const body = await res.text();
    expect(body).toBe('_id,title\n1,One\n2,"Two, too"\n');
  });

  it("marks export streams so the dispatcher must not buffer them for ETags", async () => {
    const ndjson = streamingExportResponse(records(), {
      format: "ndjson",
      filename: "posts.ndjson",
    });
    const csv = streamingExportResponse(records(), {
      format: "csv",
      filename: "posts.csv",
      columns: ["_id"],
    });
    expect(isChunkedExportResponse(ndjson)).toBe(true);
    expect(isChunkedExportResponse(csv)).toBe(true);
    expect(
      isChunkedExportResponse(
        new Response("{}", { headers: { "content-type": "application/json" } }),
      ),
    ).toBe(false);
    // Body is still readable after the header check (dispatcher must not consume it).
    const text = await ndjson.text();
    expect(text).toContain('{"_id":"1"');
  });

  it("streams 1500 NDJSON rows without wrapping in an array", async () => {
    async function* many() {
      for (let i = 0; i < 1500; i++) yield { _id: String(i), n: i };
    }
    const body = await streamingExportResponse(many(), {
      format: "ndjson",
      filename: "big.ndjson",
    }).text();
    const lines = body.split("\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(1500);
    expect(lines[0]).toBe('{"_id":"0","n":0}');
    expect(lines[1499]).toBe('{"_id":"1499","n":1499}');
    expect(body.startsWith("[")).toBe(false);
  });

  it("streams 1500 CSV rows plus a header", async () => {
    async function* many() {
      for (let i = 0; i < 1500; i++) yield { _id: String(i), title: `row-${i}` };
    }
    const body = await streamingExportResponse(many(), {
      format: "csv",
      filename: "big.csv",
      columns: ["_id", "title"],
    }).text();
    const lines = body.split("\n").filter((l) => l.length > 0);
    expect(lines).toHaveLength(1501);
    expect(lines[0]).toBe("_id,title");
    expect(lines[1]).toBe("0,row-0");
    expect(lines[1500]).toBe("1499,row-1499");
  });

  it("emits a CSV header on an empty cursor and stamps UTC dates without toISOString", async () => {
    async function* none(): AsyncGenerator<Record<string, unknown>> {
      // empty
    }
    const body = await streamingExportResponse(none(), {
      format: "csv",
      filename: "empty.csv",
      columns: ["_id", "title"],
    }).text();
    expect(body).toBe("_id,title\n");
    const stamped = utcDateStamp(new Date(Date.UTC(2026, 8, 3, 22, 0, 0)));
    expect(stamped).toBe("2026-09-03");
    expect(stamped.includes("T")).toBe(false);
  });
});
