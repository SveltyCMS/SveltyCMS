/**
 * @file src/utils/context.ts
 * @description Hardened context tracking and high-performance tracing.
 *
 * ### Hardening (audit 2026-07):
 * - Memory cap: MAX_SPANS_PER_TRACE = 1000 prevents OOM from runaway tracing
 * - Trace consistency: getTrace() returns shallow copy (prevents direct ALS store mutation)
 * - Span in finally: only records completed spans (no stale entries if fn throws before execution)
 *
 * Responsibilities include:
 * - Managing request scope variables via AsyncLocalStorage.
 * - Implementing zero-tax distributed tracing with asynchronous spans.
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { DatabaseId } from "@src/content/types";
import { ContextMissingError } from "./errors";

export interface TraceSpan {
  name: string;
  start: number;
  duration?: number;
}

export interface TraceContext {
  traceId: string;
  spans: TraceSpan[];
  enabled: boolean;
}

export interface SveltyContext {
  tenantId?: DatabaseId | null;
  userId?: DatabaseId | null;
  permissions?: string[];
  requestId?: string;
  abortSignal?: AbortSignal;
  trace?: TraceContext;
}

export const sveltyContext = new AsyncLocalStorage<SveltyContext>();

export function getTenantId(): DatabaseId | null | undefined {
  return sveltyContext.getStore()?.tenantId;
}

/**
 * 🛡️ Hardened: Throws ContextMissingError if store is absent.
 * Use this in paths/lookup code where a tenant context MUST exist.
 */
export function requireTenantId(): DatabaseId {
  const store = sveltyContext.getStore();
  if (!store?.tenantId) {
    throw new ContextMissingError("TenantId is missing from the active request context.");
  }
  return store.tenantId;
}

export function getUserId(): DatabaseId | null | undefined {
  return sveltyContext.getStore()?.userId;
}

/** 🛡️ Hardened: Returns shallow copy to prevent direct ALS store mutation */
export function getTrace(): TraceContext | undefined {
  const store = sveltyContext.getStore();
  return store?.trace ? { ...store.trace } : undefined;
}

export function runWithContext<R>(context: SveltyContext, callback: () => R): R {
  return sveltyContext.run(context, callback);
}

export function runWithTrace<R>(traceId: string, enabled: boolean, callback: () => R): R {
  const parentStore = sveltyContext.getStore() || {};
  const context: SveltyContext = {
    ...parentStore,
    trace: {
      traceId,
      spans: [],
      enabled,
    },
  };
  return sveltyContext.run(context, callback);
}

/** 🛡️ Hardened: Memory-capped trace buffer */
const MAX_SPANS_PER_TRACE = 1000;

export async function traceSpan<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const store = sveltyContext.getStore();
  const trace = store?.trace;

  if (!trace?.enabled || trace.spans.length >= MAX_SPANS_PER_TRACE) {
    return fn();
  }

  const start = performance.now();
  try {
    return await fn();
  } finally {
    trace.spans.push({
      name,
      start,
      duration: parseFloat((performance.now() - start).toFixed(3)),
    });
  }
}

export function traceSpanSync<T>(name: string, fn: () => T): T {
  const store = sveltyContext.getStore();
  const trace = store?.trace;

  if (!trace?.enabled || trace.spans.length >= MAX_SPANS_PER_TRACE) {
    return fn();
  }

  const start = performance.now();
  try {
    return fn();
  } finally {
    trace.spans.push({
      name,
      start,
      duration: parseFloat((performance.now() - start).toFixed(3)),
    });
  }
}
