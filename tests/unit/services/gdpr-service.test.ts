/**
 * @file tests/unit/services/GDPRService.test.ts
 * @description Unit tests for the GDPR Compliance Service
 *
 * Tests:
 * - Export user data
 * - Anonymize user
 * - Error handling
 * - User not found
 * - Ghost identity
 * - Audit logging
 */

import { gdprService } from "@src/services/security/gdpr-service";

// Access global mocks from bun-preload.ts
const mockAuditLog = (globalThis as any).mockAuditLog;
const mockDbAdapter = (globalThis as any).mockDbAdapter;

describe("GDPRService", () => {
  const tenantId = "tenant-1";

  beforeEach(() => {
    mockAuditLog.log.mockClear();
    mockAuditLog.getLogs.mockClear();
    (mockDbAdapter.auth.getUserById as any).mockImplementation((id: string, tid: string) =>
      Promise.resolve({
        success: true,
        data: {
          _id: id,
          email: "test@example.com",
          username: "tester",
          tenantId: tid,
        },
      }),
    );
    mockDbAdapter.auth.updateUserAttributes.mockImplementation(() =>
      Promise.resolve({ success: true }),
    );
  });

  describe("exportUserData", () => {
    it("should fetch user profile and related logs", async () => {
      const userId = "123";
      const mockLogs = [
        { actor: { id: "123" }, action: "entry.create", tenantId },
        { actor: { id: "456" }, action: "entry.update", tenantId }, // different user
      ];
      mockAuditLog.getLogs.mockReturnValue(Promise.resolve(mockLogs as any));

      const result = (await gdprService.exportUserData(userId, tenantId)) as any;

      expect(mockDbAdapter.auth.getUserById).toHaveBeenCalledWith(userId, {
        tenantId,
      });
      expect(mockAuditLog.getLogs).toHaveBeenCalled();
      expect(result.profile._id).toBe(userId);
      expect(result.history).toHaveLength(1);
      expect(result.history[0].action).toBe("entry.create");
      expect(mockAuditLog.log).toHaveBeenCalledWith(
        "GDPR Data Export",
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });

    it("should throw error if user not found", async () => {
      const nonExistentUserId = "non-existent-user-123";
      mockDbAdapter.auth.getUserById.mockReturnValue(
        Promise.resolve({ success: false, data: null as any }),
      );
      await expect(gdprService.exportUserData(nonExistentUserId, tenantId)).rejects.toThrow(
        "User not found",
      );
    });
  });

  describe("anonymizeUser", () => {
    it("should update user attributes with ghost identity", async () => {
      const userId = "123";
      const result = await gdprService.anonymizeUser(userId, tenantId);

      expect(result).toBe(true);
      expect(mockDbAdapter.auth.updateUserAttributes).toHaveBeenCalledWith(
        userId,
        expect.objectContaining({
          email: expect.stringContaining("anonymized.sveltycms.com"),
          username: expect.stringContaining("ghost-"),
        }),
        { tenantId },
      );
      expect(mockAuditLog.log).toHaveBeenCalledWith(
        "GDPR Data Erasure",
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
        expect.anything(),
      );
    });

    it("should return false if user is not found", async () => {
      const nonExistentUserId = "non-existent-user-123";
      mockDbAdapter.auth.getUserById.mockReturnValue(
        Promise.resolve({ success: false, data: null as any }),
      );
      const result = await gdprService.anonymizeUser(nonExistentUserId, tenantId);
      expect(result).toBe(false);
    });
  });
});
