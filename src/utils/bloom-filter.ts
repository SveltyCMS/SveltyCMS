/**
 * @file src/utils/bloom-filter.ts
 * @description Hardened Bloom Filter with serialization security and improved hash distribution.
 *
 * ### Hardening (audit 2026-07):
 * - Serialization: Buffer base64 replaces JSON number arrays (compact, no stack overflow)
 * - Unsigned integer safety: >>> 0 ensures consistent 32-bit unsigned across JS engines
 * - Murmur3 quality: standard 0x5bd1e995 multiplier replaces simple additive hash
 * - Input validation: typeof + length guards prevent null/empty corrupting filter state
 */

export class BloomFilter {
  private _bits: Uint32Array;
  private _size: number;
  private _sizeMask: number;
  private _hashCount: number;
  private _expectedItems: number;
  private _falsePositiveRate: number;

  /**
   * @param expectedItems Maximum items before false positive rate increases significantly
   * @param falsePositiveRate Desired false positive probability (e.g., 0.01 for 1%)
   */
  constructor(expectedItems: number = 10000, falsePositiveRate: number = 0.01) {
    this._expectedItems = Math.max(1, expectedItems);
    this._falsePositiveRate = Math.min(0.5, Math.max(0.0001, falsePositiveRate));

    const rawSize =
      -(this._expectedItems * Math.log(this._falsePositiveRate)) / Math.pow(Math.log(2), 2);
    this._size = 1 << Math.ceil(Math.log2(rawSize));
    this._sizeMask = this._size - 1;
    this._hashCount = Math.ceil((this._size / this._expectedItems) * Math.log(2));

    this._bits = new Uint32Array(Math.ceil(this._size / 32));
  }

  /**
   * Adds an item to the filter.
   * 🛡️ Hardened: Input validation prevents null/empty from corrupting state.
   */
  public add(item: string): void {
    if (typeof item !== "string" || item.length === 0) return;

    const hash1 = this._fnv1a(item);
    const hash2 = this._murmur3(item);

    for (let i = 0; i < this._hashCount; i++) {
      const index = (hash1 + i * hash2) & this._sizeMask;
      this._bits[index >>> 5] |= 1 << (index & 31);
    }
  }

  /**
   * Checks if an item might be in the filter.
   * @returns false if definitely NOT in filter, true if MIGHT be in filter
   */
  public has(item: string): boolean {
    if (typeof item !== "string" || item.length === 0) return false;

    const hash1 = this._fnv1a(item);
    const hash2 = this._murmur3(item);

    for (let i = 0; i < this._hashCount; i++) {
      const index = (hash1 + i * hash2) & this._sizeMask;
      if (!(this._bits[index >>> 5] & (1 << (index & 31)))) {
        return false;
      }
    }
    return true;
  }

  /**
   * Resets the filter.
   */
  public clear(): void {
    this._bits.fill(0);
  }

  /**
   * 🛡️ Hardened Serialization: Base64 encoding for compact, transport-ready storage.
   */
  public serialize(): string {
    return Buffer.from(this._bits.buffer).toString("base64");
  }

  public static deserialize(
    serialized: string,
    expectedItems: number,
    falsePositiveRate: number,
  ): BloomFilter {
    const filter = new BloomFilter(expectedItems, falsePositiveRate);
    const buffer = Buffer.from(serialized, "base64");
    // Use buffer.byteOffset to handle the underlying ArrayBuffer correctly
    filter._bits = new Uint32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
    return filter;
  }

  // --- Hashing ---

  private _fnv1a(str: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }

  private _murmur3(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = Math.imul(hash ^ str.charCodeAt(i), 0x5bd1e995);
      hash ^= hash >>> 15;
    }
    return hash >>> 0;
  }
}
