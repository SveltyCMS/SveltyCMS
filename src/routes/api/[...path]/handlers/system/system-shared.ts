/**
 * @file src/routes/api/[...path]/handlers/system/system-shared.ts
 * @description Shared authorization helpers for the split system handler modules.
 */

import { AppError } from "@utils/error-handling";
import type { RequestEvent } from "@sveltejs/kit";
import { isAdmin } from "@src/databases/auth/constants";

/**
 * Validates admin authorization against the standardized SvelteKit locals context.
 */
export function requireAdmin(event: RequestEvent): void {
  const { locals } = event;
  if (locals.isAdmin || isAdmin(locals.user)) return;
  throw new AppError("Admin access required", 403, "FORBIDDEN");
}
