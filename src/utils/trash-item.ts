/**
 * @file src/utils/trash-item.ts
 * @description Canonical projection for soft-deleted rows rendered by the trash bin.
 *
 * The SSR trash page (`/config/trash`) and `GET /api/trash` must agree on the row
 * shape — a client refresh previously replaced the projected SSR rows with raw
 * adapter rows, so a legacy soft-deleted entry lost its title/audit fallbacks.
 *
 * Features:
 * - Pure, framework-free projection (safe on server and client)
 * - Title fallback chain: localized/plain title → name → `data` JSON → first display string
 *   (the table renders `_id` when none match — pinned by the existing page-server test)
 * - Delete audit fallback: `deletedAt`/`deletedBy` → legacy `updatedAt`/`updatedBy`
 * - Actor label distinguishes a real `system` actor from missing audit data
 */

/** One soft-deleted entry as rendered by the trash table (and returned by `GET /api/trash`). */
export interface TrashItem {
  _id: string;
  title?: string;
  name?: string;
  collectionId: string;
  collectionName?: string;
  deletedAt?: string;
  deletedBy?: string;
}

/** Entry keys that are never a display label when scanning for a fallback title. */
const NON_DISPLAY_KEYS = new Set([
  "_id",
  "id",
  "title",
  "name",
  "status",
  "tenantId",
  "createdAt",
  "updatedAt",
  "createdBy",
  "updatedBy",
  "deletedAt",
  "deletedBy",
  "isDeleted",
  "collection",
  "slug",
  "locale",
  "publishedAt",
  "data",
]);

/** Localized string (`{ en: "…" }`) or plain string from a title-like value. */
function pickLocalizedString(value: unknown): string | undefined {
  if (typeof value === "string") return value || undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  if (typeof record.en === "string" && record.en) return record.en;
  const first = Object.values(record).find(
    (candidate) => typeof candidate === "string" && candidate,
  );
  return first === undefined ? undefined : String(first);
}

/** Parses the JSON `data` column when the adapter returned it as text. */
function parseDataRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value !== "string" || !value) return undefined;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/** First non-empty string value that reads as a display field. */
function firstDisplayString(record: Record<string, unknown> | undefined): string | undefined {
  if (!record) return undefined;
  for (const [key, value] of Object.entries(record)) {
    if (NON_DISPLAY_KEYS.has(key)) continue;
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

/**
 * Coerce one soft-deleted row into the row shape the trash renders.
 *
 * Pure and side-effect free so the SSR page server and the API handler can share
 * one projection without an HTTP hop or duplicated fallback logic.
 */
export function toTrashItem(raw: unknown, collectionId: string, collectionName: string): TrashItem {
  const row = (raw ?? {}) as Record<string, unknown>;
  const data = parseDataRecord(row.data);

  const rowTitle =
    pickLocalizedString(row.title) ??
    pickLocalizedString(row.name) ??
    pickLocalizedString(data?.title) ??
    pickLocalizedString(data?.name) ??
    firstDisplayString(data) ??
    firstDisplayString(row);

  return {
    _id: String(row._id ?? row.id ?? ""),
    title: rowTitle,
    name: typeof row.name === "string" ? row.name : undefined,
    collectionId,
    collectionName,
    deletedAt:
      typeof row.deletedAt === "string"
        ? row.deletedAt
        : typeof row.updatedAt === "string"
          ? row.updatedAt
          : undefined,
    deletedBy:
      typeof row.deletedBy === "string"
        ? row.deletedBy
        : typeof row.updatedBy === "string"
          ? row.updatedBy
          : undefined,
  };
}

/**
 * Human-readable actor for the "Deleted by" column.
 *
 * Legacy rows soft-deleted before the audit write path carry no actor. The old
 * label claimed "System" for those rows, which is a false attribution: a real
 * system actor is stored as `"system"`, while missing audit data is unknown.
 */
export function formatTrashActor(deletedBy: string | null | undefined): string {
  const actor = typeof deletedBy === "string" ? deletedBy.trim() : "";
  if (!actor) return "—";
  return actor.toLowerCase() === "system" ? "System" : actor;
}
