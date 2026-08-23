/**
 * @file src/widgets/core/relation/fetch-related.ts
 * @description One HTTP request for related entries (`_id $in`) instead of N GETs.
 *
 * ### Features:
 * - browser-only helper (used by Relation Input / Display)
 * - unique-id dedupe + optional field projection
 * - reads `{ success, data }` envelopes
 */

export async function fetchRelatedEntries(
  collection: string,
  ids: readonly string[],
  fields?: readonly string[],
): Promise<Record<string, unknown>[]> {
  if (!collection || ids.length === 0) return [];

  const unique: string[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push(id);
  }
  if (unique.length === 0) return [];

  const params = new URLSearchParams();
  params.set("filter", JSON.stringify({ _id: { $in: unique } }));
  params.set("limit", String(unique.length));
  if (fields && fields.length > 0) {
    const projected = new Set<string>(["_id", ...fields]);
    params.set("fields", [...projected].join(","));
  }

  const res = await fetch(`/api/collections/${encodeURIComponent(collection)}?${params}`);
  if (!res.ok) return [];
  const body = (await res.json().catch(() => null)) as
    | { data?: unknown; items?: unknown }
    | unknown[]
    | null;
  if (!body) return [];
  if (Array.isArray(body)) return body as Record<string, unknown>[];
  const payload = (body as { data?: unknown; items?: unknown }).data;
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  if (
    payload &&
    typeof payload === "object" &&
    Array.isArray((payload as { items?: unknown }).items)
  ) {
    return (payload as { items: Record<string, unknown>[] }).items;
  }
  const items = (body as { items?: unknown }).items;
  return Array.isArray(items) ? (items as Record<string, unknown>[]) : [];
}

/** True when SSR already populated the related row (id + display field). */
export function isHydratedRelation(
  value: unknown,
): value is Record<string, unknown> & { _id: string } {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { _id?: unknown })._id === "string"
  );
}
