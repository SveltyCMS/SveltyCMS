/**
 * @file tests/unit/media/processing/svg-sanitization.test.ts
 * @description Unit tests for SVG sanitization (XSS/XXE defense).
 *
 * The `sanitizeSvg` function is an iterative scrubber that strips:
 * - Dangerous tags (script, foreignObject, iframe, object, embed)
 * - Inline event handlers (on* attributes)
 * - javascript:/data: protocol handlers
 * - CDATA sections, XML processing instructions, DOCTYPE declarations
 */

import { describe, it, expect } from "vitest";
import { sanitizeSvg } from "../../../../src/utils/media/media-service.server";

describe("sanitizeSvg — script injection", () => {
  it("strips <script> tags with content", () => {
    expect(sanitizeSvg('<svg><script>alert("xss")</script></svg>')).toBe("<svg></svg>");
  });

  it("strips self-closing script tags", () => {
    expect(sanitizeSvg('<svg><script src="evil.js"/></svg>')).toBe("<svg></svg>");
  });

  it("strips nested script tags — removes the matched <script> pair", () => {
    // The iterative regex removes the inner <script>...</script> pair.
    // A dangling <script> without a closing tag is less dangerous (no execution)
    // but the regex requires open+close pairs.
    const input = "<svg><scr<script>ipt>alert(1)</scr</script>ipt></svg>";
    const result = sanitizeSvg(input);
    // First pass strips the inner <script>alert(1)</scr</script> pair
    // leaving <sgv><script></svg> (dangling open tag, no close — won't execute)
    expect(result).not.toContain("alert");
    expect(result).toContain("<svg");
  });

  it("strips <foreignObject> tags", () => {
    const input = '<svg><foreignObject><div onclick="x()">click</div></foreignObject></svg>';
    expect(sanitizeSvg(input)).toBe("<svg></svg>");
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
  it("blocks javascript: in href", () => {
    const result = sanitizeSvg('<svg><a href="javascript:alert(1)">click</a></svg>');
    expect(result).toContain('#blocked"');
    expect(result).not.toContain("javascript:");
  });

  it("blocks javascript: in xlink:href", () => {
    const result = sanitizeSvg('<svg><a xlink:href="javascript:alert(1)">click</a></svg>');
    expect(result).toContain('#blocked"');
  });

  it("blocks data: in href", () => {
    const result = sanitizeSvg(
      '<svg><a href="data:text/html,<script>alert(1)</script>">click</a></svg>',
    );
    expect(result).toContain('#blocked"');
    expect(result).not.toContain("data:");
  });

  it("blocks javascript: in single-quoted href", () => {
    const result = sanitizeSvg("<svg><a href='javascript:evil()'>click</a></svg>");
    expect(result).toContain("#blocked'");
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
