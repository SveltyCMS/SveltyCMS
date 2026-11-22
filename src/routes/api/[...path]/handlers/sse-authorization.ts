/**
 * @file src/routes/api/[...path]/handlers/sse-authorization.ts
 * @description Per-event authorization for the `/api/events` and `/api/content/events`
 * Server-Sent Events stream.
 *
 * The wildcard EventBus carries documents and entry-level signals for every tenant
 * on the process, so tenant filtering alone is not enough: a subscriber with
 * `api:events` must also have read access to the collection behind an event.
 *
 * ### Features:
 * - pure `isSseEventAllowed` predicate (Yjs doc channels + collection events)
 * - fail-closed for unknown event shapes (missing/invalid docId or collection)
 * - per-connection decision cache: one Map lookup on the hot path (docId / collection)
 * - bounded cache (LRU drop) so a long-lived stream cannot grow without limit
 */

import { logger } from "@utils/logger";
import { hasPermissionWithRoles } from "@src/databases/auth/permissions";
import { hasCollaborationAccess } from "@src/services/collaboration/access";
import { parseEntryDocId } from "@api/collaboration/yjs/yjs-access";
import type { Role, User } from "@src/databases/auth/types";

/** Event names whose payload carries raw Yjs document bytes. */
const YJS_EVENT_PREFIX = "yjs:";
const YJS_DOCUMENT_EVENTS = new Set(["yjs:sync", "yjs:awareness"]);

/** Collection id used by tenant-wide content signals (`notifyContentUpdate`). */
const WILDCARD_COLLECTION = "*";
const WILDCARD_TENANT = "all";

/** Cap on per-connection decisions (documents + collections visited). */
const MAX_CACHE_ENTRIES = 256;

type SsePayload = Record<string, unknown>;

export interface SseAccessInput {
  event: string | undefined;
  /** The `data` object emitted with the event (flattened SSE payload). */
  payload: SsePayload | null | undefined;
  user: User | null | undefined;
  roles?: Role[] | undefined;
  tenantId?: string | null;
}

/**
 * The event is authorized only when the subscriber may read what it carries:
 *
 * - `yjs:*` → `entry:{collectionId}:{entryId}` + read access to that collection.
 * - collection events (`payload.collection`) → read access to that collection;
 *   the `*` wildcard signal requires the global `collection:read` grant.
 * - everything else (unknown shape, missing ids, no user) → denied.
 *
 * Tenant filtering is applied here as well: a Yjs document must name the
 * subscriber's tenant exactly, while collection signals may be tenant-wide
 * (`"all"`) or legacy events that omit the field.
 */
export function isSseEventAllowed(input: SseAccessInput): boolean {
  const { event, payload, user, roles } = input;
  if (!user || !event) return false;
  if (tenantMismatch(input)) return false;

  if (event.startsWith(YJS_EVENT_PREFIX)) {
    return isYjsEventAllowed(event, payload, user, roles);
  }

  const collectionId = payload?.collection;
  if (typeof collectionId !== "string" || collectionId.length === 0) return false;
  if (collectionId === WILDCARD_COLLECTION) {
    return hasPermissionWithRoles(user, "collection:read", roles ?? []);
  }
  return hasCollaborationAccess(user, roles, "read", collectionId);
}

function isYjsEventAllowed(
  event: string,
  payload: SsePayload | null | undefined,
  user: User,
  roles: Role[] | undefined,
): boolean {
  const docId = payload?.docId;
  if (typeof docId !== "string" || docId.length === 0) return false;
  // A sync/awareness frame without bytes is not a document event we can trust.
  if (YJS_DOCUMENT_EVENTS.has(event) && typeof payload?.updateBase64 !== "string") return false;

  let collectionId: string;
  try {
    ({ collectionId } = parseEntryDocId(docId));
  } catch {
    // Only `entry:{collectionId}:{entryId}` channels are valid.
    return false;
  }
  return hasCollaborationAccess(user, roles, "read", collectionId);
}

function tenantMismatch({ event, payload, tenantId }: SseAccessInput): boolean {
  if (!tenantId || !event) return false;

  const rawTenant = payload?.tenantId;
  const eventTenant =
    typeof rawTenant === "string" || typeof rawTenant === "number" ? String(rawTenant) : null;

  if (event.startsWith(YJS_EVENT_PREFIX)) {
    // Document bytes are tenant-private: no missing, null or `all` wildcard.
    return eventTenant === null || eventTenant !== String(tenantId);
  }

  // Legacy collection signals may omit tenantId; an explicit tenant must match.
  if (eventTenant === null) return false;
  return eventTenant !== WILDCARD_TENANT && eventTenant !== String(tenantId);
}

/**
 * Cache key for a decision. `undefined` means the event has no stable subject
 * (unknown shape), so it is re-evaluated and dropped on every occurrence.
 */
export function sseAccessCacheKey(
  event: string | undefined,
  payload: SsePayload | null | undefined,
): string | undefined {
  if (!event) return undefined;

  if (event.startsWith(YJS_EVENT_PREFIX)) {
    const docId = payload?.docId;
    return typeof docId === "string" && docId.length > 0
      ? `${YJS_EVENT_PREFIX}${docId}`
      : undefined;
  }

  const collectionId = payload?.collection;
  return typeof collectionId === "string" && collectionId.length > 0
    ? `collection:${collectionId}`
    : undefined;
}

export interface SseAuthorizerOptions {
  user: User | null | undefined;
  roles?: Role[] | undefined;
  tenantId?: string | null;
}

export interface SseAuthorizer {
  /** Cached verdict (one Map lookup), or `undefined` when it must be checked. */
  peek(event: string | undefined, payload: SsePayload | null | undefined): boolean | undefined;
  /** Resolve and cache the verdict for this connection. */
  authorize(event: string | undefined, payload: SsePayload | null | undefined): Promise<boolean>;
}

/** Per-connection authorizer: the decision cache is scoped to one SSE subscriber. */
export function createSseAuthorizer(options: SseAuthorizerOptions): SseAuthorizer {
  const cache = new Map<string, boolean>();

  return {
    peek(event, payload) {
      const key = sseAccessCacheKey(event, payload);
      return key === undefined ? undefined : cache.get(key);
    },

    async authorize(event, payload) {
      const key = sseAccessCacheKey(event, payload);
      if (key !== undefined) {
        const cached = cache.get(key);
        if (cached !== undefined) return cached;
      }

      const allowed = isSseEventAllowed({
        event,
        payload,
        user: options.user,
        roles: options.roles,
        tenantId: options.tenantId,
      });

      if (key !== undefined) remember(cache, key, allowed);
      if (!allowed) {
        // Do not log the payload: it may contain document bytes or entry data.
        logger.debug(
          `[SSE] Dropped event "${event ?? "unknown"}" (tenant ${options.tenantId ?? "global"})`,
        );
      }
      return allowed;
    },
  };
}

function remember(cache: Map<string, boolean>, key: string, allowed: boolean): void {
  if (!cache.has(key) && cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, allowed);
}
