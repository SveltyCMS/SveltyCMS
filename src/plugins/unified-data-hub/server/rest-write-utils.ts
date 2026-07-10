/**
 * @file src/plugins/unified-data-hub/server/rest-write-utils.ts
 * @description REST connector write helpers — field mapping, URL building, SSRF-safe entry ids.
 */

import type { VirtualCollectionRecord } from "../types";
import { FederationError } from "../types";
import { buildRestUrl } from "./ssrf";

const SAFE_ENTRY_SEGMENT = /^[a-zA-Z0-9_-]+$/;

export function assertSafeRestEntryId(entryId: string): string {
  const trimmed = entryId.trim();
  if (!trimmed || !SAFE_ENTRY_SEGMENT.test(trimmed)) {
    throw new FederationError(
      "CONNECTOR_WRITE_FAILED",
      "Invalid entry id for REST path segment",
      400,
    );
  }
  return trimmed;
}

export function buildRestCollectionUrl(
  baseUrl: string,
  endpoint: string,
  allowedHosts: string[],
): URL {
  const normalized = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const withoutTrailing = normalized.replace(/\/+$/, "") || "/";
  return buildRestUrl(baseUrl, withoutTrailing, allowedHosts);
}

export function buildRestEntryUrl(
  baseUrl: string,
  endpoint: string,
  entryId: string,
  allowedHosts: string[],
): URL {
  const safeId = assertSafeRestEntryId(entryId);
  const normalized = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
  const base = normalized.replace(/\/+$/, "");
  return buildRestUrl(baseUrl, `${base}/${safeId}`, allowedHosts);
}

export function mapVirtualWriteBody(
  collection: VirtualCollectionRecord,
  data: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const fieldByName = new Map(collection.fields.map((f) => [f.name, f]));

  for (const [key, value] of Object.entries(data)) {
    if (key === "id" || key === "_id") continue;
    const field = fieldByName.get(key);
    if (!field) continue;
    out[field.sourceField] = value;
  }

  if (collection.source.platform === "wordpress") {
    return shapeWordPressWriteBody(out);
  }
  return out;
}

function shapeWordPressWriteBody(body: Record<string, unknown>): Record<string, unknown> {
  const shaped = { ...body };
  for (const key of ["title", "content", "excerpt"] as const) {
    const val = shaped[key];
    if (typeof val === "string") {
      shaped[key] = val;
    }
  }
  if (!shaped.status) {
    shaped.status = "draft";
  }
  return shaped;
}

export function mapRestItemToFields(
  item: Record<string, unknown>,
  collection: VirtualCollectionRecord,
): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const field of collection.fields) {
    let raw = item[field.sourceField] ?? item[field.name];
    if (field.sourceField === "title" && raw && typeof raw === "object" && "rendered" in raw) {
      raw = (raw as { rendered?: string }).rendered;
    }
    if (field.sourceField === "content" && raw && typeof raw === "object" && "rendered" in raw) {
      raw = (raw as { rendered?: string }).rendered;
    }
    if (field.sourceField === "excerpt" && raw && typeof raw === "object" && "rendered" in raw) {
      raw = (raw as { rendered?: string }).rendered;
    }
    mapped[field.name] = raw;
  }
  if (mapped.id === undefined && item.id !== undefined) {
    mapped.id = item.id;
  }
  return mapped;
}

export function parseEntrySourceKey(entryId: string, connectorId: string): string {
  const prefix = `${connectorId}:`;
  if (entryId.startsWith(prefix)) return entryId.slice(prefix.length);
  return entryId;
}

export function extractRestWriteItem(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  if (Array.isArray(body)) {
    return (body[0] as Record<string, unknown>) ?? null;
  }
  const obj = body as Record<string, unknown>;
  if (obj.data && typeof obj.data === "object" && !Array.isArray(obj.data)) {
    return obj.data as Record<string, unknown>;
  }
  return obj;
}
