/**
 * @file src/services/site/svedit/types.ts
 * @description Type guards and helpers for Svedit documents stored in the pages `content` field.
 */

/** Minimal Svedit document shape stored in the pages `content` field. */
export interface SveditDocument {
  document_id: string;
  nodes: Record<string, Record<string, unknown>>;
}

/** Returns true when value is a Svedit document (document_id + nodes map). */
export function isSveditDocument(value: unknown): value is SveditDocument {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.document_id === "string" && typeof record.nodes === "object";
}

/** Parses the pages `content` field into a Svedit document when possible. */
export function parseSveditContent(raw: unknown): SveditDocument | null {
  if (!raw) return null;

  let parsed: unknown = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
  }

  return isSveditDocument(parsed) ? parsed : null;
}
