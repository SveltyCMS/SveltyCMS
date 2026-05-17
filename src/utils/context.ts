/**
 * @file src/utils/context.ts
 * @description
 * Context tracking and distributed high-performance tracing module.
 *
 * Responsibilities include:
 * - Managing request scope variables (tenantId, userId, permissions) via AsyncLocalStorage.
 * - Implementing zero-tax distributed tracing with asynchronous spans for performance diagnostics.
 *
 * ### Features:
 * - AsyncLocalStorage request isolation
 * - Conditional high-resolution (µs) tracer
 * - Zero-cost hotpath short-circuit
 */

import { AsyncLocalStorage } from "node:async_hooks";
import type { DatabaseId } from "@src/content/types";

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

export function getUserId(): DatabaseId | null | undefined {
  return sveltyContext.getStore()?.userId;
}

export function getTrace(): TraceContext | undefined {
  return sveltyContext.getStore()?.trace;
}

export function runWithContext<R>(context: SveltyContext, callback: () => R): R {
  return sveltyContext.run(context, callback);
}

/**
 * Executes a callback within a conditional tracing context.
 *
 * @param traceId Unique tracking identifier for the execution chain.
 * @param enabled Whether granular span profiling should be captured.
 * @param callback Action to execute.
 */
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

/**
 * Wraps an asynchronous action inside a tracing span.
 * Short-circuits with absolute zero overhead if tracing is not enabled.
 */
export async function traceSpan<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const store = sveltyContext.getStore();
  const trace = store?.trace;
  if (!trace || !trace.enabled) {
    return fn();
  }

  const span: TraceSpan = { name, start: performance.now() };
  trace.spans.push(span);

  try {
    return await fn();
  } finally {
    span.duration = parseFloat((performance.now() - span.start).toFixed(3));
  }
}

/**
 * Wraps a synchronous action inside a tracing span.
 * Short-circuits with absolute zero overhead if tracing is not enabled.
 */
export function traceSpanSync<T>(name: string, fn: () => T): T {
  const store = sveltyContext.getStore();
  const trace = store?.trace;
  if (!trace || !trace.enabled) {
    return fn();
  }

  const span: TraceSpan = { name, start: performance.now() };
  trace.spans.push(span);

  try {
    return fn();
  } finally {
    span.duration = parseFloat((performance.now() - span.start).toFixed(3));
  }
}
