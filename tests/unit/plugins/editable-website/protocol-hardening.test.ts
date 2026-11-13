/**
 * @file tests/unit/plugins/editable-website/protocol-hardening.test.ts
 * @description Pure helpers that make the Live Preview bridge safe and
 * bidirectional: version compatibility, frame target-origin resolution and
 * CMS→preview field identification.
 */
import { describe, expect, it } from "vitest";
import {
  fieldNameFromElement,
  isCmsInboundMessage,
  isCompatibleProtocolVersion,
  resolveFrameTargetOrigin,
} from "@src/plugins/editable-website/protocol";

describe("isCompatibleProtocolVersion", () => {
  it("accepts the same major (minor/patch may differ)", () => {
    expect(isCompatibleProtocolVersion("1.2.0", "1.2.0")).toBe(true);
    expect(isCompatibleProtocolVersion("1.9.4", "1.2.0")).toBe(true);
  });

  it("rejects a different major", () => {
    expect(isCompatibleProtocolVersion("2.0.0", "1.2.0")).toBe(false);
  });

  it("tolerates a legacy bridge that omits the version", () => {
    expect(isCompatibleProtocolVersion(undefined, "1.2.0")).toBe(true);
    expect(isCompatibleProtocolVersion("", "1.2.0")).toBe(true);
    expect(isCompatibleProtocolVersion(42, "1.2.0")).toBe(true);
  });
});

describe("resolveFrameTargetOrigin", () => {
  it("returns the origin of an absolute preview URL", () => {
    expect(resolveFrameTargetOrigin("https://site.example/preview?x=1")).toBe(
      "https://site.example",
    );
  });

  it("resolves a relative URL against the fallback", () => {
    expect(resolveFrameTargetOrigin("/preview", "http://localhost:5173")).toBe(
      "http://localhost:5173",
    );
  });

  it("returns null instead of falling back to '*'", () => {
    expect(resolveFrameTargetOrigin("")).toBeNull();
    expect(resolveFrameTargetOrigin("not a url")).toBeNull();
  });
});

describe("fieldNameFromElement", () => {
  const el = (id: string, name?: string | null) =>
    ({
      id,
      getAttribute: (key: string) => (key === "name" ? (name ?? null) : null),
    }) as unknown as HTMLElement;

  it("prefers the control id (the form ids controls by db_fieldName)", () => {
    expect(fieldNameFromElement(el("heroHeading", "other"))).toBe("heroHeading");
  });

  it("falls back to the name attribute", () => {
    expect(fieldNameFromElement(el("", "heroSubheading"))).toBe("heroSubheading");
  });

  it("returns null for a missing or empty identity", () => {
    expect(fieldNameFromElement(null)).toBeNull();
    expect(fieldNameFromElement(el("  ", null))).toBeNull();
  });
});

describe("isCmsInboundMessage", () => {
  it("accepts the navigation message the site bridge posts", () => {
    expect(isCmsInboundMessage({ type: "svelty:navigate", href: "/about" })).toBe(true);
  });

  it("still rejects unknown message types", () => {
    expect(isCmsInboundMessage({ type: "svelty:unknown" })).toBe(false);
    expect(isCmsInboundMessage(null)).toBe(false);
  });
});
