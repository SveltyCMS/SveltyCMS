/**
 * @file tests/unit/widgets/widget-compatibility.test.ts
 * @description Import-time Name / version / CMS-range contract for widgets and packages.
 */

import { describe, expect, it } from "vitest";
import { string } from "valibot";
import { createWidget } from "@src/widgets/widget-factory";
import {
  assertPackageCompatibleWithCms,
  getCmsVersion,
  satisfiesCmsRange,
  validatePackageCompatibility,
  validateWidgetImport,
} from "@src/widgets/widget-compatibility";

describe("satisfiesCmsRange", () => {
  it("matches >= / caret / exact", () => {
    expect(satisfiesCmsRange("0.0.8", ">=0.0.8")).toBe(true);
    expect(satisfiesCmsRange("0.0.8", ">=0.0.9")).toBe(false);
    expect(satisfiesCmsRange("0.0.8", "^0.0.8")).toBe(true);
    expect(satisfiesCmsRange("0.0.9", "^0.0.8")).toBe(false);
    expect(satisfiesCmsRange("0.0.8", "0.0.8")).toBe(true);
    expect(satisfiesCmsRange("1.2.3", "^1.0.0")).toBe(true);
    expect(satisfiesCmsRange("2.0.0", "^1.0.0")).toBe(false);
  });
});

describe("validateWidgetImport", () => {
  it("rejects missing Name", () => {
    const r = validateWidgetImport(
      { version: "1.0.0", validationSchema: true },
      { tier: "custom" },
    );
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("Name"))).toBe(true);
  });

  it("rejects marketplace packages without a CMS range", () => {
    const r = validateWidgetImport(
      { Name: "PhoneNumber", version: "1.2.0", validationSchema: true },
      { tier: "marketplace", cmsVersion: "0.0.8" },
    );
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("sveltycms"))).toBe(true);
  });

  it("rejects a CMS range this host does not satisfy", () => {
    const r = validateWidgetImport(
      {
        Name: "PhoneNumber",
        version: "1.2.0",
        sveltycms: ">=1.0.0",
        validationSchema: true,
      },
      { tier: "marketplace", cmsVersion: "0.0.8" },
    );
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes("Incompatible"))).toBe(true);
  });

  it("accepts a marketplace widget with Name, version, and matching range", () => {
    const r = validateWidgetImport(
      {
        Name: "PhoneNumber",
        version: "1.2.0",
        sveltycms: ">=0.0.8",
        validationSchema: true,
      },
      { tier: "marketplace", cmsVersion: "0.0.8" },
    );
    expect(r.ok).toBe(true);
  });
});

describe("validatePackageCompatibility", () => {
  it("blocks marketplace install when requiresSveltyCMS is missing", () => {
    const r = validatePackageCompatibility({ name: "Audit Log", version: "1.0.0" });
    expect(r.ok).toBe(false);
  });

  it("throws from assertPackageCompatibleWithCms on mismatch", () => {
    expect(() =>
      assertPackageCompatibleWithCms({
        name: "Legacy",
        version: "1.0.0",
        requiresSveltyCMS: ">=9.0.0",
      }),
    ).toThrow(/not compatible/);
  });

  it("allows a matching requiresSveltyCMS range", () => {
    expect(() =>
      assertPackageCompatibleWithCms({
        name: "Audit Log",
        version: "1.0.0",
        requiresSveltyCMS: `>=${getCmsVersion()}`,
      }),
    ).not.toThrow();
  });
});

describe("createWidget import contract", () => {
  it("throws when Name is missing", () => {
    expect(() => createWidget({ Name: "", validationSchema: string() } as never)).toThrow(/Name/);
  });

  it("throws when sveltycms does not match this CMS", () => {
    expect(() =>
      createWidget({
        Name: "BadRange",
        validationSchema: string(),
        sveltycms: ">=99.0.0",
      }),
    ).toThrow(/Incompatible/);
  });

  it("stamps version when omitted on in-tree widgets", () => {
    const w = createWidget({ Name: "HasName", validationSchema: string() });
    expect(w.Name).toBe("HasName");
    expect(w.version).toBe("1.0.0");
  });
});
