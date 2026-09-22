/**
 * @file tests/benchmarks/modules/document-integrity.ts
 * @description Structural snapshots that prove a benchmark's own write workload did not
 * alter the document its read rows are measured against.
 *
 * ### Why this exists
 * A `success`-only assertion cannot see data loss. Measured 2026-09-22: `crud.update()`
 * replaced the JSON `data` blob instead of merging the patch, so the harness's own UPDATE
 * scenario collapsed seeded rows to stubs — 30,940 of 100,000 documents dropped from a
 * ~1.5 KB median to 61 bytes — while every read row kept "passing" and the corrupted rows
 * were what the reported numbers came from. The external comparison harness had the same
 * hole (its validator accepted any `200 {success, data}`).
 *
 * ### Features
 * - `snapshotDocument` — top-level keys + serialized size of one document
 * - `compareDocumentSnapshots` — a pre/post comparison with two independent nets: a key
 *   diff (catches a patch that REPLACED the document) and a byte floor (catches a
 *   value-level collapse that keeps the keys)
 * - Pure and dependency-free, so the contract is unit-testable without a server
 */

/** Structural snapshot of one document. */
export interface DocumentSnapshot {
  /** False when nothing could be read back at all. */
  present: boolean;
  /** Sorted top-level keys. */
  keys: string[];
  /** Serialized size in bytes — the collapse signal a key diff can miss. */
  bytes: number;
}

/** Options for `compareDocumentSnapshots`. */
export interface DocumentIntegrityOptions {
  /** Human-readable subject of a failure message (e.g. `stable document <id>`). */
  label?: string;
  /**
   * Fraction of the pre-run size a document must retain to count as intact. Default
   * 50 %: the workload legitimately rewrites values, but nothing it does may halve a
   * measured document.
   */
  minByteRatio?: number;
}

/**
 * Snapshot a document's shape. Anything that is not a plain object reads as absent, so a
 * `null` result and a wrong-shaped result are the same failure.
 */
export function snapshotDocument(doc: unknown): DocumentSnapshot {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return { present: false, keys: [], bytes: 0 };
  }
  const record = doc as Record<string, unknown>;
  let bytes = 0;
  try {
    bytes = JSON.stringify(record).length;
  } catch {
    // Unserializable value (BigInt/cycle): keep the keys, drop the size signal.
    bytes = 0;
  }
  return { present: true, keys: Object.keys(record).sort(), bytes };
}

/**
 * Compare a pre-run snapshot against a post-run one.
 *
 * Returns `null` when the document survived — fields ADDED by the workload are allowed,
 * because writing is what the benchmark measures. Returns a failure reason otherwise:
 * a lost field, a vanished document, or a size collapse below `minByteRatio`.
 */
export function compareDocumentSnapshots(
  before: DocumentSnapshot,
  after: DocumentSnapshot,
  options: DocumentIntegrityOptions = {},
): string | null {
  const label = options.label ?? "document";
  // Nothing was seeded/measured — there is no integrity claim to make.
  if (!before.present) return null;
  if (!after.present) return `${label} no longer reads back after the run`;

  const missing = before.keys.filter((key) => !after.keys.includes(key));
  if (missing.length > 0) {
    return `${label} lost ${missing.length} field(s) during the run: ${missing.join(", ")}`;
  }

  const minRatio = options.minByteRatio ?? 0.5;
  if (before.bytes > 0 && after.bytes < before.bytes * minRatio) {
    return `${label} shrank from ${before.bytes} to ${after.bytes} bytes (< ${Math.round(minRatio * 100)}% of its pre-run size)`;
  }
  return null;
}
