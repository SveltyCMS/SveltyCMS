/**
 * @file src/routes/(app)/audit-history.remote.ts
 * @description Remote functions for the audit history sidebar widget.
 */

import { getRequestEvent, query } from "$app/server";
import { getAuthenticatedUser } from "@utils/page-guards.server";

export const queryAuditLogs = query(
  "unchecked",
  async ({ targetId, limit = 50 }: { targetId: string; limit?: number }) => {
    const event = getRequestEvent();
    getAuthenticatedUser(event.locals);
    const { tenantId } = event.locals;

    const { auditLogService } = await import("@src/services/security/audit-service");
    return auditLogService.queryLogs({
      filters: { targetId },
      limit,
      tenantId,
    });
  },
);

export const verifyAuditChain = query("unchecked", async (_input: Record<string, never>) => {
  const event = getRequestEvent();
  getAuthenticatedUser(event.locals);
  const { tenantId } = event.locals;

  const { auditChainService } = await import("@src/services/audit-chain");
  return auditChainService.verifyChain(tenantId as string | undefined);
});
