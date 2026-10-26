/**
 * @file tests/unit/plugins/csv-detect.test.ts
 * @description Detection contract for generic CSV/TSV uploads in the migration wizard.
 *
 * A plain spreadsheet used to fall through every detection branch and arrive as
 * "unknown" with no field mappings. These cases pin delimiter sniffing, header
 * inference (including German column names), and the row estimate.
 */

import { describe, expect, it } from "vitest";
import {
  countCsvRows,
  detectCsv,
  detectDelimiter,
  parseDelimitedRow,
  splitDelimitedRows,
} from "@plugins/smart-importer/csv-detect";

describe("csv detection", () => {
  it("sniffs comma, semicolon, tab, and pipe delimiters", () => {
    expect(detectDelimiter("title,slug,body")).toBe(",");
    expect(detectDelimiter("Titel;Inhalt;Datum")).toBe(";");
    expect(detectDelimiter("title\tslug\tbody")).toBe("\t");
    expect(detectDelimiter("title|slug|body")).toBe("|");
    expect(detectDelimiter("just-one-column")).toBeNull();
  });

  it("parses quoted headers with escaped quotes", () => {
    expect(parseDelimitedRow('"Title","Body, long","He said ""hi"""', ",")).toEqual([
      "Title",
      "Body, long",
      'He said "hi"',
    ]);
  });

  it("maps English headers to targets and keeps unknown columns", () => {
    const result = detectCsv("title,slug,body,legacy_code\nHello,/hello,<p>Hi</p>,X1\n");
    expect(result).not.toBeNull();
    expect(result?.delimiter).toBe(",");
    expect(result?.headers).toEqual(["title", "slug", "body", "legacy_code"]);
    expect(result?.mappings).toEqual([
      { source: "title", target: "title", confidence: 92, type: "text" },
      { source: "slug", target: "slug", confidence: 90, type: "text" },
      { source: "body", target: "content", confidence: 88, type: "richtext" },
      { source: "legacy_code", target: "legacy_code", confidence: 55, type: "text" },
    ]);
    expect(result?.estimatedCount).toBe(1);
  });

  it("maps common German headers and semicolon files", () => {
    const result = detectCsv("Titel;Beschreibung;Datum;Autor\nHallo;Welt;2026-01-01;Ada\n");
    expect(result?.delimiter).toBe(";");
    expect(result?.mappings.map((m) => m.target)).toEqual([
      "title",
      "content",
      "createdAt",
      "author",
    ]);
  });

  it("prefers an exact alias and does not map two columns to one target", () => {
    const result = detectCsv("Name,Post Title,Body\nA,B,C\n");
    expect(result?.mappings.map((m) => m.target)).toEqual(["title", "post_title", "content"]);
  });

  it("finds the header below a report-title preamble", () => {
    const result = detectCsv(
      "Bericht-Snapshot\nErstellt am 2026-10-25\n\ntitle;slug\nHallo;/hallo\n",
    );
    expect(result?.delimiter).toBe(";");
    expect(result?.headers).toEqual(["title", "slug"]);
    expect(result?.estimatedCount).toBe(1);
  });

  it("rejects non-tabular input", () => {
    expect(detectCsv('{"a":1}')).toBeNull();
    expect(detectCsv("single column\nvalue")).toBeNull();
  });

  it("estimates rows with and without a trailing newline", () => {
    expect(countCsvRows("a,b\n1,2\n3,4\n", true)).toBe(2);
    expect(countCsvRows("a,b\n1,2\n3,4", false)).toBe(2);
  });

  it("ignores line breaks inside quoted cells when counting records", () => {
    expect(countCsvRows('a,b\n"x\ny",2\nz,3\n', true)).toBe(2);
  });

  it("splits rows without breaking quoted multi-line cells", () => {
    expect(splitDelimitedRows('a,b\r\n"x\r\ny",2\r\nz,3\r\n', ",")).toEqual([
      ["a", "b"],
      ["x\r\ny", "2"],
      ["z", "3"],
    ]);
    expect(splitDelimitedRows('"He said ""hi""",ok', ",")).toEqual([['He said "hi"', "ok"]]);
    expect(splitDelimitedRows("", ",")).toEqual([]);
  });

  it("honours an explicit tab delimiter for TSV", () => {
    const result = detectCsv("title\tslug\nHello\thello", "\t");
    expect(result?.headers).toEqual(["title", "slug"]);
    expect(result?.estimatedCount).toBe(1);
  });
});
