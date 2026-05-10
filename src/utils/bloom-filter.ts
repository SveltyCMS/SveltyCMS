/**
 * @file src/utils/bloom-filter.ts
 * @description High-performance probabilistic data structure for membership testing.
 * Optimized for zero-allocation lookups and minimal memory footprint.
 */

/**
 * Bloom Filter Implementation
 */
export class BloomFilter {
  private _bits: Uint32Array;
  private _size: number;
  private _hashCount: number;

  /**
   * @param expectedItems Maximum items before false positive rate increases significantly
   * @param falsePositiveRate Desired false positive probability (e.g., 0.01 for 1%)
   */
  constructor(expectedItems: number = 10000, falsePositiveRate: number = 0.01) {
    // Formula: m = - (n * ln(p)) / (ln(2)^2)
    this._size = Math.ceil(
      -(expectedItems * Math.log(falsePositiveRate)) / Math.pow(Math.log(2), 2),
    );
    // Formula: k = (m / n) * ln(2)
    this._hashCount = Math.ceil((this._size / expectedItems) * Math.log(2));

    // Align size to 32 bits
    const arraySize = Math.ceil(this._size / 32);
    this._bits = new Uint32Array(arraySize);
  }

  /**
   * Adds an item to the filter
   */
  public add(item: string): void {
    const hash1 = this._fnv1a(item);
    const hash2 = this._murmur3(item);

    for (let i = 0; i < this._hashCount; i++) {
      // Double hashing technique: (h1 + i * h2) % m
      const index = Math.abs((hash1 + i * hash2) % this._size);
      this._bits[index >>> 5] |= 1 << (index & 31);
    }
  }

  /**
   * Checks if an item might be in the filter
   * @returns false if definitely NOT in filter, true if MIGHT be in filter
   */
  public has(item: string): boolean {
    const hash1 = this._fnv1a(item);
    const hash2 = this._murmur3(item);

    for (let i = 0; i < this._hashCount; i++) {
      const index = Math.abs((hash1 + i * hash2) % this._size);
      if (!(this._bits[index >>> 5] & (1 << (index & 31)))) {
        return false;
      }
    }
    return true;
  }

  /**
   * Resets the filter
   */
  public clear(): void {
    this._bits.fill(0);
  }

  /**
   * Simple FNV-1a hash
   */
  private _fnv1a(str: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash;
  }

  /**
   * Simple Murmur3-like hash
   */
  private _murmur3(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0; // Convert to 32bit int
    }
    return hash;
  }
}
