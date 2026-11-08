/**
 * @file src/content/status.ts
 * @description Publication status values shared by client and server.
 *
 * These live outside `content/types.ts` because that module is a type surface
 * (interfaces and branded ids, ~650 LOC). A client component needs the
 * `StatusTypes` object at runtime, and importing it from `types.ts` charged the
 * whole type module to the client graph. `types.ts` re-exports both names, so
 * server-side imports are unchanged.
 *
 * Features:
 * - `as const` map: the value list doubles as the union type
 * - No imports (safe in any runtime)
 */

export const StatusTypes = {
  archive: "archive",
  draft: "draft",
  publish: "publish",
  unpublish: "unpublish",
  schedule: "schedule",
  clone: "clone",
  delete: "delete",
} as const;

export type StatusType = (typeof StatusTypes)[keyof typeof StatusTypes];
