/**
 * @file src/databases/auth/webauthn/cbor-decoder.ts
 * @description
 * Custom minimalist CBOR decoder for parsing WebAuthn payloads.
 *
 * Responsibilities include:
 * - Parsing CBOR structures natively without external libraries.
 * - Decoding attestationObject and COSE credential public keys.
 * - Supporting partial decodes from arbitrary offsets.
 *
 * ### Features:
 * - recursive-descent CBOR decoding
 * - supporting maps, arrays, strings, buffers, and float/simple types
 * - zero external dependencies
 */

export function decodeCBORPartial(
  buffer: Uint8Array | Buffer,
  startOffset = 0,
): { value: any; bytesRead: number } {
  let offset = startOffset;
  const data = new Uint8Array(buffer);

  function readByte(): number {
    if (offset >= data.length) {
      throw new Error("Unexpected end of CBOR data");
    }
    return data[offset++];
  }

  function readBytes(length: number): Uint8Array {
    if (offset + length > data.length) {
      throw new Error("Unexpected end of CBOR data while reading bytes");
    }
    const result = data.subarray(offset, offset + length);
    offset += length;
    return result;
  }

  function parseUint(val: number): number | bigint {
    if (val < 24) {
      return val;
    } else if (val === 24) {
      return readByte();
    } else if (val === 25) {
      const b1 = readByte();
      const b2 = readByte();
      return (b1 << 8) | b2;
    } else if (val === 26) {
      const b1 = readByte();
      const b2 = readByte();
      const b3 = readByte();
      const b4 = readByte();
      return (b1 << 24) | (b2 << 16) | (b3 << 8) | b4;
    } else if (val === 27) {
      const b1 = readByte();
      const b2 = readByte();
      const b3 = readByte();
      const b4 = readByte();
      const b5 = readByte();
      const b6 = readByte();
      const b7 = readByte();
      const b8 = readByte();
      const value =
        (BigInt(b1) << 56n) |
        (BigInt(b2) << 48n) |
        (BigInt(b3) << 40n) |
        (BigInt(b4) << 32n) |
        (BigInt(b5) << 24n) |
        (BigInt(b6) << 16n) |
        (BigInt(b7) << 8n) |
        BigInt(b8);
      if (value <= BigInt(Number.MAX_SAFE_INTEGER)) {
        return Number(value);
      }
      return value;
    } else {
      throw new Error(`Invalid CBOR integer length identifier: ${val}`);
    }
  }

  function parseValue(): any {
    const initialByte = readByte();
    const majorType = initialByte >> 5;
    const additionalInfo = initialByte & 0x1f;

    switch (majorType) {
      case 0:
        return parseUint(additionalInfo);
      case 1: {
        const uint = parseUint(additionalInfo);
        if (typeof uint === "bigint") {
          return -1n - uint;
        }
        return -1 - uint;
      }
      case 2: {
        const length = Number(parseUint(additionalInfo));
        return Buffer.from(readBytes(length));
      }
      case 3: {
        const length = Number(parseUint(additionalInfo));
        const bytes = readBytes(length);
        return new TextDecoder().decode(bytes);
      }
      case 4: {
        const length = Number(parseUint(additionalInfo));
        const arr = [];
        for (let i = 0; i < length; i++) {
          arr.push(parseValue());
        }
        return arr;
      }
      case 5: {
        const length = Number(parseUint(additionalInfo));
        const map = new Map<any, any>();
        let allKeysStringOrNumber = true;
        for (let i = 0; i < length; i++) {
          const key = parseValue();
          const val = parseValue();
          map.set(key, val);
          if (typeof key !== "string" && typeof key !== "number") {
            allKeysStringOrNumber = false;
          }
        }
        if (allKeysStringOrNumber) {
          const obj: Record<string | number, any> = {};
          for (const [k, v] of map.entries()) {
            obj[k] = v;
          }
          return obj;
        }
        return map;
      }
      case 6: {
        parseUint(additionalInfo);
        return parseValue();
      }
      case 7: {
        if (additionalInfo < 20) {
          return additionalInfo;
        }
        switch (additionalInfo) {
          case 20:
            return false;
          case 21:
            return true;
          case 22:
            return null;
          case 23:
            return undefined;
          case 26: {
            const bytes = readBytes(4);
            const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            return view.getFloat32(0, false);
          }
          case 27: {
            const bytes = readBytes(8);
            const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
            return view.getFloat64(0, false);
          }
          default:
            throw new Error(`Unsupported simple/float value: ${additionalInfo}`);
        }
      }
      default:
        throw new Error(`Unsupported CBOR major type: ${majorType}`);
    }
  }

  const value = parseValue();
  return { value, bytesRead: offset - startOffset };
}

export function decodeCBOR(buffer: Uint8Array | Buffer): any {
  return decodeCBORPartial(buffer, 0).value;
}
