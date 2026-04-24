import { AsyncLocalStorage } from "node:async_hooks";
import type { DatabaseId } from "@src/content/types";

export interface SveltyContext {
  tenantId?: DatabaseId | null;
  userId?: DatabaseId | null;
  permissions?: string[];
  requestId?: string;
  abortSignal?: AbortSignal;
}

export const sveltyContext = new AsyncLocalStorage<SveltyContext>();

export function getTenantId(): DatabaseId | null | undefined {
  return sveltyContext.getStore()?.tenantId;
}

export function getUserId(): DatabaseId | null | undefined {
  return sveltyContext.getStore()?.userId;
}

export function runWithContext<R>(context: SveltyContext, callback: () => R): R {
  return sveltyContext.run(context, callback);
}
