/**
 * @file src/utils/entry-drafts.ts
 * @description Editor side of draft/live separation: the autosave sink writes a
 * `content_drafts` row instead of the live entry, and the editor offers to
 * resume or discard it on the next visit.
 *
 * ### Features:
 * - Draft body builder — a new-entry draft is marked `data.__draft.kind = "new"`
 *   and carries no `_id`, so a resume can never stamp a live id onto a new form
 * - Draft → form values (`_id` always comes from the live entry, never the draft)
 * - Resume response normalization (API/SDK envelopes → `DraftResume`)
 * - Save/discard actions with injected API calls, so the whole write path is
 *   unit-testable without a network or a mounted page
 * - Idempotent discard keys, so Save + Cancel on the same form issues one request
 */

import type { ApiResponse } from "@utils/http-client";
import type { DraftRecord, DraftSavePayload } from "@utils/api";
import type { ISODateString } from "@src/content/types";
import { logger } from "@utils/logger";
import { rethrow } from "./rethrow";

/** Marker key the draft row carries inside `data` (see roadmap: draft storage). */
const DRAFT_MARKER_KEY = "__draft";

/** Marker value that says "this draft has no live entry yet". */
const NEW_ENTRY_DRAFT_KIND = "new";

/**
 * What the editor needs to offer a resume: the stored draft plus the exact form
 * values a Restore would apply.
 *
 * `data` is pre-computed here (not in the page) so both readers — the server
 * loader and the client point read — apply the same rules: the draft's own
 * `_id`/timestamps/future entries never reach the form, and a new-entry draft
 * never carries a live id.
 */
export interface DraftResume {
  draft: DraftRecord;
  data: Record<string, unknown>;
  /** True when the draft was written from a form that has no live entry yet. */
  isNewEntry: boolean;
}

/** Body sent to the draft endpoint; mirrors `DraftSavePayload` as an alias. */
export type DraftBody = DraftSavePayload;

export type DraftDiscardOutcome = "discarded" | "nothing" | "failed";

/** Injected transport so the module never imports the client API at runtime. */
export type DraftReader = (
  collectionId: string,
  entryId?: string,
) => Promise<ApiResponse<DraftRecord | null>>;
export type DraftWriter = (
  collectionId: string,
  payload: DraftBody,
) => Promise<ApiResponse<DraftRecord>>;
export type DraftDiscarder = (
  collectionId: string,
  draftId: string,
) => Promise<ApiResponse<unknown>>;
export type EntryDraftDiscarder = (
  collectionId: string,
  entryId: string,
) => Promise<ApiResponse<unknown>>;

/** Narrows an untrusted value to a plain record. */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * Normalize a draft row from an API or SDK envelope.
 *
 * Both lanes answer `{ success, data }` (API) or the row itself (SDK). Anything
 * without an `_id` and an object `data` is not a draft: returning `null` keeps a
 * malformed payload from opening an empty resume banner.
 */
export function asDraftRecord(value: unknown): DraftRecord | null {
  const envelope = asRecord(value);
  if (!envelope) return null;
  const payload = envelope.success === true && "data" in envelope ? envelope.data : value;
  const row = asRecord(payload);
  if (!row) return null;

  const id = typeof row._id === "string" ? row._id : "";
  const data = asRecord(row.data);
  if (!id || !data) return null;

  const status = row.status === "review" || row.status === "archived" ? row.status : "draft";
  return {
    _id: id,
    contentId: typeof row.contentId === "string" ? row.contentId : "",
    collectionId: typeof row.collectionId === "string" ? row.collectionId : "",
    authorId: typeof row.authorId === "string" ? row.authorId : "",
    data,
    version: typeof row.version === "number" ? row.version : 0,
    status,
    createdAt: (typeof row.createdAt === "string" ? row.createdAt : "") as ISODateString,
    updatedAt: (typeof row.updatedAt === "string" ? row.updatedAt : "") as ISODateString,
  };
}

/** True when the draft was written from a form with no live entry. */
export function isNewEntryDraft(draft: DraftRecord): boolean {
  const marker = asRecord(draft.data[DRAFT_MARKER_KEY]);
  return marker?.kind === NEW_ENTRY_DRAFT_KIND;
}

/**
 * Build the request body for the autosave sink.
 *
 * The live identity is the row's `entryId`/`contentId`, never a copy inside the
 * snapshot: stripping `_id` is what makes "a resumed draft must not stamp a live
 * id onto a new form" a property of the payload instead of a UI convention.
 *
 * A new-entry draft has no live row, so the second autosave of the same session
 * passes the draft's own `contentId` as `entryId` — that is the SDK's documented
 * resume path (`saveDraft` re-adds the `__draft.kind = "new"` marker), and it
 * keeps one row per session instead of one per keystroke burst.
 */
export function buildDraftSaveBody(
  entryData: Record<string, unknown>,
  options: { draftEntryId?: string | null } = {},
): DraftBody {
  const data: Record<string, unknown> = { ...entryData };
  delete data._id;
  delete data.__draft;

  const rawId = entryData._id;
  const liveEntryId = rawId === undefined || rawId === null ? "" : String(rawId);
  if (liveEntryId) return { entryId: liveEntryId, data };

  // No live row yet: the draft stands in for the entry until Save/Publish, and
  // every autosave of the session carries the marker the SDK looks for.
  data.__draft = { kind: NEW_ENTRY_DRAFT_KIND };
  const resumedEntryId = options.draftEntryId ? String(options.draftEntryId) : "";
  return resumedEntryId ? { entryId: resumedEntryId, data } : { data };
}

/**
 * Form values for a Restore.
 *
 * - a new-entry draft yields no `_id` at all (the M1 invariant)
 * - an edit draft yields the live entry's `_id`, never the draft's
 * - the draft's own stamps and marker are not form fields
 */
export function draftFormData(
  draft: DraftRecord,
  liveEntryId?: string | null,
): Record<string, unknown> {
  const data: Record<string, unknown> = { ...draft.data };
  delete data._id;
  delete data.createdAt;
  delete data.updatedAt;
  delete data[DRAFT_MARKER_KEY];

  if (liveEntryId) data._id = liveEntryId;
  return data;
}

/**
 * Turn a stored draft into a resume offer.
 *
 * `entryId` names the form being opened. An entry form only accepts a draft for
 * that entry (`contentId`); a create form only accepts a draft explicitly marked
 * as new-entry. Anything else is not offered — applying another entry's draft
 * would silently edit the wrong document.
 */
export function draftResumeFor(
  draft: DraftRecord,
  options: { entryId?: string | null } = {},
): DraftResume | null {
  const entryId = options.entryId ? String(options.entryId) : "";

  if (entryId) {
    if (String(draft.contentId) !== entryId) return null;
    return { draft, data: draftFormData(draft, entryId), isNewEntry: false };
  }

  if (!isNewEntryDraft(draft)) return null;
  return { draft, data: draftFormData(draft), isNewEntry: true };
}

/** Normalize a raw API/SDK draft answer into a resume offer for this form. */
export function draftResumeFromPayload(
  value: unknown,
  options: { entryId?: string | null } = {},
): DraftResume | null {
  const draft = asDraftRecord(value);
  return draft ? draftResumeFor(draft, options) : null;
}

/**
 * True when restoring would actually change the form.
 *
 * An autosave that landed after the previous save can leave a draft identical to
 * the live row; offering it would be a banner with nothing behind it. The
 * comparison is on the form snapshot the page already tracks, so it costs one
 * string compare per open.
 */
export function hasRestorableChanges(
  resume: DraftResume,
  baselineSnapshot: string | null | undefined,
): boolean {
  if (!baselineSnapshot) return true;
  try {
    return JSON.stringify(resume.data) !== JSON.stringify(JSON.parse(baselineSnapshot));
  } catch (err) {
    rethrow(err);
    logger.debug("[entry-drafts] Baseline snapshot is not JSON — offering the draft", {
      draftId: resume.draft._id,
    });
    return true;
  }
}

/** Read the current author's latest draft for a form (injected transport). */
export async function readDraftResume(input: {
  collectionId: string;
  entryId?: string | null;
  read: DraftReader;
}): Promise<DraftResume | null> {
  const { collectionId, entryId, read } = input;
  if (!collectionId) return null;

  try {
    const result = await read(collectionId, entryId ? String(entryId) : undefined);
    if (!result?.success) {
      logger.debug("[entry-drafts] Draft read answered without a draft", {
        collectionId,
        entryId: entryId ?? null,
        code: result?.code,
      });
      return null;
    }
    return draftResumeFromPayload(result.data ?? null, { entryId });
  } catch (err) {
    rethrow(err);
    logger.debug("[entry-drafts] Draft read failed", {
      collectionId,
      error: err instanceof Error ? err.message : "unknown error",
    });
    return null;
  }
}

/**
 * Write the autosave payload as a draft. Mirrors the `saveDraft` dependency the
 * navigation guard already takes — the guard decides *whether* to write, this
 * decides *what* is written.
 *
 * Returns the stored draft, or `null` when the write did not land. It never
 * touches `collections.activeValue`: the live row is Save's job, not autosave's.
 */
export async function saveEntryDraft(input: {
  collectionId: string;
  entryData: Record<string, unknown>;
  /** `contentId` of the open new-entry draft, so a re-autosave upserts it. */
  draftEntryId?: string | null;
  save: DraftWriter;
}): Promise<DraftRecord | null> {
  const { collectionId, entryData, draftEntryId, save } = input;
  if (!collectionId) return null;

  const body = buildDraftSaveBody(entryData, { draftEntryId });
  try {
    const result = await save(collectionId, body);
    if (!result?.success) {
      logger.error("[entry-drafts] Draft write failed", {
        collectionId,
        code: result?.code,
        error: result?.error || result?.message,
      });
      return null;
    }

    const draft = asDraftRecord(result.data);
    if (!draft) {
      logger.error("[entry-drafts] Draft endpoint answered without a draft row", { collectionId });
      return null;
    }
    return draft;
  } catch (err) {
    rethrow(err);
    logger.error("[entry-drafts] Draft write threw", {
      collectionId,
      error: err instanceof Error ? err.message : "unknown error",
    });
    return null;
  }
}

/**
 * Discard key for one form's drafts.
 *
 * The key names the address the discard used (`entry:` when the form has a live
 * row, `draft:` for a new-entry form), so repeated events for the same form —
 * Save also fires a navigation — collapse onto one DELETE instead of looping.
 */
export function draftDiscardKey(input: {
  collectionId: string;
  entryId?: string | null;
  draftId?: string | null;
}): string {
  const target = input.entryId ? `entry:${input.entryId}` : `draft:${input.draftId ?? ""}`;
  return `${input.collectionId}:${target}`;
}

/** A discard that finds nothing left (backend cleared it, or 404) is a success. */
function isDismissed(result: ApiResponse<unknown> | undefined): boolean {
  if (!result) return false;
  if (result.success) return true;
  return result.code === "HTTP_404" || result.code === "NOT_FOUND";
}

/**
 * Discard the drafts behind one form.
 *
 * One request, chosen by the strongest address available:
 * 1. a live entry → clear every draft for it (also covers drafts from earlier
 *    sessions that the user never restored)
 * 2. a new-entry draft → delete that one row by id (the only address it has)
 */
export async function discardEntryDrafts(input: {
  collectionId: string;
  entryId?: string | null;
  draftId?: string | null;
  discardOne: DraftDiscarder;
  discardAll: EntryDraftDiscarder;
}): Promise<DraftDiscardOutcome> {
  const { collectionId, entryId, draftId, discardOne, discardAll } = input;
  if (!collectionId) return "nothing";
  if (!entryId && !draftId) return "nothing";

  try {
    const result = entryId
      ? await discardAll(collectionId, String(entryId))
      : await discardOne(collectionId, String(draftId));

    if (isDismissed(result)) return "discarded";
    logger.warn("[entry-drafts] Draft discard failed", {
      collectionId,
      entryId: entryId ?? null,
      code: result?.code,
      error: result?.error || result?.message,
    });
    return "failed";
  } catch (err) {
    rethrow(err);
    logger.warn("[entry-drafts] Draft discard threw", {
      collectionId,
      error: err instanceof Error ? err.message : "unknown error",
    });
    return "failed";
  }
}
