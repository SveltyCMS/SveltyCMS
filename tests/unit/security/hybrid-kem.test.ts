/**
 * @file tests/unit/security/hybrid-kem.test.ts
 * @description Unit tests for the ML-KEM-768 + AES-256-GCM hybrid at-rest envelope.
 *
 * Features:
 * - Round-trip with and without caller AAD, including empty plaintext
 * - Tamper detection for payload, tags, wrapped DEK, and wrong private keys
 * - Strict envelope parsing (version, field count, base64, lengths)
 * - Asserts the stored envelope never embeds the plaintext or the raw DEK
 */

import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  generateKemKeyPair,
  hybridOpen,
  hybridSeal,
  isMlKemAvailable,
  type KemKeyPair,
} from "@utils/security/hybrid-kem";

const encoder = new TextEncoder();

const kemAvailable = await isMlKemAvailable();

if (!kemAvailable) {
  console.warn(
    "Skipping hybrid-kem tests: this runtime does not expose ML-KEM-768 through WebCrypto.",
  );
}

const describeKem = kemAvailable ? describe : describe.skip;

function flipBase64Url(value: string): string {
  const bytes = Buffer.from(value, "base64url");
  if (bytes.length === 0) throw new Error("Cannot tamper with an empty field.");
  bytes[0] = bytes[0] ^ 0x01;
  return bytes.toString("base64url");
}

function replaceField(envelope: string, index: number, value: string): string {
  const parts = envelope.split(":");
  parts[index] = value;
  return parts.join(":");
}

function containsBytes(haystack: Uint8Array, needle: Uint8Array): boolean {
  if (needle.length === 0) return true;
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

function expectBytesEqual(actual: Uint8Array, expected: Uint8Array): void {
  expect(Array.from(actual)).toEqual(Array.from(expected));
}

describeKem("hybrid-kem", () => {
  let pair: KemKeyPair;

  beforeAll(async () => {
    pair = await generateKemKeyPair();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves true for isMlKemAvailable and caches the probe", async () => {
    await expect(isMlKemAvailable()).resolves.toBe(true);
    await expect(isMlKemAvailable()).resolves.toBe(true);
  });

  it("exports a usable SPKI/PKCS8 key pair", async () => {
    const exported = await generateKemKeyPair();
    expect(typeof exported.publicKey).toBe("string");
    expect(typeof exported.privateKey).toBe("string");
    expect(exported.publicKey.length).toBeGreaterThan(0);
    expect(exported.privateKey.length).toBeGreaterThan(0);
    expect(exported.publicKey).not.toBe(exported.privateKey);

    const plaintext = encoder.encode("key export/import round-trip");
    const envelope = await hybridSeal(plaintext, { publicKey: exported.publicKey });
    const opened = await hybridOpen(envelope, { privateKey: exported.privateKey });
    expectBytesEqual(opened, plaintext);
  });

  it("round-trips without AAD", async () => {
    const plaintext = encoder.encode("SveltyCMS hybrid at-rest envelope");
    const envelope = await hybridSeal(plaintext, { publicKey: pair.publicKey });

    expect(envelope.startsWith("v1:")).toBe(true);
    expect(envelope.split(":")).toHaveLength(9);

    const opened = await hybridOpen(envelope, { privateKey: pair.privateKey });
    expectBytesEqual(opened, plaintext);
  });

  it("round-trips with AAD", async () => {
    const plaintext = encoder.encode("tenant-scoped secret value");
    const aad = encoder.encode("tenant:acme|collection:posts|field:apiSecret");
    const envelope = await hybridSeal(plaintext, { publicKey: pair.publicKey, aad });

    const opened = await hybridOpen(envelope, { privateKey: pair.privateKey, aad });
    expectBytesEqual(opened, plaintext);
  });

  it("round-trips an empty plaintext", async () => {
    const envelope = await hybridSeal(new Uint8Array(0), { publicKey: pair.publicKey });
    const opened = await hybridOpen(envelope, { privateKey: pair.privateKey });
    expect(opened).toHaveLength(0);
  });

  it("produces a different envelope for each seal", async () => {
    const plaintext = encoder.encode("same input, fresh DEK/salt/IVs");
    const first = await hybridSeal(plaintext, { publicKey: pair.publicKey });
    const second = await hybridSeal(plaintext, { publicKey: pair.publicKey });
    expect(first).not.toBe(second);
  });

  it("rejects a tampered payload ciphertext", async () => {
    const envelope = await hybridSeal(encoder.encode("tamper me"), { publicKey: pair.publicKey });
    const tampered = replaceField(envelope, 8, flipBase64Url(envelope.split(":")[8]));
    await expect(hybridOpen(tampered, { privateKey: pair.privateKey })).rejects.toThrow(
      /opening failed/i,
    );
  });

  it("rejects a tampered payload tag", async () => {
    const envelope = await hybridSeal(encoder.encode("tamper me"), { publicKey: pair.publicKey });
    const tampered = replaceField(envelope, 7, flipBase64Url(envelope.split(":")[7]));
    await expect(hybridOpen(tampered, { privateKey: pair.privateKey })).rejects.toThrow(
      /opening failed/i,
    );
  });

  it("rejects a tampered wrapped DEK and its tag", async () => {
    const envelope = await hybridSeal(encoder.encode("wrap tamper"), { publicKey: pair.publicKey });

    const tamperedDek = replaceField(envelope, 5, flipBase64Url(envelope.split(":")[5]));
    await expect(hybridOpen(tamperedDek, { privateKey: pair.privateKey })).rejects.toThrow(
      /opening failed/i,
    );

    const tamperedTag = replaceField(envelope, 4, flipBase64Url(envelope.split(":")[4]));
    await expect(hybridOpen(tamperedTag, { privateKey: pair.privateKey })).rejects.toThrow(
      /opening failed/i,
    );
  });

  it("rejects a wrong private key", async () => {
    const envelope = await hybridSeal(encoder.encode("wrong key"), { publicKey: pair.publicKey });
    const otherPair = await generateKemKeyPair();
    await expect(hybridOpen(envelope, { privateKey: otherPair.privateKey })).rejects.toThrow(
      /opening failed/i,
    );
  });

  it("rejects an AAD mismatch", async () => {
    const envelope = await hybridSeal(encoder.encode("aad bound"), {
      publicKey: pair.publicKey,
      aad: encoder.encode("tenant:a"),
    });

    await expect(
      hybridOpen(envelope, { privateKey: pair.privateKey, aad: encoder.encode("tenant:b") }),
    ).rejects.toThrow(/opening failed/i);

    await expect(hybridOpen(envelope, { privateKey: pair.privateKey })).rejects.toThrow(
      /opening failed/i,
    );
  });

  it("rejects malformed envelopes strictly", async () => {
    const envelope = await hybridSeal(encoder.encode("strict parsing"), {
      publicKey: pair.publicKey,
    });

    await expect(
      hybridOpen(replaceField(envelope, 0, "v2"), { privateKey: pair.privateKey }),
    ).rejects.toThrow(/opening failed/i);

    await expect(hybridOpen(`${envelope}:extra`, { privateKey: pair.privateKey })).rejects.toThrow(
      /opening failed/i,
    );

    await expect(
      hybridOpen(replaceField(envelope, 2, "not+base64url="), { privateKey: pair.privateKey }),
    ).rejects.toThrow(/opening failed/i);

    await expect(
      hybridOpen(replaceField(envelope, 1, Buffer.alloc(16).toString("base64url")), {
        privateKey: pair.privateKey,
      }),
    ).rejects.toThrow(/opening failed/i);
  });

  it("never embeds the plaintext or the raw DEK in the envelope", async () => {
    const plaintextText = "TOP-SECRET-PLAINTEXT-9c4a";
    const plaintext = encoder.encode(plaintextText);

    let capturedDek: Uint8Array | undefined;
    let randomCall = 0;
    const deterministicFill = <T extends ArrayBufferView | null>(array: T): T => {
      if (array instanceof Uint8Array) {
        const seed = randomCall++;
        for (let i = 0; i < array.length; i++) {
          array[i] = (i * 29 + seed * 53 + 11) & 0xff;
        }
        // The DEK is the first 32-byte random draw in hybridSeal.
        if (capturedDek === undefined && array.length === 32) {
          capturedDek = Uint8Array.from(array);
        }
      }
      return array;
    };

    const spy = vi
      .spyOn(globalThis.crypto, "getRandomValues")
      .mockImplementation(deterministicFill);

    try {
      const envelope = await hybridSeal(plaintext, { publicKey: pair.publicKey });
      const dek = capturedDek;
      expect(dek).toBeDefined();
      if (!dek) throw new Error("Test failed to capture the DEK randomness draw.");

      expect(envelope).not.toContain(plaintextText);
      expect(envelope).not.toContain(Buffer.from(dek).toString("base64url"));
      expect(envelope).not.toContain(Buffer.from(dek).toString("base64"));

      const fields = envelope
        .split(":")
        .slice(1)
        .map((field) => new Uint8Array(Buffer.from(field, "base64url")));

      for (const field of fields) {
        expect(containsBytes(field, plaintext)).toBe(false);
        expect(containsBytes(field, dek)).toBe(false);
      }

      const opened = await hybridOpen(envelope, { privateKey: pair.privateKey });
      expectBytesEqual(opened, plaintext);
    } finally {
      spy.mockRestore();
    }
  });
});
