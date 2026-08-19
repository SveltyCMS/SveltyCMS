/**
 * @file src/routes/(app)/audit-history.remote.ts
 * @description Remote functions for the audit history sidebar widget.
 */

import { getRequestEvent, query } from "$app/server";
import { getAuthenticatedUser } from "@utils/page-guards.server";

export const queryAuditLogs = query(
  "unchecked",
  async ({
    targetId,
    limit = 50,
  }: {
    targetId: string;
    limit?: number;
  }): Promise<{
    success: boolean;
    data: unknown[];
    message?: string;
  }> => {
    const event = getRequestEvent();
    getAuthenticatedUser(event.locals);
    const { tenantId } = event.locals;

    const { auditLogService } = await import("@src/services/security/audit-service");
    const result = await auditLogService.queryLogs({
      filters: { targetId },
      limit,
      tenantId,
    });

    if (!result) {
      return { success: false, data: [], message: "No audit result returned" };
    }

    return {
      success: result.success !== false,
      data: Array.isArray(result.data) ? result.data : [],
      message: result.message,
    };
  },
);

export const verifyAuditChain = query("unchecked", async (_input: Record<string, never>) => {
  const event = getRequestEvent();
  getAuthenticatedUser(event.locals);
  const { tenantId } = event.locals;

  const { auditChainService } = await import("@src/services/audit-chain");
  return auditChainService.verifyChain(tenantId as string | undefined);
});
