/**
 * @file src/utils/trie.ts
 * @description Hardened Prefix Tree (Trie) for O(L) path and permission lookups.
 *
 * ### Hardening (audit 2026-07):
 * - Empty segment validation: throws on empty strings (prevents double-slash bypasses)
 * - Explicit fallback differentiation: only updates lastValue on defined values
 * - GC-friendly: clear() method releases all node references
 *
 * Optimized for static API permission maps where L is the number of path segments.
 */

interface TrieNode<T> {
  children: Map<string, TrieNode<T>>;
  value?: T;
}

export class Trie<T> {
  private root: TrieNode<T> = { children: new Map() };

  /**
   * Inserts a value into the trie at a specific path.
   * 🛡️ Hardened: Disallows empty segment strings.
   * @param path The path segments (e.g., ["api", "user"])
   * @param value The value to associate with the path
   */
  public insert(path: string[], value: T): void {
    let node = this.root;
    for (const segment of path) {
      if (segment === "") throw new Error("Trie path segment cannot be empty");

      let child = node.children.get(segment);
      if (!child) {
        child = { children: new Map() };
        node.children.set(segment, child);
      }
      node = child;
    }
    node.value = value;
  }

  /**
   * Finds the value associated with a path.
   * 🛡️ Hardened: Explicitly differentiates between undefined and null values.
   * @param path The path segments to look up
   * @param options.exact If true, only returns a value if the path matches exactly
   * @param options.fallback If true, returns the nearest parent value if no exact match
   */
  public find(
    path: string[],
    options: { exact?: boolean; fallback?: boolean } = {},
  ): T | undefined {
    let node = this.root;
    let lastValue: T | undefined = node.value;

    for (const segment of path) {
      const child = node.children.get(segment);
      if (!child) return options.fallback ? lastValue : undefined;

      node = child;
      // Update fallback only if a value is explicitly defined at this level
      if (node.value !== undefined) {
        lastValue = node.value;
      }
    }

    return options.exact
      ? node.value
      : node.value !== undefined
        ? node.value
        : options.fallback
          ? lastValue
          : undefined;
  }

  /**
   * Checks if any prefix of the path exists in the trie.
   */
  public hasPrefix(path: string[]): boolean {
    let node = this.root;
    for (const segment of path) {
      const child = node.children.get(segment);
      if (!child) return false;
      node = child;
      if (node.value !== undefined) return true;
    }
    return false;
  }

  /**
   * 🛡️ Hardened: Clears the Trie and releases references to child nodes.
   */
  public clear(): void {
    this.root = { children: new Map() };
  }
}
