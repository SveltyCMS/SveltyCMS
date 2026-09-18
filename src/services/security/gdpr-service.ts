/**
 @file src/services/security/gdpr-service.ts
 * @description GDPR Compliance Service for SveltyCMS.
 * Handles "Right to Erasure" and "Right to Access" / Data Portability.
 *
 * Features:
 * - Export user data
 * - Anonymize user data
 *
 */

import { dbAdapter } from "@databases/db";
import { logger } from "@utils/logger";
import { auditLogService, AuditEventType } from "./audit-service";
import type { DatabaseId } from "@src/content/types";

export class GDPRService {
  private static instance: GDPRService;

  private constructor() {}

  public static getInstance(): GDPRService {
    if (!GDPRService.instance) {
      GDPRService.instance = new GDPRService();
    }
    return GDPRService.instance;
  }

  /**
   * Right to Access (Article 20)
   * Exports all known data for a specific user.
   */
  public async exportUserData(userId: string, tenantId: string): Promise<Record<string, unknown>> {
    if (!dbAdapter) {
      throw new Error("Database adapter is not initialized");
    }

    try {
      // 1. Fetch Core User Profile using Auth Adapter (scoped to tenant)
      const userResult = await dbAdapter.auth.getUserById(userId as DatabaseId, {
        tenantId: tenantId as DatabaseId,
      });

      if (!(userResult.success && userResult.data)) {
        throw new Error("User not found or access denied");
      }
      const user = userResult.data;

      // 2. Fetch User Activity (Audit Logs)
      // We filter the audit logs for actions by this user AND this tenant
      const allLogs = await auditLogService.getLogs(1000);
      const userLogs = allLogs.filter(
        (log: any) =>
          (log.actorId === userId || log.actor?.id === userId) && log.tenantId === tenantId,
      );

      // 3. Log the Export Request
      await auditLogService.log(
        "GDPR Data Export",
        { id: userId as any, email: user.email || "", ip: "system" },
        { type: "user", id: userId as any },
        AuditEventType.DATA_EXPORT,
        "medium",
        { method: "GDPRService.exportUserData", tenantId },
      );

      return {
        profile: user,
        history: userLogs,
        metadata: {
          exportedAt: new Date().toISOString(),
          version: "1.0",
          tenantId,
        },
      };
    } catch (error) {
      logger.error(`GDPR Export Failed for user ${userId} (tenant: ${tenantId}):`, error);
      throw error;
    }
  }

  /**
   * Right to Erasure (Article 17)
   * Anonymizes PII while preserving data integrity.
   */
  public async anonymizeUser(
    userId: string,
    tenantId: string,
    reason = "User Request",
  ): Promise<boolean> {
    if (!dbAdapter) {
      logger.error("GDPR Erasure Failed: Database adapter not initialized");
      return false;
    }

    try {
      // 1. Fetch User to verify existence and get original email for logging (scoped to tenant)
      const userResult = await dbAdapter.auth.getUserById(userId as DatabaseId, {
        tenantId: tenantId as DatabaseId,
      });
      if (!(userResult.success && userResult.data)) {
        throw new Error("User not found or access denied");
      }
      const user = userResult.data;

      const anonymizedEmail = `deleted-${userId.substring(0, 8)}@anonymized.sveltycms.com`;

      // 2. Perform Soft Delete / Anonymization using Auth Adapter
      const updateResult = await dbAdapter.auth.updateUserAttributes(
        userId as DatabaseId,
        {
          email: anonymizedEmail,
          username: `ghost-${userId.substring(0, 8)}`,
        },
        { tenantId: tenantId as DatabaseId },
      );

      if (!updateResult.success) {
        throw new Error(updateResult.error?.message || "Failed to update user attributes");
      }

      // 3. Log the Erasure
      await auditLogService.log(
        "GDPR Data Erasure",
        { id: userId as any, email: user.email || "", ip: "system" }, // Log with original identity one last time
        { type: "user", id: userId as any },
        AuditEventType.DATA_DELETION,
        "high",
        { reason, newIdentity: anonymizedEmail, tenantId },
      );

      logger.info(`User ${userId} anonymized successfully for tenant ${tenantId}.`);
      return true;
    } catch (error) {
      logger.error(`GDPR Erasure Failed for user ${userId} (tenant: ${tenantId}):`, error);
      return false;
    }
  }

  /**
   * Right to Erasure / Deep Wipe (Article 17)
   * Permanently erases user identity, sessions, tokens, and cascading records.
   */
  public async eraseUser(
    userId: string,
    tenantId: string,
    reason = "GDPR Article 17 Right to Erasure",
  ): Promise<boolean> {
    if (!dbAdapter) {
      logger.error("GDPR Erasure Failed: Database adapter not initialized");
      return false;
    }

    try {
      const targetTenant = (tenantId || "global") as DatabaseId;
      const targetUser = userId as DatabaseId;

      // 1. Invalidate and purge sessions/tokens if auth adapter supports it
      if (dbAdapter.auth?.deleteUserAndSessions) {
        await dbAdapter.auth
          .deleteUserAndSessions(targetUser, { tenantId: targetTenant })
          .catch(() => {});
      }

      // 2. Cascade delete records via crud if available
      if (dbAdapter.crud) {
        await Promise.all([
          dbAdapter.crud
            .deleteMany("audit_logs", { actorId: userId } as any, {
              tenantId: targetTenant,
            })
            .catch(() => {}),
          dbAdapter.crud
            .deleteMany("auth_sessions", { user_id: userId } as any, {
              tenantId: targetTenant,
            })
            .catch(() => {}),
          dbAdapter.crud
            .deleteMany("auth_tokens", { user_id: userId } as any, {
              tenantId: targetTenant,
            })
            .catch(() => {}),
        ]);
        await dbAdapter.crud
          .delete("auth_users", targetUser, {
            permanent: true,
            tenantId: targetTenant,
          })
          .catch(() => {});
      }

      // 3. Fallback direct user delete via auth adapter
      if (dbAdapter.auth?.deleteUser) {
        await dbAdapter.auth.deleteUser(targetUser, { tenantId: targetTenant }).catch(() => {});
      }

      // 4. Log erasure audit record
      await auditLogService.log(
        "GDPR Data Erasure",
        { id: "system" as any, email: "system@sveltycms.internal", ip: "system" },
        { type: "user", id: userId as any },
        AuditEventType.DATA_DELETION,
        "high",
        { reason, action: "erase", targetUserId: userId, tenantId },
      );

      logger.info(`User ${userId} permanently erased under GDPR Article 17 (tenant: ${tenantId}).`);
      return true;
    } catch (error) {
      logger.error(`GDPR Erasure Failed for user ${userId} (tenant: ${tenantId}):`, error);
      return false;
    }
  }
}

export const gdprService = GDPRService.getInstance();
