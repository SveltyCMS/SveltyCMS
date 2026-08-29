/**
 * @file tests/unit/security/sanitize-html.test.ts
 * @description Regression tests for the regex denylist sanitizer used in
 * {@html} sinks (public site renderer, markdown widget, write-path content).
 *
 * Covers the bypass classes from the 2026-08 audit:
 * - self-closing event handlers `<img/onerror=…>` (no whitespace)
 * - unquoted / whitespace-after-quote / entity-encoded `javascript:` URLs
 * - srcset/poster/formaction/xlink:href URL attributes
 * - `style=` attributes carrying code
 * - base/svg/math tag hijack
 * - post-quote handler injection `<img src="x"onerror=…>`
 * - fixpoint loop: tag-strip exposing a NEW handler/tag on a later pass
 */

import { describe, it, expect } from "vitest";
import { sanitizeHtml, stripHtml, decodeHtmlEntities } from "@src/utils/sanitize-html";

describe("sanitizeHtml — denylist tags", () => {
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

  it("strips base, svg and math tags (URL hijack / XSS carriers)", () => {
    expect(sanitizeHtml("<base href='https://evil.com/'><a href='/x'>l</a>")).toBe(
      "<a href='/x'>l</a>",
    );
    expect(sanitizeHtml("<svg><script>alert(1)</script></svg>")).toBe("");
    expect(sanitizeHtml("<math><mtext>hi</mtext></math>")).toBe("");
  });
});

describe("sanitizeHtml — event handlers", () => {
  it("strips whitespace-separated handlers", () => {
    expect(sanitizeHtml("<img src=x onerror=alert(1)>")).toBe("<img src=x>");
    expect(sanitizeHtml('<a href="y" onclick="alert(1)">t</a>')).toBe('<a href="y">t</a>');
  });

  it("strips self-closing-bypass handlers (<img/onerror=…>, <svg/onload=…>)", () => {
    expect(sanitizeHtml("<img/onerror=alert(1) src=x>")).toBe("<img src=x>");
    expect(sanitizeHtml("<svg/onload=alert(1)>")).toBe("");
  });

  it("strips attribute-injection handlers without a <", () => {
    expect(sanitizeHtml('x" onmouseover="alert(1)')).not.toContain("onmouseover");
  });

  it("does not corrupt a legit URL containing /on…", () => {
    // The lookbehind must NOT treat a slash inside a quoted value as a tag boundary.
    expect(sanitizeHtml('<a href="https://x/onclick=1">t</a>')).toBe(
      '<a href="https://x/onclick=1">t</a>',
    );
  });

  it("strips handlers injected directly after a closed quoted value", () => {
    // HTML parsing starts a new attribute after a closing quote — browsers
    // execute `<img src="x"onerror=…>`. Audit 2026-08: these survived.
    expect(sanitizeHtml('<img src="x"onerror=alert(1)>')).toBe('<img src="x">');
    expect(sanitizeHtml('<a href="x"onclick=alert(1)>t</a>')).toBe('<a href="x">t</a>');
    expect(sanitizeHtml('<div style="color:red"onmouseover=alert(1)>x</div>')).toBe(
      '<div style="color:red">x</div>',
    );
    expect(sanitizeHtml('<img src="x"/onerror=alert(1)>')).toBe('<img src="x">');
    expect(sanitizeHtml('<img src="x"onerror=alert(1) onload=alert(2)>')).toBe('<img src="x">');
  });

  it("does not mangle quoted text that merely looks like a handler", () => {
    // Curated handler-name list: `one=`, `online=` etc. are NOT event handlers
    // and must survive inside attribute values / plain text.
    expect(sanitizeHtml('<a title="one=two">x</a>')).toBe('<a title="one=two">x</a>');
    expect(sanitizeHtml('<p data-note="one=1 and two=2">ok</p>')).toBe(
      '<p data-note="one=1 and two=2">ok</p>',
    );
    expect(sanitizeHtml('<p>"online=true"</p>')).toBe('<p>"online=true"</p>');
  });
});

describe("sanitizeHtml — malicious URL schemes", () => {
  it("blocks quoted javascript: in href/src/action", () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe('<a href="#blocked">x</a>');
    expect(sanitizeHtml("<img src='javascript:alert(1)'>")).toBe('<img src="#blocked">');
  });

  it("blocks unquoted javascript:", () => {
    expect(sanitizeHtml("<a href=javascript:alert(1)>x</a>")).toBe('<a href="#blocked">x</a>');
  });

  it("blocks whitespace after the quote", () => {
    expect(sanitizeHtml('<a href=" javascript:alert(1)">x</a>')).toBe('<a href="#blocked">x</a>');
  });

  it("blocks tab/newline-injected schemes (java\\tscript:)", () => {
    expect(sanitizeHtml("<a href='java\t\nscript:alert(1)'>x</a>")).toBe(
      '<a href="#blocked">x</a>',
    );
  });

  it("blocks vbscript: and data: schemes", () => {
    expect(sanitizeHtml('<a href="vbscript:msgbox(1)">x</a>')).toBe('<a href="#blocked">x</a>');
    expect(sanitizeHtml('<img src="data:text/html;base64,PHNjcmlwdD4=">')).toBe(
      '<img src="#blocked">',
    );
  });

  it("blocks javascript: in srcset, poster, formaction and xlink:href", () => {
    expect(sanitizeHtml('<img srcset="javascript:alert(1)">')).toBe('<img srcset="#blocked">');
    expect(sanitizeHtml('<video poster="javascript:alert(1)">')).toBe('<video poster="#blocked">');
    // `<form>` itself is on the denylist — the whole tag is removed.
    expect(sanitizeHtml('<form action="javascript:alert(1)">')).toBe("");
    expect(sanitizeHtml('<svg xlink:href="javascript:alert(1)"></svg>')).toBe("");
  });
});

describe("sanitizeHtml — HTML entities (browsers decode these)", () => {
  it("blocks entity-encoded javascript: URLs", () => {
    expect(sanitizeHtml('<a href="&#106;avascript:alert(1)">x</a>')).toBe(
      '<a href="#blocked">x</a>',
    );
    // `javascript&colon;…` decodes to `javascript:…` (a real scheme).
    expect(sanitizeHtml('<a href="javascript&colon;alert(1)">x</a>')).toContain("#blocked");
  });

  it("normalizes entity-encoded tag names", () => {
    expect(sanitizeHtml("<scr&#105;pt>alert(1)</scr&#105;pt>")).toBe("");
    expect(sanitizeHtml("&#60;script&#62;alert(1)&#60;/script&#62;")).toBe("");
  });

  it("decodes only printable ASCII, never control chars", () => {
    expect(decodeHtmlEntities("&#106;x")).toBe("jx");
    expect(decodeHtmlEntities("&#1;")).toBe("&#1;"); // control char stays encoded
    expect(decodeHtmlEntities("&#x6a;")).toBe("j");
    expect(decodeHtmlEntities("&colon;")).toBe(":");
  });
});

describe("sanitizeHtml — style attributes", () => {
  it("drops style attributes carrying code", () => {
    expect(sanitizeHtml('<div style="background:url(javascript:alert(1))">x</div>')).toBe(
      "<div>x</div>",
    );
    expect(sanitizeHtml('<div style="width:expression(alert(1))">x</div>')).toBe("<div>x</div>");
    expect(sanitizeHtml("<div style='background:url(data:x)'>x</div>")).toBe("<div>x</div>");
  });

  it("keeps harmless inline styles", () => {
    expect(sanitizeHtml('<div style="color:red">x</div>')).toBe('<div style="color:red">x</div>');
  });
});

describe("sanitizeHtml — fixpoint loop (residual exposure across passes)", () => {
  it("strips handler exposed by nested tag reconstruction", () => {
    // Pass 1: inner <script> removed → `<scr`+`ipt>` reconstructs a live
    // `<script>` whose content `onerror=alert(1)` would EXECUTE as JS.
    // Pass 2: residual tag + handler are both removed.
    expect(sanitizeHtml("<img src=x <scr<script>ipt>onerror=alert(1)>")).toBe("<img src=x>");
    expect(sanitizeHtml("<img src=x on<script>error=alert(1)>")).toBe("<img src=x>");
  });

  it("drains multi-level nesting", () => {
    const out = sanitizeHtml("<scr<scr<script>ipt>ipt>alert(1)</script>");
    expect(out).not.toContain("script");
    expect(out).not.toContain("ipt>");
  });

  it("drains alternating tag/handler reconstruction", () => {
    const out = sanitizeHtml("<img src=x <scr<script>ipt>on<scr<script>ipt>error=alert(1)>");
    expect(out).not.toContain("script");
    expect(out).not.toContain("onerror");
  });

  it("is stable once drained (no corruption across passes)", () => {
    const drained = sanitizeHtml("<img src=x <scr<script>ipt>onerror=alert(1)>");
    expect(sanitizeHtml(drained)).toBe(drained);
  });
});

describe("sanitizeHtml — plain text / fast path", () => {
  it("passes plain text through unchanged", () => {
    expect(sanitizeHtml("Content for item… plain")).toBe("Content for item… plain");
  });

  it("normalizes entities even on the fast path", () => {
    expect(sanitizeHtml("a&#65;b")).toBe("aAb");
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
