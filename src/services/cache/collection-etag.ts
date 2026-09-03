/**
 * @file src/services/cache/collection-etag.ts
 * @description Weak ETags for collection GET endpoints (`/api/collections/{id}`).
 *
 * Features:
 * - Validator `W/"cv1|{tenant}|{collection}|{epoch}|{reprHash}"` from collection
 *   epoch (bumped on write) + FNV-1a representation hash (path, query, user)
 * - Sync If-None-Match → 304 without DB, JSON, or body cache
 * - Weak comparison over comma-separated If-None-Match lists
 * - First GET after boot seeds epoch 1 so static collections still revalidate
 */

import { cacheService } from "@src/databases/cache/cache-service";
import { hashStr } from "@src/services/cache/response-cache";

const ETAG_PREFIX = 'W/"cv1|';
const SKIP_COLLECTION_IDS = new Set(["list", "search", "reorder", "warm-cache"]);

export interface CollectionEtagParts {
  tenantId: string;
  collectionId: string;
  epoch: number;
  reprHash: string;
}

export interface CollectionEpochStore {
  get(collection: string, tenantId?: string | null): number;
  bump(collection: string, tenantId?: string | null): number;
}

const defaultEpochStore: CollectionEpochStore = {
  get: (collection, tenantId) => cacheService.getCollectionEpoch(collection, tenantId),
  bump: (collection, tenantId) => cacheService.bumpCollectionEpoch(collection, tenantId),
};

function normalizeTenantId(tenantId: string | null | undefined): string {
  if (tenantId == null || tenantId === "") return "g";
  return String(tenantId);
}

function encodePart(value: string): string {
  return value.replace(/\|/g, "%7C").replace(/"/g, "%22");
}

function decodePart(value: string): string {
  return value.replace(/%7C/g, "|").replace(/%22/g, '"');
}

/**
 * Collection id for `/api/collections/{id}` and `/api/collections/{id}/{entry}`.
 * Returns null for list/search/reorder/revisions/non-collection paths.
 */
export function getCollectionIdFromApiPath(pathname: string): string | null {
  if (!pathname.startsWith("/api/collections/")) return null;
  const parts = pathname.split("/");
  // ["", "api", "collections", "{id}", ...]
  const collectionId = parts[3];
  if (!collectionId || SKIP_COLLECTION_IDS.has(collectionId)) return null;
  if (parts[4] === "revisions" || parts[5] === "revisions" || parts[4] === "export") {
    return null;
  }
  return collectionId;
}

export function collectionReprHash(pathname: string, search: string, userCacheId: string): string {
  return hashStr(`${pathname}\n${search}\n${userCacheId}`);
}

export function buildCollectionWeakEtag(parts: CollectionEtagParts): string {
  return `${ETAG_PREFIX}${encodePart(parts.tenantId)}|${encodePart(parts.collectionId)}|${parts.epoch}|${parts.reprHash}"`;
}

export function parseCollectionWeakEtag(token: string): CollectionEtagParts | null {
  const trimmed = token.trim();
  if (!trimmed.startsWith(ETAG_PREFIX) || !trimmed.endsWith('"')) return null;
  const inner = trimmed.slice(ETAG_PREFIX.length, -1);
  const segs = inner.split("|");
  if (segs.length !== 4) return null;
  const epoch = Number(segs[2]);
  if (!Number.isInteger(epoch) || epoch < 0) return null;
  if (!segs[1] || !segs[3]) return null;
  return {
    tenantId: decodePart(segs[0]),
    collectionId: decodePart(segs[1]),
    epoch,
    reprHash: segs[3],
  };
}

/** Split If-None-Match into quoted ETag tokens (RFC 7232 list). */
export function splitIfNoneMatch(header: string): string[] {
  const out: string[] = [];
  let i = 0;
  const n = header.length;
  while (i < n) {
    while (i < n && (header.charCodeAt(i) === 32 || header.charCodeAt(i) === 44)) i++;
    if (i >= n) break;
    const weak = header.startsWith("W/", i) || header.startsWith("w/", i);
    if (weak) i += 2;
    while (i < n && header.charCodeAt(i) === 32) i++;
    if (i >= n || header.charCodeAt(i) !== 34) {
      while (i < n && header.charCodeAt(i) !== 44) i++;
      continue;
    }
    const start = i;
    i++;
    while (i < n && header.charCodeAt(i) !== 34) i++;
    if (i < n) i++;
    const quoted = header.slice(start, i);
    out.push(weak ? `W/${quoted}` : quoted);
  }
  return out;
}

export function collectionEtagMatches(ifNoneMatch: string, etag: string): boolean {
  if (ifNoneMatch === etag) return true;
  const tokens = splitIfNoneMatch(ifNoneMatch);
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === etag) return true;
  }
  return false;
}

/**
 * Seed epoch 1 on first read so static collections still 304 after the first GET.
 * Writes bump further via `cacheService.invalidateCollection` / `invalidateCache`.
 */
export function ensureCollectionEpoch(
  collectionId: string,
  tenantId: string | null | undefined,
  store: CollectionEpochStore = defaultEpochStore,
): number {
  const current = store.get(collectionId, tenantId);
  if (current > 0) return current;
  return store.bump(collectionId, tenantId);
}

export function currentCollectionWeakEtag(params: {
  collectionId: string;
  tenantId: string | null | undefined;
  pathname: string;
  search: string;
  userCacheId: string;
  store?: CollectionEpochStore;
}): string {
  const tenantKey = normalizeTenantId(params.tenantId);
  const epoch = ensureCollectionEpoch(params.collectionId, params.tenantId, params.store);
  return buildCollectionWeakEtag({
    tenantId: tenantKey,
    collectionId: params.collectionId,
    epoch,
    reprHash: collectionReprHash(params.pathname, params.search, params.userCacheId),
  });
}

export interface TryCollectionNotModifiedParams {
  pathname: string;
  search: string;
  ifNoneMatch: string | null | undefined;
  tenantId: string | null | undefined;
  userCacheId: string;
  bypass?: boolean;
  store?: CollectionEpochStore;
}

/**
 * Sync DB-free 304 when If-None-Match is a matching collection-generation ETag.
 * Returns null when the header is absent, not a collection validator, or stale.
 */
export function tryCollectionNotModified(params: TryCollectionNotModifiedParams): Response | null {
  const header = params.ifNoneMatch;
  if (params.bypass || !header || header.length < 8) return null;
  if (header === "*") return null;
  if (!header.includes("cv1|")) return null;

  const collectionId = getCollectionIdFromApiPath(params.pathname);
  if (!collectionId) return null;

  const etag = currentCollectionWeakEtag({
    collectionId,
    tenantId: params.tenantId,
    pathname: params.pathname,
    search: params.search,
    userCacheId: params.userCacheId,
    store: params.store,
  });
  if (!collectionEtagMatches(header, etag)) return null;

  return new Response(null, {
    status: 304,
    headers: {
      ETag: etag,
      "Cache-Control": "private, must-revalidate",
      Vary: "Accept-Encoding, Cookie",
      "X-Cache": "COL-304",
      "X-API-Version": "1",
    },
  });
}

export function collectionEtagResponseHeaders(etag: string): Record<string, string> {
  return {
    ETag: etag,
    "Cache-Control": "private, must-revalidate",
    Vary: "Accept-Encoding, Cookie",
    "X-Cache": "COL-ETAG",
    "X-API-Version": "1",
  };
}
