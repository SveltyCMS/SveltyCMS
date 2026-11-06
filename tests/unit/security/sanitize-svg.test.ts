/**
 * @file tests/unit/security/sanitize-svg.test.ts
 * @description Regression tests for sanitizeSvg (stored-XSS defense for SVG uploads).
 *
 * The scrubber is now a parser-based allowlist (`sanitizeSvgMarkup`). Covers:
 * - script / foreignObject / iframe / object / embed removal
 * - malformed no-space tag variants `<script/src=…>` and bare `<script/>`
 * - event handlers (including post-quote injection)
 * - javascript:/data: href removal; same-document `#id` references preserved
 * - CDATA / processing-instruction / DOCTYPE neutralization
 * - round-trip of camelCase attributes (`viewBox`) and `xlink:href="#…"`
 */

import { describe, it, expect } from "vitest";
import { sanitizeSvg } from "@src/utils/media/media-service.server";
import { sanitizeSvgMarkup } from "@src/utils/sanitize-html.server";

describe("sanitizeSvg — dangerous tags", () => {
  it("strips paired script/iframe/object/embed with content", () => {
    expect(sanitizeSvg("<svg><script>alert(1)</script></svg>")).toBe("<svg></svg>");
    expect(sanitizeSvg("<svg><script src=x>alert(1)</script></svg>")).toBe("<svg></svg>");
    expect(sanitizeSvg("<svg><iframe src='https://evil'></iframe></svg>")).toBe("<svg></svg>");
  });

  it("strips the no-space tag-name bypass <script/src=…>", () => {
    expect(sanitizeSvg("<svg><script/src=x></script></svg>")).toBe("<svg></svg>");
    // An unclosed script element consumes the remaining text as script content.
    expect(sanitizeSvg("<svg><script/src=x/>alert(1)</svg>")).toBe("<svg></svg>");
  });

  it("strips bare self-closing <script/>", () => {
    expect(sanitizeSvg("<svg><script/></svg>")).toBe("<svg></svg>");
    expect(sanitizeSvg("<svg><script/>alert(1)</svg>")).toBe("<svg>alert(1)</svg>");
  });

  it("strips foreignObject content (no HTML re-entry)", () => {
    const out = sanitizeSvg(
      "<svg><foreignObject><body><img src=x onerror=alert(1)></body></foreignObject></svg>",
    );
    expect(out).not.toContain("foreignObject");
    expect(out).not.toContain("onerror");
    expect(out).toContain("<svg");
  });

  it("strips animate and set (SMIL execution vectors)", () => {
    expect(
      sanitizeSvg('<svg><animate attributeName="href" to="javascript:alert(1)"/></svg>'),
    ).not.toContain("animate");
    expect(sanitizeSvg('<svg><set attributeName="onload" to="alert(1)"/></svg>')).not.toContain(
      "<set",
    );
  });
});

describe("sanitizeSvg — event handlers", () => {
  it("strips whitespace-separated handlers", () => {
    const out = sanitizeSvg('<svg><image href="x" onload="alert(1)"/></svg>');
    expect(out).not.toContain("onload");
  });

  it("strips handlers injected after a closed quoted value", () => {
    expect(sanitizeSvg('<svg><circle cx="1"onclick="alert(1)"/></svg>')).not.toContain("onclick");
    const out = sanitizeSvg('<svg><use href="#icon"onload="alert(1)"/></svg>');
    expect(out).not.toContain("onload");
    expect(out).toContain('href="#icon"');
  });

  it("does not mangle harmless SVG content", () => {
    const input = '<svg><text x="1" y="2">hi</text></svg>';
    expect(sanitizeSvg(input)).toBe(input);
  });
});

describe("sanitizeSvg — protocol / markup vectors", () => {
  it("drops javascript: and data: hrefs entirely", () => {
    expect(sanitizeSvg('<svg><a xlink:href="javascript:alert(1)">t</a></svg>')).not.toContain(
      "javascript:",
    );
    expect(
      sanitizeSvg('<svg><use href="data:text/html;base64,PHNjcmlwdD4="/></svg>'),
    ).not.toContain("data:");
  });

  it("keeps same-document references and viewBox (no mangling)", () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 10 10"><use xlink:href="#icon"/><use href="#other"/></svg>';
    const out = sanitizeSvg(input);
    expect(out).toContain('viewBox="0 0 10 10"');
    expect(out).toContain('xlink:href="#icon"');
    expect(out).toContain('href="#other"');
  });

  it("neutralizes CDATA-wrapped scripts", () => {
    const out = sanitizeSvg("<svg><![CDATA[<script>alert(1)</script>]]></svg>");
    expect(out).not.toContain("CDATA");
    expect(out).not.toContain("<script");
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
    expect(result).not.toContain("SYSTEM");
  });

  it("keeps safe SVG intact", () => {
    const input = '<svg viewBox="0 0 100 100"><rect width="10" height="10" fill="#ff0000"/></svg>';
    const out = sanitizeSvg(input);
    expect(out).toContain('viewBox="0 0 100 100"');
    expect(out).toContain('<rect width="10" height="10" fill="#ff0000">');
    expect(out).toContain("</svg>");
  });

  it("is idempotent on sanitized output", () => {
    const input = '<svg><script/src=x></script><use href="#icon"onload="alert(1)"/></svg>';
    const once = sanitizeSvg(input);
    expect(sanitizeSvg(once)).toBe(once);
  });

  it("sanitizeSvgMarkup is the shared implementation", () => {
    const input = '<svg><script>alert(1)</script><rect width="1"/></svg>';
    expect(sanitizeSvg(input)).toBe(sanitizeSvgMarkup(input));
  });
});
