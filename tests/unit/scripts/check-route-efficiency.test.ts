/**
 * @file tests/unit/scripts/check-route-efficiency.test.ts
 * @description Fixtures for the route-efficiency scanner.
 *
 * Both rules are advisory heuristics, but they only stay useful if their
 * boundaries are exact: a whitelisted raw-DB route must stay quiet, three awaits
 * must not look like a waterfall, and the reported line must point at the first
 * await of the run rather than the statement that ended it.
 */

import { describe, expect, it } from "vitest";
import { scanRouteSource } from "../../../scripts/check/check-route-efficiency";

const ROUTE = "src/routes/(app)/dashboard/+page.server.ts";

describe("direct dbAdapter access", () => {
  it("flags every raw adapter call in a normal server route", () => {
    const source = [
      "export async function load() {",
      "  const users = await dbAdapter.crud.findMany('users');",
      "  const settings = await dbAdapter.system.get();",
      "  return { users, settings };",
      "}",
    ].join("\n");

    const violations = scanRouteSource(ROUTE, source);

    expect(violations.map((violation) => violation.type)).toEqual([
      "DIRECT_DB_ACCESS",
      "DIRECT_DB_ACCESS",
    ]);
    expect(violations.map((violation) => violation.line)).toEqual([2, 3]);
    expect(violations[0]?.message).toContain("Prefer LocalCMS / CMS namespace");
    expect(violations.every((violation) => violation.severity === "advisory")).toBe(true);
  });

  it("keeps the whitelisted API bridge quiet", () => {
    const source = "const row = await dbAdapter.crud.findMany('users');";

    expect(scanRouteSource("src/routes/api/[...path]/+server.ts", source)).toEqual([]);
    expect(scanRouteSource("src/routes/api/testing/+server.ts", source)).toEqual([]);
  });

  it("exempts any route under a testing/ directory", () => {
    const source = "const row = await dbAdapter.auth.findById('u1');";

    expect(scanRouteSource("src/routes/api/internal/testing/+server.ts", source)).toEqual([]);
  });

  it("ignores unrelated adapters and client code", () => {
    const source = [
      "const client = dbAdapter;",
      "const media = dbAdapter.media.findMany();",
      "const local = cms.content.findMany();",
    ].join("\n");

    expect(scanRouteSource(ROUTE, source)).toEqual([]);
  });
});

describe("sequential await waterfall", () => {
  it("flags four consecutive awaits at the first line of the run", () => {
    const source = [
      "export async function load() {",
      "  const a = await loadA();",
      "  const b = await loadB();",
      "  const c = await loadC();",
      "  const d = await loadD();",
      "  return { a, b, c, d };",
      "}",
    ].join("\n");

    const violations = scanRouteSource(ROUTE, source);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatchObject({
      type: "SEQUENTIAL_AWAIT_WATERFALL",
      line: 2,
      severity: "advisory",
    });
    expect(violations[0]?.message).toBe(
      "4 sequential await statements detected. Consider parallelizing with Promise.all().",
    );
  });

  it("does not flag three awaits", () => {
    const source = [
      "const a = await loadA();",
      "const b = await loadB();",
      "const c = await loadC();",
      "return a;",
    ].join("\n");

    expect(scanRouteSource(ROUTE, source)).toEqual([]);
  });

  it("ignores Promise.all batches and dynamic imports", () => {
    const source = [
      "const all = await Promise.all([loadA(), loadB()]);",
      'const mod = await import("$lib/server/mod");',
      "const x = await loadX();",
      "const y = await loadY();",
      "return all;",
    ].join("\n");

    expect(scanRouteSource(ROUTE, source)).toEqual([]);
  });

  it("keeps counting across comments and blank lines", () => {
    const source = [
      "const a = await loadA();",
      "const b = await loadB();",
      "",
      "// independent reads should be batched",
      "const c = await loadC();",
      "const d = await loadD();",
      "return a;",
    ].join("\n");

    const violations = scanRouteSource(ROUTE, source);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.line).toBe(1);
  });

  it("reports separate waterfalls in one file", () => {
    const source = [
      "const a = await loadA();",
      "const b = await loadB();",
      "const c = await loadC();",
      "const d = await loadD();",
      "return a;",
      "const e = await loadE();",
      "const f = await loadF();",
      "const g = await loadG();",
      "const h = await loadH();",
      "return h;",
    ].join("\n");

    const violations = scanRouteSource(ROUTE, source);

    expect(violations.map((violation) => violation.line)).toEqual([1, 6]);
  });
});
