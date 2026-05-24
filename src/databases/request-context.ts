import { AsyncLocalStorage } from "node:async_hooks";
import type { DatabaseId } from "./db-interface";

export interface RequestContext {
  correlationId?: string;
  tenantId?: DatabaseId | null;
  userId?: DatabaseId | null;
  actorRole?: string;
  clientIp?: string;
  spanId?: string;
  traceId?: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

/**
 * Run a function within a specific request context.
 */
export function runWithContext<T>(
  context: RequestContext,
  fn: () => T | Promise<T>,
): T | Promise<T> {
  return requestContext.run(context, fn);
}

/**
 * Get the current request context safely.
 */
export function getRequestContext(): RequestContext | undefined {
  return requestContext.getStore();
}

/**
 * Generate a new correlation ID if one doesn't exist.
 */
export function generateCorrelationId(): string {
  return globalThis.crypto?.randomUUID() || Math.random().toString(36).substring(2, 15);
}
