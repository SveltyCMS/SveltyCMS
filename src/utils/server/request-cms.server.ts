/**
 * @file src/utils/server/request-cms.server.ts
 * @description In-process LocalCMS for remote functions and +page.server.ts.
 * Never `event.fetch("/api/...")` from the server — that re-enters hooks/JSON.
 */

import { getRequestEvent } from "$app/server";
import { getDb } from "@src/databases/db";
import { LocalCMS } from "@src/services/sdk";
import type { DatabaseId } from "@src/databases/db-interface";
import { AppError } from "@utils/error-handling";

let cached: { adapter: NonNullable<ReturnType<typeof getDb>>; cms: LocalCMS } | null = null;

export async function getRequestLocalCMS(): Promise<{
  cms: LocalCMS;
  locals: App.Locals;
  tenantId: DatabaseId | null;
}> {
  const event = getRequestEvent();
  const adapter = getDb();
  if (!adapter) throw new AppError("Database not initialized", 503, "DB_UNAVAILABLE");
  if (!cached || cached.adapter !== adapter) {
    cached = { adapter, cms: new LocalCMS(adapter) };
  }
  const tenantId = (event.locals.tenantId ?? null) as DatabaseId | null;
  return { cms: cached.cms, locals: event.locals, tenantId };
}

export function remoteErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === "object" && "message" in err && typeof err.message === "string") {
    return err.message;
  }
  return fallback;
}
