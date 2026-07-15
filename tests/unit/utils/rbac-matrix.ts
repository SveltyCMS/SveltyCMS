/**
 * @file tests/unit/utils/rbac-matrix.ts
 * @description Lightweight table-driven RBAC runner for catch-all dispatcher unit tests.
 *
 * Stays thin: one row = one invokeApi call + status assertion. No HTTP client, no DB tx.
 *
 * @example
 * await runRbacMatrix([
 *   { name: "editor denied write", method: "POST", path: "collections/posts",
 *     user: editor, roles: editorNoPerms, expectedStatus: 403, bypass: false },
 * ]);
 */

import { expect } from "vitest";
import type { MockEventOptions } from "./mock-event";
import { invokeApi, type HttpMethod } from "./mock-event";

export interface RbacMatrixRow {
  /** Stable name used in assertion messages */
  name: string;
  method: HttpMethod | string;
  /** Catch-all path without leading /api/ (e.g. collections/posts) */
  path: string;
  body?: unknown;
  user?: MockEventOptions["user"];
  roles?: MockEventOptions["roles"];
  tenantId?: string | null;
  /** Default false for real authz — set true only when testing handler logic after bypass */
  bypass?: boolean;
  /**
   * Exact status, or list of acceptable statuses.
   * Omit when using `expectedNotStatus` only (e.g. "authz passed, deeper 4xx ok").
   */
  expectedStatus?: number | number[];
  /** Status codes that must NOT occur (e.g. [401, 403] when permission should pass) */
  expectedNotStatus?: number | number[];
  /** Optional extra MockEventOptions (dbAdapter, headers, formData, …) */
  options?: Omit<
    MockEventOptions,
    "method" | "path" | "body" | "user" | "roles" | "tenantId" | "bypass"
  >;
}

/**
 * Run each RBAC row sequentially against the production catch-all dispatcher.
 * Keeps apiHandler real so AppError becomes Response status codes.
 */
export async function runRbacMatrix(rows: RbacMatrixRow[]): Promise<void> {
  for (const row of rows) {
    if (row.expectedStatus === undefined && row.expectedNotStatus === undefined) {
      throw new Error(`[rbac] ${row.name}: set expectedStatus and/or expectedNotStatus`);
    }

    const res = await invokeApi(row.method, {
      path: row.path,
      body: row.body,
      user: row.user === undefined ? null : row.user,
      roles: row.roles ?? [],
      tenantId: "tenantId" in row ? row.tenantId : "t1",
      bypass: row.bypass ?? false,
      ...row.options,
    });

    if (row.expectedStatus !== undefined) {
      const allowed = Array.isArray(row.expectedStatus) ? row.expectedStatus : [row.expectedStatus];
      expect(
        allowed,
        `[rbac] ${row.name}: expected status in [${allowed.join(", ")}], got ${res.status} for ${row.method} /api/${row.path}`,
      ).toContain(res.status);
    }

    if (row.expectedNotStatus !== undefined) {
      const forbidden = Array.isArray(row.expectedNotStatus)
        ? row.expectedNotStatus
        : [row.expectedNotStatus];
      expect(
        forbidden,
        `[rbac] ${row.name}: status ${res.status} must not be in [${forbidden.join(", ")}] for ${row.method} /api/${row.path}`,
      ).not.toContain(res.status);
    }
  }
}
