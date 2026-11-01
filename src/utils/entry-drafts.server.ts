/**
 * @file src/utils/entry-drafts.server.ts
 * @description Server-side draft read for the entry editor's resume banner.
 *
 * The initial resume read goes through the LocalCMS SDK (`cms.drafts`), never
 * through `fetch()` to this app's own `/api` route — the server-to-server lane
 * skips firewalls, rate limits and request serialization.
 *
 * ### Features:
 * - Reads the author's latest draft for an entry, or the author's latest
 *   new-entry draft when the form has no live entry yet
 * - Works from `locals.cms` and, while the locals facade does not expose the
 *   `drafts` key, from an SDK built on the same request-scoped adapter
 * - Missing namespace / permission denial degrade to "no draft", never a 500
 *
 * ### Contract
 * `cms.drafts.getDraft(collectionId, entryId?, { user, tenantId })` →
 * `DatabaseResult<ContentDraft | null>` (see `drafts-namespace.ts`, and
 * `/api/collections/:id/drafts` for the HTTP twin the client uses).
 */

import type { User } from "@src/databases/auth/types";
import type { IDBAdapter } from "@src/databases/db-interface";
import { LocalCMS } from "@src/services/sdk";
import { logger } from "@utils/logger";
import { rethrow } from "@utils/error-handling";
import { draftResumeFromPayload, type DraftResume } from "./entry-drafts";

export interface DraftLookupInput {
  collectionId: string;
  /** Live entry the form edits; omitted for a not-yet-created entry. */
  entryId?: string | null;
  /** Authenticated author — the namespace author-scopes and permission-gates on it. */
  user: User | null | undefined;
  tenantId?: string | null;
}

/** The subset of the SDK drafts namespace this module calls. */
interface DraftsReader {
  getDraft: (
    collectionId: string,
    entryId: string | undefined,
    options: { user: User; tenantId?: string },
  ) => Promise<unknown>;
}

/** Process-lifetime SDK instances, one per adapter (the adapter carries the tenant scope). */
const cmsByAdapter = new WeakMap<object, LocalCMS>();

function cmsForAdapter(adapter: unknown): unknown {
  if (!adapter || typeof adapter !== "object") return null;
  let cms = cmsByAdapter.get(adapter);
  if (!cms) {
    cms = new LocalCMS(adapter as IDBAdapter);
    cmsByAdapter.set(adapter, cms);
  }
  return cms;
}

/**
 * Resolve `cms.drafts.getDraft` structurally.
 *
 * `LocalCMS` namespaces are lazy proxies: an unregistered namespace reads as
 * `undefined`, a registered one always answers a callable property.
 */
function readDraftsReader(cms: unknown): DraftsReader | null {
  if (!cms || typeof cms !== "object") return null;
  const namespace = (cms as Record<string, unknown>).drafts;
  if (!namespace || typeof namespace !== "object") return null;

  const getDraft = (namespace as Record<string, unknown>).getDraft;
  if (typeof getDraft !== "function") return null;

  return {
    getDraft: (collectionId, entryId, options) =>
      (
        getDraft as (
          this: unknown,
          collectionId: string,
          entryId: string | undefined,
          options: { user: User; tenantId?: string },
        ) => Promise<unknown>
      ).call(namespace, collectionId, entryId, options),
  };
}

/** The adapter the locals facade was bound to (tenant-scoped, request-lifetime). */
function readAdapter(cms: unknown): unknown {
  if (!cms || typeof cms !== "object") return null;
  return (cms as Record<string, unknown>).db ?? null;
}

/**
 * Latest draft for the form being opened, or `null` when there is none (or the
 * drafts lane is unavailable).
 *
 * Never throws: a resume banner is an offer, and a failed offer must not take
 * the entry page down.
 */
export async function loadDraftResume(
  cms: unknown,
  input: DraftLookupInput,
): Promise<DraftResume | null> {
  const { collectionId, entryId, user, tenantId } = input;
  if (!collectionId || !user?._id) return null;

  const reader = readDraftsReader(cms) ?? readDraftsReader(cmsForAdapter(readAdapter(cms)));
  if (!reader) {
    logger.debug("[entry-drafts] Drafts namespace unavailable — no resume banner", {
      collectionId,
    });
    return null;
  }

  try {
    const answer = await reader.getDraft(collectionId, entryId ? String(entryId) : undefined, {
      user,
      ...(tenantId ? { tenantId: String(tenantId) } : {}),
    });
    return draftResumeFromPayload(answer, { entryId });
  } catch (err) {
    rethrow(err);
    logger.debug("[entry-drafts] Draft lookup failed — no resume banner", {
      collectionId,
      entryId: entryId ?? null,
      error: err instanceof Error ? err.message : "unknown error",
    });
    return null;
  }
}
