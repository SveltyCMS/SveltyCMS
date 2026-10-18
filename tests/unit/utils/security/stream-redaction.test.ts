/**
 * @file tests/unit/utils/security/stream-redaction.test.ts
 * @description Unit tests for deterministic secret/PII redaction and chunk-safe streams.
 *
 * ### Features:
 * - complete-string patterns (API keys, JWTs, Bearer, PEM, email, phone, card)
 * - ordinary prose is left untouched
 * - a secret split across chunks is still redacted
 * - clean chunks pass through unchanged
 * - `flush()` releases the bounded tail
 */

import { describe, expect, it } from "vitest";
import { createStreamRedactor, redactSecrets } from "@utils/security/stream-redaction";

describe("redactSecrets", () => {
  it("redacts sck_ and sk- API keys", () => {
    const input = "keys: sck_abcdefgh12345678 and sk-proj-abcdefghijklmnop";
    const output = redactSecrets(input);
    expect(output).not.toContain("sck_abcdefgh12345678");
    expect(output).not.toContain("sk-proj-abcdefghijklmnop");
    expect(output.match(/\[REDACTED\]/g)).toHaveLength(2);
  });

  it("redacts Bearer tokens and JWTs", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const output = redactSecrets(`Authorization: Bearer abcdefghijklmnop\nToken: ${jwt}`);

    expect(output).not.toContain("abcdefghijklmnop");
    expect(output).not.toContain(jwt);
    expect(output).toContain("[REDACTED]");
  });

  it("redacts complete and unterminated PEM private keys", () => {
    const block =
      "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA04\n-----END RSA PRIVATE KEY-----";
    const output = redactSecrets(`before\n${block}\nafter`);
    expect(output).not.toContain("MIIEowIBAAKCAQEA04");
    expect(output).toContain("before");
    expect(output).toContain("after");

    const unterminated = redactSecrets("-----BEGIN PRIVATE KEY-----\nMIIEowIBAAKCAQEA04");
    expect(unterminated).toBe("[REDACTED]");
  });

  it("redacts emails and phone numbers", () => {
    const output = redactSecrets("Contact jane.doe@example.com or +1 (555) 123-4567.");
    expect(output).not.toContain("jane.doe@example.com");
    expect(output).not.toContain("555");
    expect(output.match(/\[REDACTED\]/g)).toHaveLength(2);
  });

  it("redacts Luhn-valid card numbers only", () => {
    const valid = redactSecrets("Card: 4111 1111 1111 1111");
    expect(valid).not.toContain("4111 1111 1111 1111");

    const invalid = "Reference 1234 5678 9012 3456";
    expect(redactSecrets(invalid)).toBe(invalid);
  });

  it("leaves ordinary prose unchanged", () => {
    const input =
      "Svelte 5 runes use $state, $derived, and $effect. Build a blog post about CMS performance.";
    expect(redactSecrets(input)).toBe(input);
  });
});

describe("createStreamRedactor", () => {
  it("redacts a secret split across chunks", () => {
    const redactor = createStreamRedactor();
    const filler = "a".repeat(300);
    const secret = "sk-abcdefghijklmnopqrstuvwxyz012345";

    // The secret straddles the tail hold-back boundary.
    const first = redactor.push(`prefix ${filler} ${secret.slice(0, 12)}`);
    const second = redactor.push(`${secret.slice(12)} suffix`);
    const flushed = redactor.flush();

    const output = first + second + flushed;
    expect(output).not.toContain(secret);
    expect(output).toContain("[REDACTED]");
    expect(output).toContain("prefix");
    expect(output).toContain("suffix");
  });

  it("passes a clean chunk through unchanged", () => {
    const redactor = createStreamRedactor();
    const text = `Hello, this is a clean message ${"b".repeat(300)}`;

    const output = redactor.push(text) + redactor.flush();
    expect(output).toBe(text);
  });

  it("holds a bounded tail and releases it on flush", () => {
    const redactor = createStreamRedactor(10);
    const emitted = redactor.push("abcdefghij klmnopqrst");

    expect(emitted).toBe("abcdefghij ");
    expect(redactor.flush()).toBe("klmnopqrst");
  });

  it("does not leak a PEM body split across chunks", () => {
    const redactor = createStreamRedactor(16);
    const body = "MIIEowIBAAKCAQEA04".repeat(10);
    const first = redactor.push(`-----BEGIN PRIVATE KEY-----\n${body}`);
    const second = redactor.push("\n-----END PRIVATE KEY----- done");
    const output = first + second + redactor.flush();

    expect(output).not.toContain("MIIEowIBAAKCAQEA04");
    expect(output).toContain("[REDACTED]");
    expect(output).toContain("done");
  });
});
