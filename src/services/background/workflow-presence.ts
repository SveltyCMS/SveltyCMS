/**
 * @file src/services/background/workflow-presence.ts
 * @description
 * Sync record of which collections have a review workflow.
 *
 * WorkflowService writes this when a definition lookup caches a hit or a
 * confirmed miss. The create and bulk-import paths read it so they do not
 * import the workflow service, or query the workflow table, unless a
 * definition was actually found. Unknown (no lookup yet, or the note expired)
 * is not an absence: a bulk import still does one lookup.
 *
 * ### Features:
 * - positive / confirmed-absent notes with the same 60s window as the workflow cache
 * - full forget when that cache is invalidated
 */

const NOTE_TTL_MS = 60_000;

interface WorkflowNote {
  present: boolean;
  exp: number;
}

const notes = new Map<string, WorkflowNote>();

function noteKey(collectionId: string, tenantId?: string | null): string {
  return `${tenantId && String(tenantId).length > 0 ? String(tenantId) : "global"}:${collectionId}`;
}

function readNote(collectionId: string, tenantId?: string | null): WorkflowNote | undefined {
  const key = noteKey(collectionId, tenantId);
  const note = notes.get(key);
  if (!note) return undefined;
  if (note.exp <= Date.now()) {
    notes.delete(key);
    return undefined;
  }
  return note;
}

/** Remember a lookup result. `present` is true only for a real definition. */
export function noteWorkflowPresence(
  collectionId: string,
  tenantId: string | null | undefined,
  present: boolean,
): void {
  notes.set(noteKey(collectionId, tenantId), { present, exp: Date.now() + NOTE_TTL_MS });
}

/** Drop every note. Matches WorkflowService's full cache clear. */
export function forgetWorkflowPresence(): void {
  notes.clear();
}

/** True only after a lookup cached a real definition for this collection. */
export function workflowApplies(collectionId: string, tenantId?: string | null): boolean {
  return readNote(collectionId, tenantId)?.present === true;
}

/** True after a lookup cached "no workflow" and the note is still fresh. */
export function workflowKnownAbsent(collectionId: string, tenantId?: string | null): boolean {
  const note = readNote(collectionId, tenantId);
  return note !== undefined && note.present === false;
}
