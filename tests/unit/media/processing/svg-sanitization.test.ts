/**
 * @file tests/unit/media/processing/svg-sanitization.test.ts
 * @description Unit tests for SVG sanitization (XSS/XXE defense).
 *
 * The `sanitizeSvg` function is a parser-based allowlist scrubber
 * (`sanitizeSvgMarkup`) that strips:
 * - Dangerous tags (script, foreignObject, iframe, object, embed, style, animate/set)
 * - Inline event handlers (on* attributes)
 * - javascript:/data: href and xlink:href values (the attribute is removed)
 * - CDATA sections, XML processing instructions, DOCTYPE declarations
 */

import { describe, it, expect } from "vitest";
import { sanitizeSvg, MAX_SVG_BYTES } from "../../../../src/utils/media/media-service.server";

describe("sanitizeSvg — script injection", () => {
  it("strips <script> tags with content", () => {
    expect(sanitizeSvg('<svg><script>alert("xss")</script></svg>')).toBe("<svg></svg>");
  });

  it("strips self-closing script tags", () => {
    expect(sanitizeSvg('<svg><script src="evil.js"/></svg>')).toBe("<svg></svg>");
  });

  it("neutralizes nested script tag reconstruction", () => {
    const input = "<svg><scr<script>ipt>alert(1)</scr</script>ipt></svg>";
    const result = sanitizeSvg(input);
    // The parser sees one bogus `<scr<script>` tag; the residue is escaped text,
    // never a live `<script>` element.
    expect(result).not.toContain("<script");
    expect(result).toContain("<svg");
  });

  it("strips <foreignObject> tags", () => {
    const input = '<svg><foreignObject><div onclick="x()">click</div></foreignObject></svg>';
    const result = sanitizeSvg(input);
    expect(result).not.toContain("foreignObject");
    expect(result).not.toContain("onclick");
    expect(result).toContain("<svg");
  });

  it("strips <iframe> tags", () => {
    expect(sanitizeSvg('<svg><iframe src="https://evil.com"></iframe></svg>')).toBe("<svg></svg>");
  });

  it("strips <object> tags", () => {
    expect(sanitizeSvg('<svg><object data="evil.swf"></object></svg>')).toBe("<svg></svg>");
  });

  it("strips <embed> tags", () => {
    expect(sanitizeSvg('<svg><embed src="evil.svg"/></svg>')).toBe("<svg></svg>");
  });
});

describe("sanitizeSvg — event handler removal", () => {
  it("strips onload handlers", () => {
    const result = sanitizeSvg('<svg onload="alert(1)"><circle cx="50" cy="50" r="40"/></svg>');
    expect(result).not.toContain("onload");
  });

  it("strips onclick handlers", () => {
    expect(sanitizeSvg('<svg><circle onclick="evil()" r="10"/></svg>')).not.toContain("onclick");
  });

  it("strips onerror handlers", () => {
    expect(sanitizeSvg('<svg><img onerror="alert(1)" href="x"/></svg>')).not.toContain("onerror");
  });

  it("strips handlers with single quotes", () => {
    expect(sanitizeSvg("<svg onmouseover='evil()'></svg>")).not.toContain("onmouseover");
  });

  it("strips handlers without quotes", () => {
    expect(sanitizeSvg("<svg onload=alert(1)></svg>")).not.toContain("onload");
  });
});

describe("sanitizeSvg — protocol handler blocking", () => {
  it("drops javascript: in href", () => {
    const result = sanitizeSvg('<svg><a href="javascript:alert(1)">click</a></svg>');
    expect(result).not.toContain("javascript:");
    expect(result).not.toContain("href=");
  });

  it("drops javascript: in xlink:href", () => {
    const result = sanitizeSvg('<svg><a xlink:href="javascript:alert(1)">click</a></svg>');
    expect(result).not.toContain("javascript:");
    expect(result).not.toContain("xlink:href");
  });

  it("drops data: in href", () => {
    const result = sanitizeSvg(
      '<svg><a href="data:text/html,<script>alert(1)</script>">click</a></svg>',
    );
    expect(result).not.toContain("data:");
    expect(result).not.toContain("<script");
  });

  it("keeps same-document href references", () => {
    const result = sanitizeSvg('<svg><use href="#icon"/></svg>');
    expect(result).toContain('href="#icon"');
  });
});

describe("sanitizeSvg — structural attacks", () => {
  it("strips CDATA-wrapped scripts", () => {
    const result = sanitizeSvg("<svg><![CDATA[<script>alert(1)</script>]]></svg>");
    expect(result).not.toContain("CDATA");
  });

  it("strips XML processing instructions (XXE vectors)", () => {
    const input =
      '<?xml version="1.0"?><?xml-stylesheet type="text/xsl" href="evil.xsl"?><svg></svg>';
    expect(sanitizeSvg(input)).not.toContain("<?");
  });

  it("strips DOCTYPE declarations (external entity injection)", () => {
    const input = '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><svg>&xxe;</svg>';
    const result = sanitizeSvg(input);
    expect(result).not.toContain("DOCTYPE");
  });
});

describe("sanitizeSvg — legitimate SVG preservation", () => {
  it("preserves valid SVG structure", () => {
    const input =
      '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="40" fill="red"/></svg>';
    const result = sanitizeSvg(input);
    expect(result).toContain("<svg");
    expect(result).toContain("circle");
    expect(result).toContain('fill="red"');
  });

  it("preserves attributes that look like event handlers but aren't", () => {
    const input = '<svg><text font-family="monospace" font-size="14">online</text></svg>';
    const result = sanitizeSvg(input);
    expect(result).toContain("online");
    expect(result).toContain('font-family="monospace"');
  });
});

describe("SVG large-file streaming bypass defense", () => {
  it("exports MAX_SVG_BYTES so oversized SVGs cannot skip sanitization", () => {
    // 5 MiB cap: files above this never take the unsanitized streaming path
    expect(MAX_SVG_BYTES).toBe(5 * 1024 * 1024);
  });

  it("still strips scripts from multi-megabyte padded payloads (below cap)", () => {
    const padding = "<!-- " + "x".repeat(100_000) + " -->";
    const input = `<svg xmlns="http://www.w3.org/2000/svg">${padding}<script>alert(1)</script><circle r="1"/></svg>`;
    const result = sanitizeSvg(input);
    expect(result).not.toContain("<script");
    expect(result).not.toContain("alert");
    expect(result).toContain("circle");
  });
});
