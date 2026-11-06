/**
 * @file tests/unit/security/sanitize-html.test.ts
 * @description Regression tests for the parser-based HTML/SVG sanitizers used
 * in `{@html}` sinks and upload pipelines.
 *
 * Covers the bypass classes from the 2026-08 audit and the new allowlist
 * behavior:
 * - nested reconstruction `<scr<script>ipt>` and malformed `<script/src=…>`
 * - entity-encoded tag names and URL schemes (`&#106;`, `&colon;`)
 * - self-closing / post-quote event handlers
 * - javascript:/vbscript:/data: URL attributes (dropped, never `#blocked` text)
 * - style attributes (dropped entirely)
 * - strict SVG allowlist: script, foreignObject, animate/set, on*, non-`#` href
 */

import { describe, it, expect } from "vitest";
import { sanitizeHtml, sanitizeSvgMarkup } from "@src/utils/sanitize-html.server";
import { stripHtml, decodeHtmlEntities } from "@src/utils/sanitize-html";

describe("sanitizeHtml — non-string input", () => {
  it("returns empty string for null, undefined and non-strings", () => {
    // Persisted rows can hold a localized `{ title, content }` object instead of
    // HTML. The render-side boundary must not throw on it (that was a 500 on `/`).
    expect(sanitizeHtml(undefined)).toBe("");
    expect(sanitizeHtml(null)).toBe("");
    expect(sanitizeHtml(42)).toBe("");
    expect(sanitizeHtml({ en: { title: "", content: "" } })).toBe("");
    expect(sanitizeHtml(["<p>x</p>"])).toBe("");
  });

  it("sanitizeSvgMarkup mirrors the guard", () => {
    expect(sanitizeSvgMarkup(undefined)).toBe("");
    expect(sanitizeSvgMarkup({ svg: "<svg/>" })).toBe("");
  });
});

describe("sanitizeHtml — dangerous tags", () => {
  it("strips paired dangerous tags with their content", () => {
    expect(sanitizeHtml("<script>alert(1)</script>")).toBe("");
    expect(sanitizeHtml("<iframe src='https://evil'></iframe><p>ok</p>")).toBe("<p>ok</p>");
    expect(sanitizeHtml("<SCRIPT>alert(1)</SCRIPT>")).toBe("");
  });

  it("strips self-closing dangerous tags", () => {
    expect(sanitizeHtml("<iframe src=x />")).toBe("");
    expect(sanitizeHtml("<embed src=x/>")).toBe("");
  });

  it("strips orphan closing tags", () => {
    expect(sanitizeHtml("x</script>y")).toBe("xy");
  });

  it("strips base and svg carriers, keeping inert text", () => {
    expect(sanitizeHtml("<base href='https://evil.com/'><a href='/x'>l</a>")).toBe(
      '<a href="/x">l</a>',
    );
    expect(sanitizeHtml("<svg><script>alert(1)</script></svg>")).toBe("");
    // math is not in the allowlist; its text content is inert.
    expect(sanitizeHtml("<math><mtext>hi</mtext></math>")).toBe("hi");
  });

  it("strips malformed no-space tag variants", () => {
    expect(sanitizeHtml("<script/src=x>alert(1)</script>")).not.toContain("alert");
    // Unclosed script is parsed as a non-text element and swallows the rest.
    expect(sanitizeHtml("<script/>alert(1)")).toBe("");
  });
});

describe("sanitizeHtml — event handlers", () => {
  it("strips whitespace-separated handlers", () => {
    expect(sanitizeHtml("<img src=x onerror=alert(1)>")).toBe('<img src="x" />');
    expect(sanitizeHtml('<a href="y" onclick="alert(1)">t</a>')).toBe('<a href="y">t</a>');
  });

  it("strips self-closing-bypass handlers (<img/onerror=…>)", () => {
    expect(sanitizeHtml("<img/onerror=alert(1) src=x>")).toBe('<img src="x" />');
    expect(sanitizeHtml("<svg/onload=alert(1)>")).toBe("");
  });

  it("strips handlers injected directly after a closed quoted value", () => {
    expect(sanitizeHtml('<img src="x"onerror=alert(1)>')).toBe('<img src="x" />');
    expect(sanitizeHtml('<a href="x"onclick=alert(1)>t</a>')).toBe('<a href="x">t</a>');
    expect(sanitizeHtml('<img src="x"/onerror=alert(1)>')).toBe('<img src="x" />');
    expect(sanitizeHtml('<img src="x"onerror=alert(1) onload=alert(2)>')).toBe('<img src="x" />');
  });

  it("does not corrupt a legit URL containing /on…", () => {
    expect(sanitizeHtml('<a href="https://x/onclick=1">t</a>')).toBe(
      '<a href="https://x/onclick=1">t</a>',
    );
  });

  it("keeps quoted text that merely looks like a handler", () => {
    expect(sanitizeHtml('<a title="one=two">x</a>')).toBe('<a title="one=two">x</a>');
    expect(sanitizeHtml('<p>"online=true"</p>')).toBe('<p>"online=true"</p>');
  });

  it("drops non-allowlisted data attributes", () => {
    expect(sanitizeHtml('<p data-note="one=1 and two=2">ok</p>')).toBe("<p>ok</p>");
  });

  it("keeps handler-looking text outside tags as inert content", () => {
    // A string with no `<` never reaches the parser: it cannot start a tag.
    const payload = 'x" onmouseover="alert(1)';
    expect(sanitizeHtml(payload)).toBe(payload);
  });
});

describe("sanitizeHtml — malicious URL schemes", () => {
  it("drops javascript: from href/src instead of leaving a placeholder", () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(sanitizeHtml("<img src='javascript:alert(1)'>")).toBe("<img />");
    expect(sanitizeHtml("<a href=javascript:alert(1)>x</a>")).toBe("<a>x</a>");
  });

  it("drops whitespace-padded and whitespace-injected schemes", () => {
    expect(sanitizeHtml('<a href=" javascript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(sanitizeHtml("<a href='java\t\nscript:alert(1)'>x</a>")).toBe("<a>x</a>");
  });

  it("drops vbscript: and data: schemes", () => {
    expect(sanitizeHtml('<a href="vbscript:msgbox(1)">x</a>')).toBe("<a>x</a>");
    expect(sanitizeHtml('<img src="data:text/html;base64,PHNjcmlwdD4=">')).toBe("<img />");
  });

  it("drops js URLs in srcset/poster; the whole form/video tag is removed", () => {
    expect(sanitizeHtml('<img srcset="javascript:alert(1)">')).toBe("<img />");
    expect(sanitizeHtml('<video poster="javascript:alert(1)">')).toBe("");
    expect(sanitizeHtml('<form action="javascript:alert(1)">')).toBe("");
    expect(sanitizeHtml('<svg xlink:href="javascript:alert(1)"></svg>')).toBe("");
  });

  it("allows relative and http(s) URLs", () => {
    expect(sanitizeHtml('<a href="/x">l</a>')).toBe('<a href="/x">l</a>');
    expect(sanitizeHtml('<a href="https://ok.example/x">l</a>')).toBe(
      '<a href="https://ok.example/x">l</a>',
    );
  });

  it("refuses protocol-relative URLs", () => {
    expect(sanitizeHtml('<a href="//evil.example/x">l</a>')).toBe("<a>l</a>");
  });
});

describe("sanitizeHtml — HTML entities (browsers decode these)", () => {
  it("drops entity-encoded javascript: URLs", () => {
    expect(sanitizeHtml('<a href="&#106;avascript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(sanitizeHtml('<a href="javascript&colon;alert(1)">x</a>')).toBe("<a>x</a>");
  });

  it("recognizes entity-encoded tag names", () => {
    expect(sanitizeHtml("<scr&#105;pt>alert(1)</scr&#105;pt>")).not.toContain("script");
    // No literal `<`: the value stays text and renders as visible characters.
    expect(sanitizeHtml("&#60;script&#62;alert(1)&#60;/script&#62;")).not.toContain("<script");
  });

  it("decodes only printable ASCII, never control chars", () => {
    expect(decodeHtmlEntities("&#106;x")).toBe("jx");
    expect(decodeHtmlEntities("&#1;")).toBe("&#1;"); // control char stays encoded
    expect(decodeHtmlEntities("&#x6a;")).toBe("j");
    expect(decodeHtmlEntities("&colon;")).toBe(":");
  });
});

describe("sanitizeHtml — style and unknown tags", () => {
  it("drops style attributes (safe and unsafe alike)", () => {
    expect(sanitizeHtml('<div style="background:url(javascript:alert(1))">x</div>')).toBe(
      "<div>x</div>",
    );
    expect(sanitizeHtml('<div style="width:expression(alert(1))">x</div>')).toBe("<div>x</div>");
    expect(sanitizeHtml('<div style="color:red">x</div>')).toBe("<div>x</div>");
  });

  it("drops unknown tags but keeps their text", () => {
    expect(sanitizeHtml("<custom-element>text</custom-element>")).toBe("text");
  });
});

describe("sanitizeHtml — nested reconstruction (parser, not regex)", () => {
  it("neutralizes reconstructed script tags", () => {
    const out = sanitizeHtml("<img src=x <scr<script>ipt>onerror=alert(1)>");
    expect(out).not.toContain("<script");
    // The surviving `onerror=…` is a text node, never an attribute of <img>.
    expect(out).not.toMatch(/<img[^>]*\son\w+\s*=/i);
    expect(out).toContain('<img src="x"');
  });

  it("drains multi-level nesting", () => {
    const out = sanitizeHtml("<scr<scr<script>ipt>ipt>alert(1)</script>");
    expect(out).not.toContain("<script");
  });

  it("is stable once sanitized (idempotent)", () => {
    const drained = sanitizeHtml("<img src=x <scr<script>ipt>onerror=alert(1)>");
    expect(sanitizeHtml(drained)).toBe(drained);
  });
});

describe("sanitizeHtml — plain text / fast path", () => {
  it("passes plain text through unchanged without parsing", () => {
    expect(sanitizeHtml("Content for item… plain")).toBe("Content for item… plain");
    for (const input of ["one", "foundation", "done", "console", "version 2.0"]) {
      expect(sanitizeHtml(input)).toBe(input);
    }
  });

  it("keeps safe HTML intact", () => {
    const input = '<h1>T</h1><p>Hello <b>world</b> <a href="https://ok.example/x">link</a></p>';
    expect(sanitizeHtml(input)).toBe(input);
  });

  it("is idempotent on safe input", () => {
    const input = '<p><b>bold</b> <a href="https://ok.example">link</a></p>';
    expect(sanitizeHtml(sanitizeHtml(input))).toBe(sanitizeHtml(input));
  });
});

describe("sanitizeSvgMarkup — strict SVG allowlist", () => {
  it("keeps a valid SVG, including viewBox and same-document xlink:href", () => {
    const input =
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 100 100"><defs><symbol id="icon"><rect width="10" height="10"/></symbol></defs><use xlink:href="#icon"/><path d="M0 0L10 10" fill="#fff"/></svg>';
    const out = sanitizeSvgMarkup(input);
    expect(out).toContain('viewBox="0 0 100 100"');
    expect(out).toContain('xlink:href="#icon"');
    expect(out).toContain('d="M0 0L10 10"');
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
  });

  it("removes script, foreignObject, animate and set", () => {
    expect(sanitizeSvgMarkup("<svg><script>alert(1)</script></svg>")).toBe("<svg></svg>");
    expect(
      sanitizeSvgMarkup("<svg><foreignObject><img src=x onerror=alert(1)></foreignObject></svg>"),
    ).not.toContain("foreignObject");
    expect(
      sanitizeSvgMarkup('<svg><animate attributeName="href" to="javascript:alert(1)"/></svg>'),
    ).not.toContain("animate");
    expect(
      sanitizeSvgMarkup('<svg><set attributeName="onload" to="alert(1)"/></svg>'),
    ).not.toContain("<set");
  });

  it("removes event handlers and style", () => {
    expect(sanitizeSvgMarkup('<svg onload="alert(1)"><circle r="1"/></svg>')).not.toContain(
      "onload",
    );
    expect(sanitizeSvgMarkup('<svg><circle r="1" onclick="evil()"/></svg>')).not.toContain(
      "onclick",
    );
    expect(
      sanitizeSvgMarkup('<svg style="background:url(javascript:1)"><rect/></svg>'),
    ).not.toContain("style");
  });

  it("drops scriptable and data: href variants", () => {
    expect(sanitizeSvgMarkup('<svg><a xlink:href="javascript:alert(1)">t</a></svg>')).not.toContain(
      "javascript:",
    );
    expect(sanitizeSvgMarkup('<svg><use href="data:image/svg+xml;base64,xx"/></svg>')).toBe(
      "<svg><use></use></svg>",
    );
    expect(sanitizeSvgMarkup('<svg><use href="https://evil.example/x.svg"/></svg>')).toBe(
      "<svg><use></use></svg>",
    );
  });

  it("neutralizes nested tag reconstruction", () => {
    const out = sanitizeSvgMarkup("<svg><scr<script>ipt>alert(1)</scr</script>ipt></svg>");
    expect(out).not.toContain("<script");
    // Residual `alert(1)` is an escaped text node, not executable markup.
    expect(out).toContain("&gt;");
  });
});

describe("stripHtml", () => {
  it("returns plain text without tags", () => {
    expect(stripHtml("<p>Hello <b>world</b></p>")).toBe("Hello world");
    expect(stripHtml("<script>alert(1)</script>no")).toBe("alert(1)no");
  });

  it("handles missing closing bracket", () => {
    expect(stripHtml("<p>unclosed")).toBe("unclosed");
  });

  it("passes through plain text", () => {
    expect(stripHtml("plain")).toBe("plain");
  });
});
