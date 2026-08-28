/**
 * @file tests/unit/security/sanitize-svg.test.ts
 * @description Regression tests for sanitizeSvg (stored-XSS defense for SVG uploads).
 *
 * Covers the bypass classes from the 2026-08 audit:
 * - no-space tag-name bypass `<script/src=…>` and bare `<script/>`
 * - event handlers injected after a closed quoted value `<image href="x"onload=…>`
 * - CDATA / processing-instruction / DOCTYPE stripping
 */

import { describe, it, expect } from "vitest";
import { sanitizeSvg } from "@src/utils/media/media-service.server";

describe("sanitizeSvg — dangerous tags", () => {
  it("strips paired script/iframe/object/embed with content", () => {
    expect(sanitizeSvg("<svg><script>alert(1)</script></svg>")).toBe("<svg></svg>");
    expect(sanitizeSvg("<svg><script src=x>alert(1)</script></svg>")).toBe("<svg></svg>");
    expect(sanitizeSvg("<svg><iframe src='https://evil'></iframe></svg>")).toBe("<svg></svg>");
  });

  it("strips the no-space tag-name bypass <script/src=…>", () => {
    expect(sanitizeSvg("<svg><script/src=x></script></svg>")).toBe("<svg></svg>");
    expect(sanitizeSvg("<svg><script/src=x/>alert(1)</svg>")).toBe("<svg>alert(1)</svg>");
  });

  it("strips bare self-closing <script/>", () => {
    expect(sanitizeSvg("<svg><script/></svg>")).toBe("<svg></svg>");
    expect(sanitizeSvg("<svg><script/>alert(1)</svg>")).toBe("<svg>alert(1)</svg>");
  });
});

describe("sanitizeSvg — event handlers", () => {
  it("strips whitespace-separated handlers", () => {
    expect(sanitizeSvg('<svg><image href="x" onload="alert(1)"/></svg>')).toBe(
      '<svg><image href="x"/></svg>',
    );
  });

  it("strips handlers injected after a closed quoted value", () => {
    expect(sanitizeSvg('<svg><image href="x"onload="alert(1)"/></svg>')).toBe(
      '<svg><image href="x"/></svg>',
    );
    expect(sanitizeSvg('<svg><circle cx="1"onclick="alert(1)"/></svg>')).toBe(
      '<svg><circle cx="1"/></svg>',
    );
  });

  it("does not mangle harmless SVG content", () => {
    const input = '<svg><text>x="1" y="2">hi</text></svg>';
    expect(sanitizeSvg(input)).toBe(input);
  });
});

describe("sanitizeSvg — protocol / markup vectors", () => {
  it("blocks javascript: and data: in href/xlink:href", () => {
    expect(sanitizeSvg('<svg><a xlink:href="javascript:alert(1)">t</a></svg>')).toContain(
      "#blocked",
    );
    expect(sanitizeSvg('<svg><a href="data:text/html;base64,PHNjcmlwdD4=">t</a></svg>')).toContain(
      "#blocked",
    );
  });

  it("strips CDATA blocks, processing instructions and DOCTYPE", () => {
    expect(sanitizeSvg("<svg><![CDATA[<script>alert(1)</script>]]></svg>")).toBe("<svg></svg>");
    expect(sanitizeSvg("<?xml version='1.0'?><svg></svg>")).toBe("<svg></svg>");
    // DOCTYPE: assert vector absence — the exact residue depends on where the
    // first `>` falls (entity declarations may contain one).
    expect(
      sanitizeSvg('<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg/>'),
    ).not.toContain("DOCTYPE");
  });

  it("keeps safe SVG intact", () => {
    const input = '<svg viewBox="0 0 100 100"><rect width="10" height="10" fill="#ff0000"/></svg>';
    expect(sanitizeSvg(input)).toBe(input);
  });

  it("is idempotent on sanitized output", () => {
    const input = '<svg><script/src=x></script><image href="x"onload="alert(1)"/></svg>';
    const once = sanitizeSvg(input);
    expect(sanitizeSvg(once)).toBe(once);
  });
});
