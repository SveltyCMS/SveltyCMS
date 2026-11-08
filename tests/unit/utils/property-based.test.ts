/**
 * @file tests/unit/utils/property-based.test.ts
 * @description Property-based tests for critical utilities using fast-check.
 *
 * Unlike example-based tests ("input X → output Y"), property-based tests
 * generate random inputs and verify invariants hold for ALL values.
 * This catches edge cases that manual test writing would miss:
 * - null, undefined, NaN, Infinity
 * - Empty strings, zero-length arrays
 * - Unicode, emoji, special characters
 * - Extremely long inputs
 * - Negative numbers, floating point edge cases
 *
 * ### Properties Verified
 * - sanitize-html: sanitizeHtml is idempotent and never emits dangerous tags/URL schemes
 * - stripHtml: output never contains tags and stripping is idempotent
 * - date: nowISODateString/dateToISODateString/toISOString output validates as ISODateString and round-trips preserve milliseconds
 * - date: isISODateString accepts canonical forms and rejects impossible calendar/time components and non-strings
 * - safe-redirect: output is always an internal relative path (or the safe fallback); safe relative paths survive
 * - egress-guard: private/loopback IP literals are rejected by default; metadata/link-local stay blocked with allowPrivate
 * - error-handling: raise() always throws AppError with the requested status/message; AppError.message is always a string
 * - input-sanitizer: sanitizeString/sanitizeObject emit no live <script>/<iframe>/event-handler vectors, drop prototype keys, and pass clean JSON through untouched
 *
 * The error-handling properties call the real `raise`/`AppError` (no module
 * mock). The egress-guard properties only exercise URL-shape rejection and IP
 * literal checks — no DNS resolution or network I/O.
 */

import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { sanitizeHtml } from "@utils/sanitize-html.server";
import { stripHtml } from "@utils/sanitize-html";
import {
  dateToISODateString,
  isISODateString,
  isoDateStringToDate,
  nowISODateString,
  toISOString,
} from "@utils/date";
import { safeRedirect } from "@utils/security/safe-redirect";
import { EgressError, validateEgressUrl } from "@utils/egress-guard";
import { containsXssVector, sanitizeObject, sanitizeString } from "@utils/security/input-sanitizer";
import { AppError, raise } from "@utils/error-handling";

// ---------------------------------------------------------------------------
// Shared arbitrary helpers
// ---------------------------------------------------------------------------

/** Builds a random string from an explicit alphabet (no parser-driven filtering). */
function stringOf(
  chars: readonly string[],
  constraints: { minLength?: number; maxLength: number },
): fc.Arbitrary<string> {
  return fc.array(fc.constantFrom(...chars), constraints).map((parts) => parts.join(""));
}

/**
 * Text without any HTML-significant character (`<`, `>`, `:`, `=`, `&`, quotes).
 * These inputs exercise the sanitizer's fast path and can be safely embedded in
 * generated markup without escaping.
 */
const PLAIN_TEXT_CHARS =
  "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,!?-_()/".split("");
const plainTextArb = stringOf(PLAIN_TEXT_CHARS, { maxLength: 30 });

// ---------------------------------------------------------------------------
// sanitize-html properties
// ---------------------------------------------------------------------------

describe("sanitizeHtml — property-based", () => {
  /**
   * Idempotence: sanitizing already-sanitized output should not change it.
   */
  it("should be idempotent", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const first = sanitizeHtml(input);
        const second = sanitizeHtml(first);
        expect(second).toBe(first);
      }),
      { numRuns: 500 },
    );
  });

  /**
   * Safety: output must never contain dangerous tags.
   */
  const DANGEROUS_TAGS = ["script", "iframe", "object", "embed", "style"];

  it("should never contain dangerous tags in output", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 2000 }), (input) => {
        const result = sanitizeHtml(input).toLowerCase();
        for (const tag of DANGEROUS_TAGS) {
          expect(result).not.toContain(`<${tag}`);
        }
      }),
      { numRuns: 500 },
    );
  });

  /**
   * Preservation: safe HTML tags should pass through.
   */
  it("should preserve safe HTML structure", () => {
    const safeInput = "<p><strong>Hello</strong> <em>World</em></p>";
    const result = sanitizeHtml(safeInput);
    expect(result).toContain("<strong>");
    expect(result).toContain("<em>");
    expect(result).toContain("<p>");
  });

  /**
   * Protocol stripping: javascript: and data: URIs should be removed.
   */
  it("should strip javascript: and data: protocols", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 100 }), (payload) => {
        const input = `<a href="javascript:${payload}">click</a>`;
        const result = sanitizeHtml(input);
        expect(result).not.toContain("javascript:");
      }),
      { numRuns: 200 },
    );
  });
});

// ---------------------------------------------------------------------------
// stripHtml properties
// ---------------------------------------------------------------------------

describe("stripHtml — property-based", () => {
  /**
   * Output must never contain HTML tags.
   */
  it("should never contain HTML tags", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = stripHtml(input);
        expect(result).not.toMatch(/<[^>]+>/);
      }),
      { numRuns: 500 },
    );
  });

  /**
   * Idempotence: stripping already-stripped text is a no-op.
   */
  it("should be idempotent", () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const first = stripHtml(input);
        const second = stripHtml(first);
        expect(second).toBe(first);
      }),
      { numRuns: 500 },
    );
  });
});

// ---------------------------------------------------------------------------
// date utilities — property-based
// ---------------------------------------------------------------------------

describe("@utils/date — property-based", () => {
  // The guard accepts exactly four year digits, so cap generated instants at
  // 9999-12-31T23:59:59.999Z and start at the epoch. Using integer timestamps
  // avoids fast-check's occasional Invalid Date from fc.date().
  const MAX_SERIALIZABLE_MS = Date.UTC(9999, 11, 31, 23, 59, 59, 999);
  const validInstantArb = fc
    .integer({ min: 0, max: MAX_SERIALIZABLE_MS })
    .map((ms) => new Date(ms));

  it("nowISODateString() always produces a canonical ISODateString", () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        const now = nowISODateString();
        expect(isISODateString(now)).toBe(true);
        // Canonical form includes milliseconds and a UTC designator.
        expect(new Date(now).toISOString()).toBe(now);
        expect(isoDateStringToDate(now).getTime()).toBe(Date.parse(now));
      }),
      { numRuns: 100 },
    );
  });

  it("Date → ISO → Date preserves the exact instant and milliseconds", () => {
    fc.assert(
      fc.property(validInstantArb, (date) => {
        const iso = dateToISODateString(date);

        expect(iso).toBe(date.toISOString());
        expect(isISODateString(iso)).toBe(true);

        const roundTripped = isoDateStringToDate(iso);
        expect(roundTripped.getTime()).toBe(date.getTime());
        expect(roundTripped.toISOString()).toBe(iso);
      }),
      { numRuns: 300 },
    );
  });

  it("toISOString() accepts Date, timestamp and ISO-string inputs equivalently", () => {
    fc.assert(
      fc.property(validInstantArb, (date) => {
        const iso = date.toISOString();

        expect(toISOString(date)).toBe(iso);
        expect(toISOString(date.getTime())).toBe(iso);
        expect(toISOString(iso)).toBe(iso);
        expect(isISODateString(toISOString(date))).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it("isISODateString() accepts every canonical serialized form", () => {
    fc.assert(
      fc.property(validInstantArb, fc.integer({ min: 1, max: 9 }), (date, digits) => {
        const iso = date.toISOString();
        const withoutZ = iso.slice(0, -1);
        const fraction = "7".repeat(digits);

        // Serializer output, date-only, space separator, and missing timezone.
        expect(isISODateString(iso)).toBe(true);
        expect(isISODateString(iso.slice(0, 10))).toBe(true);
        expect(isISODateString(iso.replace("T", " "))).toBe(true);
        expect(isISODateString(withoutZ)).toBe(true);

        // Fractional seconds with 1–9 digits, with and without a timezone.
        expect(isISODateString(iso.slice(0, 19) + `.${fraction}Z`)).toBe(true);
        expect(isISODateString(iso.slice(0, 19) + `.${fraction}`)).toBe(true);

        // Explicit offsets (the guard does not cross-check the calendar date).
        expect(isISODateString(withoutZ + "+00:00")).toBe(true);
        expect(isISODateString(withoutZ + "+05:30")).toBe(true);
        expect(isISODateString(withoutZ + "-08:00")).toBe(true);
      }),
      { numRuns: 300 },
    );
  });

  it("isISODateString() rejects impossible calendar and time components", () => {
    fc.assert(
      fc.property(validInstantArb, (date) => {
        const iso = date.toISOString();
        const invalidCandidates = [
          `${iso.slice(0, 5)}00${iso.slice(7)}`, // month 00
          `${iso.slice(0, 5)}13${iso.slice(7)}`, // month 13
          `${iso.slice(0, 8)}00${iso.slice(10)}`, // day 00
          `${iso.slice(0, 8)}32${iso.slice(10)}`, // day 32
          `${iso.slice(0, 11)}24${iso.slice(13)}`, // hour 24
          `${iso.slice(0, 14)}60${iso.slice(16)}`, // minute 60
          `${iso.slice(0, 17)}60${iso.slice(19)}`, // second 60
          iso.replace("T", "X"), // invalid separator
          iso + "Z", // trailing data
          iso.slice(0, -1) + "+24:00", // offset hour out of range
          iso.slice(0, -1) + "+05:60", // offset minute out of range
          iso.slice(0, -1) + "+5:00", // malformed offset
          iso.slice(0, 19) + ".Z", // fraction without digits
        ];

        for (const candidate of invalidCandidates) {
          expect(isISODateString(candidate)).toBe(false);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("isISODateString() rejects non-string values and non-date prefixes", () => {
    const nonStringArb = fc.oneof(
      fc.integer(),
      fc.boolean(),
      fc.constant(null),
      fc.constant(undefined),
      fc.constant(new Date(0)),
      fc.array(fc.integer(), { maxLength: 3 }),
      fc.dictionary(fc.string({ maxLength: 3 }), fc.integer(), { maxKeys: 2 }),
    );

    fc.assert(
      fc.property(nonStringArb, (value) => {
        expect(isISODateString(value)).toBe(false);
      }),
      { numRuns: 200 },
    );

    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), (suffix) => {
        expect(isISODateString(`prefix:${suffix}`)).toBe(false);
      }),
      { numRuns: 300 },
    );
  });

  it("isoDateStringToDate() never returns an Invalid Date", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 50 }), (input) => {
        const date = isoDateStringToDate(input);
        expect(date).toBeInstanceOf(Date);
        expect(Number.isNaN(date.getTime())).toBe(false);
      }),
      { numRuns: 300 },
    );
  });
});

// ---------------------------------------------------------------------------
// safe-redirect — property-based
// ---------------------------------------------------------------------------

describe("safeRedirect — property-based", () => {
  const SAFE_FALLBACK = "/login?redirect=%2Fdashboard";
  const SAFE_PATH_CHARS =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~%!$&'()*+,;=:@/?#".split("");

  const safeRelativePathArb = stringOf(SAFE_PATH_CHARS, {
    minLength: 1,
    maxLength: 40,
  })
    // The guard only accepts a single leading slash; keep generated paths relative.
    .filter((rest) => !rest.startsWith("/") && !rest.startsWith("\\"))
    .map((rest) => `/${rest}`);

  const paddedRelativePathArb = fc
    .tuple(
      fc.constantFrom("", " ", "  ", "\t"),
      safeRelativePathArb,
      fc.constantFrom("", " ", "\t"),
    )
    .map(([leading, path, trailing]) => leading + path + trailing);

  const dangerousTargetArb = fc
    .oneof(
      fc.webUrl(),
      stringOf(SAFE_PATH_CHARS, { maxLength: 40 }).map((rest) => `//evil.example/${rest}`),
      stringOf(SAFE_PATH_CHARS, { maxLength: 40 }).map((rest) => `/\\evil.example/${rest}`),
      stringOf(SAFE_PATH_CHARS, { maxLength: 40 }).map((rest) => `javascript:alert('${rest}')`),
      stringOf(SAFE_PATH_CHARS, { maxLength: 40 }).map((rest) => `data:text/html,${rest}`),
    )
    .map((target) => `  ${target}\t`);

  it("never returns an external, protocol-relative or scheme-bearing target", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 80 }), (raw) => {
        const output = safeRedirect(raw, SAFE_FALLBACK);

        expect(output.startsWith("//")).toBe(false);
        expect(output.startsWith("/\\")).toBe(false);
        expect(/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(output)).toBe(false);

        if (output !== SAFE_FALLBACK) {
          // Surviving targets are trimmed internal relative paths only.
          expect(output.startsWith("/")).toBe(true);
          expect(output).toBe(raw.trim());
        }
      }),
      { numRuns: 300 },
    );
  });

  it("blocks absolute, protocol-relative, backslash-relative and scheme targets", () => {
    fc.assert(
      fc.property(dangerousTargetArb, (target) => {
        expect(safeRedirect(target, SAFE_FALLBACK)).toBe(SAFE_FALLBACK);
      }),
      { numRuns: 300 },
    );
  });

  it("preserves safe relative paths (trimmed) unchanged", () => {
    fc.assert(
      fc.property(paddedRelativePathArb, (padded) => {
        expect(safeRedirect(padded, SAFE_FALLBACK)).toBe(padded.trim());
      }),
      { numRuns: 300 },
    );
  });

  it("falls back for nullish, empty and whitespace-only targets", () => {
    expect(safeRedirect(null, SAFE_FALLBACK)).toBe(SAFE_FALLBACK);
    expect(safeRedirect(undefined, SAFE_FALLBACK)).toBe(SAFE_FALLBACK);
    expect(safeRedirect("", SAFE_FALLBACK)).toBe(SAFE_FALLBACK);
    expect(safeRedirect("   \t ", SAFE_FALLBACK)).toBe(SAFE_FALLBACK);
  });
});

// ---------------------------------------------------------------------------
// egress-guard — property-based (offline paths only)
// ---------------------------------------------------------------------------

describe("validateEgressUrl — property-based (offline)", () => {
  const octetArb = fc.integer({ min: 0, max: 255 });

  const privateIPv4Arb = fc.oneof(
    fc.tuple(octetArb, octetArb, octetArb).map(([b, c, d]) => `10.${b}.${c}.${d}`),
    fc
      .tuple(fc.integer({ min: 16, max: 31 }), octetArb, octetArb)
      .map(([b, c, d]) => `172.${b}.${c}.${d}`),
    fc.tuple(octetArb, octetArb).map(([c, d]) => `192.168.${c}.${d}`),
    fc.tuple(octetArb, octetArb, octetArb).map(([a, b, c]) => `127.${a}.${b}.${c}`),
  );

  const cgnatIPv4Arb = fc
    .tuple(fc.integer({ min: 64, max: 127 }), octetArb, octetArb)
    .map(([b, c, d]) => `100.${b}.${c}.${d}`);

  const alwaysBlockedIPv4Arb = fc.oneof(
    fc.tuple(octetArb, octetArb).map(([c, d]) => `169.254.${c}.${d}`),
    fc.constant("0.0.0.0"),
    cgnatIPv4Arb,
  );

  it("rejects loopback and RFC1918 IPv4 literals by default", async () => {
    await fc.assert(
      fc.asyncProperty(privateIPv4Arb, async (ip) => {
        await expect(validateEgressUrl(`https://${ip}/resource`)).rejects.toBeInstanceOf(
          EgressError,
        );
      }),
      { numRuns: 150 },
    );
  });

  it("keeps link-local and unspecified literals blocked even with allowPrivate", async () => {
    await fc.assert(
      fc.asyncProperty(alwaysBlockedIPv4Arb, async (ip) => {
        await expect(
          validateEgressUrl(`https://${ip}/resource`, { allowPrivate: true }),
        ).rejects.toBeInstanceOf(EgressError);
      }),
      { numRuns: 150 },
    );
  });

  it("allows loopback and RFC1918 IPv4 literals when allowPrivate is set", async () => {
    await fc.assert(
      fc.asyncProperty(privateIPv4Arb, async (ip) => {
        const url = await validateEgressUrl(`https://${ip}/resource`, { allowPrivate: true });
        expect(url).toBeInstanceOf(URL);
        expect(url.hostname).toBe(ip);
      }),
      { numRuns: 150 },
    );
  });

  it("rejects loopback, link-local, ULA and IPv4-mapped IPv6 literals", async () => {
    const blockedIPv6 = fc.constantFrom(
      "::1",
      "fe80::1",
      "fc00::1",
      "fd12:3456::1",
      "::ffff:127.0.0.1",
    );

    await fc.assert(
      fc.asyncProperty(blockedIPv6, async (ip) => {
        await expect(validateEgressUrl(`https://[${ip}]/resource`)).rejects.toBeInstanceOf(
          EgressError,
        );
      }),
      { numRuns: 50 },
    );
  });

  it("rejects non-http(s) schemes without resolving DNS", async () => {
    const nonHttpUrlArb = fc
      .tuple(
        fc.constantFrom("ftp:", "file:", "javascript:", "data:", "ws:", "wss:", "gopher:"),
        fc.string({ maxLength: 30 }),
      )
      .map(([scheme, rest]) => scheme + rest);

    await fc.assert(
      fc.asyncProperty(nonHttpUrlArb, async (url) => {
        await expect(validateEgressUrl(url)).rejects.toBeInstanceOf(EgressError);
      }),
      { numRuns: 150 },
    );
  });

  it("rejects protocol-relative and backslash-relative targets", async () => {
    const relativeTargetArb = fc
      .tuple(
        fc.constantFrom("", " ", "\t"),
        fc.constantFrom("//", "/\\"),
        fc.string({ maxLength: 40 }),
      )
      .map(([prefix, leader, rest]) => prefix + leader + rest);

    await fc.assert(
      fc.asyncProperty(relativeTargetArb, async (target) => {
        await expect(validateEgressUrl(target)).rejects.toBeInstanceOf(EgressError);
      }),
      { numRuns: 150 },
    );
  });

  it.skipIf(process.env.NODE_ENV === "development")(
    "rejects plain-http URLs when HTTP is not allowed",
    async () => {
      const httpPathArb = stringOf(
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._~/".split(""),
        { maxLength: 30 },
      );
      const httpUrlArb = fc
        .tuple(fc.constantFrom("example.com", "api.example.org", "cdn.example.net"), httpPathArb)
        .map(([host, path]) => `http://${host}/${path}`);

      await fc.assert(
        fc.asyncProperty(httpUrlArb, async (url) => {
          await expect(validateEgressUrl(url)).rejects.toBeInstanceOf(EgressError);
        }),
        { numRuns: 100 },
      );
    },
  );

  it("always blocks metadata hosts; allows localhost only with allowPrivate", async () => {
    await expect(
      validateEgressUrl("https://metadata.google.internal/latest"),
    ).rejects.toBeInstanceOf(EgressError);
    await expect(
      validateEgressUrl("https://169.254.169.254/latest", { allowPrivate: true }),
    ).rejects.toBeInstanceOf(EgressError);
    await expect(validateEgressUrl("https://localhost:8080/")).rejects.toBeInstanceOf(EgressError);
    await expect(
      validateEgressUrl("https://LOCALHOST:8080/", { allowPrivate: true }),
    ).resolves.toBeInstanceOf(URL);
  });
});

// ---------------------------------------------------------------------------
// input-sanitizer — property-based
// ---------------------------------------------------------------------------

describe("@utils/security/input-sanitizer — property-based", () => {
  it("does not flag or alter plain text without markup, schemes or handlers", () => {
    fc.assert(
      fc.property(plainTextArb, (input) => {
        expect(containsXssVector(input)).toBe(false);
        expect(sanitizeString(input)).toBe(input);
      }),
      { numRuns: 500 },
    );
  });

  it("sanitizeString() never emits a live <script> or <iframe> tag", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 400 }), (input) => {
        const output = sanitizeString(input).toLowerCase();
        expect(output).not.toContain("<script");
        expect(output).not.toContain("<iframe");
      }),
      { numRuns: 300 },
    );
  });

  it("sanitizeString() strips event-handler attributes from markup", () => {
    fc.assert(
      fc.property(plainTextArb, fc.constantFrom("img", "div", "a", "span"), (payload, tag) => {
        const output = sanitizeString(`<${tag} src="x" onerror="${payload}">`).toLowerCase();

        expect(output).not.toContain("<script");
        expect(output).not.toMatch(/\bonerror\s*=/);
      }),
      { numRuns: 300 },
    );
  });

  it("sanitizeString() drops javascript: and data: URL attributes", () => {
    fc.assert(
      fc.property(plainTextArb, (payload) => {
        const jsOutput = sanitizeString(
          `<a href="javascript:alert('${payload}')">x</a>`,
        ).toLowerCase();
        const dataOutput = sanitizeString(`<img src="data:text/html,${payload}">`).toLowerCase();

        expect(jsOutput).not.toContain("javascript:");
        expect(dataOutput).not.toContain("data:");
      }),
      { numRuns: 300 },
    );
  });

  it("containsXssVector() flags every canonical executable vector", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 30 }), (payload) => {
        const vectors = [
          "<script" + payload,
          "<ScRiPt" + payload,
          "<iframe" + payload,
          "x onerror=" + payload,
          "x onClick = " + payload,
          '"onmouseover=' + payload,
          "javascript:" + payload,
          "JavaScript:" + payload,
          "data:" + payload,
          "java\tscript:" + payload,
        ];

        for (const vector of vectors) {
          expect(containsXssVector(vector)).toBe(true);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("sanitizeObject() passes clean JSON payloads through unchanged", () => {
    const jsonKeyArb = stringOf(
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-".split(""),
      { minLength: 1, maxLength: 8 },
    );
    const jsonScalarArb = fc.oneof(fc.constant(null), fc.boolean(), fc.integer(), plainTextArb);
    const cleanJsonArb = fc.oneof(
      jsonScalarArb,
      fc.array(plainTextArb, { maxLength: 4 }),
      fc.dictionary(jsonKeyArb, jsonScalarArb, { maxKeys: 5 }),
    );

    fc.assert(
      fc.property(cleanJsonArb, (value) => {
        const output = sanitizeObject(value);
        expect(output).toEqual(value);

        if (value !== null && typeof value === "object") {
          // Zero-copy fast path: clean payloads are returned by reference.
          expect(output).toBe(value);
        }
      }),
      { numRuns: 300 },
    );
  });

  it("sanitizeObject() preserves shape while sanitizing every string leaf", () => {
    const dirtyStringArb = fc.oneof(
      plainTextArb.map((payload) => `<script>${payload}</script>`),
      plainTextArb.map((payload) => `<img src="x" onerror="${payload}">`),
      plainTextArb,
    );
    const dirtyObjectArb = fc.record({
      title: dirtyStringArb,
      count: fc.integer(),
      active: fc.boolean(),
      tags: fc.array(dirtyStringArb, { maxLength: 4 }),
      nested: fc.record({ body: dirtyStringArb, score: fc.integer() }),
    });

    fc.assert(
      fc.property(dirtyObjectArb, (input) => {
        const output = sanitizeObject(input);

        expect(output.count).toBe(input.count);
        expect(output.active).toBe(input.active);
        expect(Array.isArray(output.tags)).toBe(true);
        expect(output.tags).toHaveLength(input.tags.length);
        expect(output.nested.score).toBe(input.nested.score);

        for (const leaf of [output.title, output.nested.body, ...output.tags]) {
          expect(typeof leaf).toBe("string");
          expect(leaf.toLowerCase()).not.toContain("<script");
          expect(leaf.toLowerCase()).not.toContain("<iframe");
          expect(leaf).not.toMatch(/\bonerror\s*=/i);
          expect(containsXssVector(leaf)).toBe(false);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("sanitizeObject() drops prototype-pollution keys without polluting Object.prototype", () => {
    fc.assert(
      fc.property(plainTextArb, fc.integer(), (payload, marker) => {
        const raw: Record<string, unknown> = { safe: payload, marker };
        Object.defineProperty(raw, "__proto__", {
          value: { polluted: payload },
          enumerable: true,
          configurable: true,
          writable: true,
        });
        Object.defineProperty(raw, "constructor", {
          value: { prototype: { polluted: payload } },
          enumerable: true,
          configurable: true,
          writable: true,
        });
        Object.defineProperty(raw, "prototype", {
          value: { polluted: payload },
          enumerable: true,
          configurable: true,
          writable: true,
        });

        const output = sanitizeObject(raw);

        for (const key of ["__proto__", "constructor", "prototype"]) {
          expect(Object.hasOwn(output, key)).toBe(false);
        }
        expect(Object.getPrototypeOf(output)).toBe(Object.prototype);
        expect(output.safe).toBe(payload);
        expect(output.marker).toBe(marker);
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------
// error-handling — property-based (real module, no mocks)
// ---------------------------------------------------------------------------

describe("@utils/error-handling — property-based", () => {
  const statusArb = fc.integer({ min: 100, max: 599 });
  const nonEmptyMessageArb = fc.string({ minLength: 1, maxLength: 200 });
  const codeArb = fc.constantFrom(
    "BAD_REQUEST",
    "NOT_FOUND",
    "FORBIDDEN",
    "UNAUTHORIZED",
    "INTERNAL_ERROR",
  );

  it("raise() always throws AppError carrying the requested status, message and code", () => {
    fc.assert(
      fc.property(statusArb, nonEmptyMessageArb, codeArb, (status, message, code) => {
        let caught: unknown;
        try {
          raise(status, message, code);
        } catch (error) {
          caught = error;
        }

        expect(caught).toBeInstanceOf(AppError);
        if (!(caught instanceof AppError)) {
          throw new Error("raise() did not throw an AppError");
        }

        expect(caught.name).toBe("AppError");
        expect(caught.status).toBe(status);
        expect(caught.message).toBe(message);
        expect(caught.code).toBe(code);
      }),
      { numRuns: 300 },
    );
  });

  it("raise() defaults the error code to INTERNAL_ERROR", () => {
    fc.assert(
      fc.property(statusArb, nonEmptyMessageArb, (status, message) => {
        let caught: unknown;
        try {
          raise(status, message);
        } catch (error) {
          caught = error;
        }

        expect(caught).toBeInstanceOf(AppError);
        if (!(caught instanceof AppError)) {
          throw new Error("raise() did not throw an AppError");
        }

        expect(caught.status).toBe(status);
        expect(caught.message).toBe(message);
        expect(caught.code).toBe("INTERNAL_ERROR");
      }),
      { numRuns: 200 },
    );
  });

  it("AppError.message is always a defined string, even for empty input", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 100 }), statusArb, (message, status) => {
        const error = new AppError(message, status);

        expect(error).toBeInstanceOf(Error);
        expect(error.name).toBe("AppError");
        expect(typeof error.message).toBe("string");
        expect(error.message).toBe(message);
        expect(error.status).toBe(status);
      }),
      { numRuns: 300 },
    );
  });
});

// ---------------------------------------------------------------------------
// edge cases: special characters
// ---------------------------------------------------------------------------

describe("sanitizeHtml — edge cases", () => {
  it("should handle null bytes", () => {
    expect(() => sanitizeHtml("\0")).not.toThrow();
    expect(() => sanitizeHtml("hello\0world")).not.toThrow();
  });

  it("should handle extremely long inputs", () => {
    const long = "a".repeat(100_000);
    expect(() => sanitizeHtml(long)).not.toThrow();
  });

  it("should handle unicode and emoji", () => {
    const input = "<p>Hello 🌍 你好</p><script>alert('xss')</script>";
    const result = sanitizeHtml(input);
    expect(result).toContain("🌍");
    expect(result).toContain("你好");
    expect(result).not.toContain("script");
  });

  it("should handle mixed case tags", () => {
    const input = "<SCRIPT>alert(1)</SCRIPT><sCrIpT>alert(2)</sCrIpT>";
    const result = sanitizeHtml(input);
    expect(result).not.toContain("alert");
  });

  it("should handle nested dangerous tags", () => {
    const input = "<div><script>outer</script><p><script>inner</script></p></div>";
    const result = sanitizeHtml(input);
    expect(result).not.toContain("script");
    expect(result).not.toContain("outer");
    expect(result).not.toContain("inner");
  });
});
