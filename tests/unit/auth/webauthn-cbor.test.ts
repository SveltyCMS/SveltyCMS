/**
 * @file tests/unit/auth/webauthn-cbor.test.ts
 * @description Unit tests for CBOR decoder
 */
import { describe, expect, it } from "vitest";
import { decodeCBOR, decodeCBORPartial } from "@src/databases/auth/webauthn/cbor-decoder";

describe("CBOR Decoder Unit Tests", () => {
  it("should decode unsigned integers", () => {
    expect(decodeCBOR(Uint8Array.from([0x0a]))).toBe(10);
    expect(decodeCBOR(Uint8Array.from([0x18, 24]))).toBe(24);
    expect(decodeCBOR(Uint8Array.from([0x19, 0x01, 0xf4]))).toBe(500);
  });

  it("should decode negative integers", () => {
    expect(decodeCBOR(Uint8Array.from([0x20]))).toBe(-1);
    expect(decodeCBOR(Uint8Array.from([0x29]))).toBe(-10);
    expect(decodeCBOR(Uint8Array.from([0x39, 0x01, 0xf3]))).toBe(-500);
  });

  it("should decode byte strings", () => {
    expect(decodeCBOR(Uint8Array.from([0x40]))).toEqual(Buffer.from([]));
    const helloBytes = [0x45, 104, 101, 108, 108, 111];
    expect(decodeCBOR(Uint8Array.from(helloBytes))).toEqual(Buffer.from("hello"));
  });

  it("should decode text strings", () => {
    expect(decodeCBOR(Uint8Array.from([0x60]))).toBe("");
    const helloText = [0x65, 104, 101, 108, 108, 111];
    expect(decodeCBOR(Uint8Array.from(helloText))).toBe("hello");
  });

  it("should decode arrays", () => {
    expect(decodeCBOR(Uint8Array.from([0x80]))).toEqual([]);
    expect(decodeCBOR(Uint8Array.from([0x83, 0x01, 0x02, 0x03]))).toEqual([1, 2, 3]);
  });

  it("should decode maps (objects)", () => {
    expect(decodeCBOR(Uint8Array.from([0xa0]))).toEqual({});
    expect(decodeCBOR(Uint8Array.from([0xa1, 0x61, 0x61, 0x01]))).toEqual({ a: 1 });
  });

  it("should decode simple/float values", () => {
    expect(decodeCBOR(Uint8Array.from([0xf4]))).toBe(false);
    expect(decodeCBOR(Uint8Array.from([0xf5]))).toBe(true);
    expect(decodeCBOR(Uint8Array.from([0xf6]))).toBe(null);
    expect(decodeCBOR(Uint8Array.from([0xf7]))).toBe(undefined);
  });

  it("should support partial decoding with offset tracking", () => {
    const buffer = Uint8Array.from([0x01, 0x02, 0x19, 0x01, 0xf4, 0x99]);
    const result = decodeCBORPartial(buffer, 2);
    expect(result.value).toBe(500);
    expect(result.bytesRead).toBe(3);
  });
});
