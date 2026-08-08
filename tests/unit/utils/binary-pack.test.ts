/**
 * @file tests/unit/utils/binary-pack.test.ts
 * @description
 * Unit tests for Native V8 Binary Packer (zero-copy binary IPC).
 */

import { describe, it, expect } from "vitest";
import { packBinary, unpackBinary, safeUnpackBinary } from "@src/utils/binary-pack";

describe("Native V8 Binary Packer (Zero-Copy IPC)", () => {
  it("packs and unpacks complex nested objects flawlessly", () => {
    const original = {
      id: "entry-123",
      title: "Hyper-Scale Binary Serialization",
      tags: ["binary", "v8", "ipc"],
      nested: {
        score: 99.9,
        active: true,
        date: new Date("2026-08-08"),
      },
    };

    const packed = packBinary(original);
    expect(packed).toBeInstanceOf(Uint8Array);

    const unpacked = unpackBinary<typeof original>(packed);
    expect(unpacked.id).toBe(original.id);
    expect(unpacked.title).toBe(original.title);
    expect(unpacked.tags).toEqual(original.tags);
    expect(unpacked.nested.score).toBe(99.9);
    expect(unpacked.nested.date).toEqual(original.nested.date);
  });

  it("handles fallback safely for JSON buffers", () => {
    const jsonStr = JSON.stringify({ hello: "world" });
    const jsonBuffer = new TextEncoder().encode(jsonStr);

    const unpacked = safeUnpackBinary<{ hello: string }>(jsonBuffer);
    expect(unpacked.hello).toBe("world");
  });
});
