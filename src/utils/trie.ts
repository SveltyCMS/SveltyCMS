/**
 * @file src/utils/trie.ts
 * @description High-performance Prefix Tree (Trie) for O(L) path and permission lookups.
 * Optimized for static API permission maps where L is the number of path segments.
 */

interface TrieNode<T> {
  children: Map<string, TrieNode<T>>;
  value?: T;
}

export class Trie<T> {
  private root: TrieNode<T> = { children: new Map() };

  /**
   * Inserts a value into the trie at a specific path
   * @param path The path segments (e.g., ["api", "user"])
   * @param value The value to associate with the path
   */
  public insert(path: string[], value: T): void {
    let node = this.root;
    for (const segment of path) {
      if (!node.children.has(segment)) {
        node.children.set(segment, { children: new Map() });
      }
      node = node.children.get(segment)!;
    }
    node.value = value;
  }

  /**
   * Finds the value associated with a path
   * @param path The path segments to look up
   * @param options.exact If true, only returns a value if the path matches exactly
   * @param options.fallback If true, returns the nearest parent value if no exact match
   */
  public find(
    path: string[],
    options: { exact?: boolean; fallback?: boolean } = {},
  ): T | undefined {
    let node = this.root;
    let lastValue = node.value;

    for (const segment of path) {
      if (!node.children.has(segment)) {
        return options.fallback ? lastValue : undefined;
      }
      node = node.children.get(segment)!;
      if (node.value !== undefined) {
        lastValue = node.value;
      }
    }

    return options.exact ? node.value : (node.value ?? (options.fallback ? lastValue : undefined));
  }

  /**
   * Checks if any prefix of the path exists in the trie
   */
  public hasPrefix(path: string[]): boolean {
    let node = this.root;
    for (const segment of path) {
      if (!node.children.has(segment)) return false;
      node = node.children.get(segment)!;
      if (node.value !== undefined) return true;
    }
    return false;
  }
}
