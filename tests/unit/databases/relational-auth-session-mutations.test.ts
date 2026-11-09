/**
 * @file tests/unit/databases/relational-auth-session-mutations.test.ts
 * @description Unit coverage for the single-statement auth-session mutations.
 * Rotation now swaps the session id in place (only `_id` + `expires` are SET, so
 * every other column carries over byte-identical), expiry updates use
 * UPDATE … RETURNING where supported, token-data reads project only the needed
 * columns, and expired-session cleanup reports the real affected-row count.
 *
 * Features:
 * - rotateToken: one UPDATE, only `_id` + `expires` mutated
 * - updateSessionExpiry: RETURNING path vs fallback, `nowISODateString`
 * - getSessionTokenData: projected `expires`/`user_id` selection
 * - deleteExpiredSessions: real `rowsAffected`
 */

import { describe, expect, it, vi } from "vitest";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { RelationalAuthModule } from "@src/databases/core/relational-auth";

const authSessions = sqliteTable("auth_sessions", {
  _id: text("_id").primaryKey(),
  user_id: text("user_id"),
  expires: integer("expires"),
  tenantId: text("tenantId"),
  userAgent: text("userAgent"),
  deviceId: text("deviceId"),
  ipAddress: text("ipAddress"),
  amr: text("amr"),
  mfaVerifiedAt: integer("mfaVerifiedAt"),
  createdAt: integer("createdAt"),
  updatedAt: integer("updatedAt"),
});

function makeModule(db: Record<string, unknown>, extraAdapter: Record<string, unknown> = {}) {
  const adapter = {
    db,
    getPhysicalSelection: (table: unknown) => table,
    wrap: async (fn: () => Promise<unknown>) => {
      try {
        return { success: true as const, data: await fn() };
      } catch (error) {
        return {
          success: false as const,
          error: { code: "ERR", message: String(error) },
        };
      }
    },
    ...extraAdapter,
  };
  return new RelationalAuthModule(adapter as never, { authSessions });
}

describe("RelationalAuthModule session mutations", () => {
  describe("rotateToken", () => {
    it("rotates with a single UPDATE touching only _id and expires", async () => {
      const updateWhere = vi.fn().mockResolvedValue({ changes: 1 });
      const updateSet = vi.fn((_data: Record<string, unknown>) => ({ where: updateWhere }));
      const updateFn = vi.fn(() => ({ set: updateSet }));
      const module = makeModule({ update: updateFn });

      const res = await module.rotateToken(
        "old-token" as never,
        "2026-01-01T00:00:00.000Z" as never,
      );

      expect(res.success).toBe(true);
      if (!res.success) throw new Error("expected success");
      expect(typeof res.data).toBe("string");

      expect(updateFn).toHaveBeenCalledWith(authSessions);
      expect(updateSet).toHaveBeenCalledTimes(1);
      const setArg = updateSet.mock.calls[0][0];
      // Only these two columns may differ — every other column (MFA proof,
      // device metadata, createdAt/updatedAt) carries over byte-identical.
      expect(Object.keys(setArg).sort()).toEqual(["_id", "expires"]);
      expect(setArg.expires).toBeInstanceOf(Date);
      expect(updateWhere).toHaveBeenCalledTimes(1);
    });

    it("reports failure when the source session no longer exists", async () => {
      const updateWhere = vi.fn().mockResolvedValue({ changes: 0 });
      const updateSet = vi.fn((_data: Record<string, unknown>) => ({ where: updateWhere }));
      const updateFn = vi.fn(() => ({ set: updateSet }));
      const module = makeModule({ update: updateFn });

      const res = await module.rotateToken(
        "missing-token" as never,
        "2026-01-01T00:00:00.000Z" as never,
      );

      expect(res.success).toBe(false);
    });
  });

  describe("updateSessionExpiry", () => {
    it("uses UPDATE … RETURNING when the driver supports it", async () => {
      const returning = vi.fn().mockResolvedValue([{ _id: "sess", expires: 123, updatedAt: 456 }]);
      const updateWhere = vi.fn(() => ({ returning }));
      const updateSet = vi.fn((_data: Record<string, unknown>) => ({ where: updateWhere }));
      const updateFn = vi.fn(() => ({ set: updateSet }));
      const module = makeModule({ update: updateFn }, { updateReturnsRows: true });

      const res = await module.updateSessionExpiry(
        "sess" as never,
        "2026-01-01T00:00:00.000Z" as never,
      );

      expect(res.success).toBe(true);
      expect(returning).toHaveBeenCalledTimes(1);
      const setArg = updateSet.mock.calls[0][0];
      expect(setArg.expires).toBeInstanceOf(Date);
      expect(setArg.updatedAt).toBeInstanceOf(Date);
    });

    it("falls back to UPDATE + re-read when RETURNING is unsupported", async () => {
      const selectLimit = vi.fn().mockResolvedValue([{ _id: "sess", expires: 123 }]);
      const selectWhere = vi.fn(() => ({ limit: selectLimit }));
      const selectFrom = vi.fn(() => ({ where: selectWhere }));
      const selectFn = vi.fn(() => ({ from: selectFrom }));
      const updateWhere = vi.fn().mockResolvedValue(undefined);
      const updateSet = vi.fn((_data: Record<string, unknown>) => ({ where: updateWhere }));
      const updateFn = vi.fn(() => ({ set: updateSet }));
      const module = makeModule({ update: updateFn, select: selectFn });

      const res = await module.updateSessionExpiry(
        "sess" as never,
        "2026-01-01T00:00:00.000Z" as never,
      );

      expect(res.success).toBe(true);
      expect(updateFn).toHaveBeenCalledTimes(1);
      expect(selectFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("getSessionTokenData", () => {
    it("projects only expires and user_id", async () => {
      const selectLimit = vi.fn().mockResolvedValue([{ expires: 123, user_id: "u1" }]);
      const selectWhere = vi.fn(() => ({ limit: selectLimit }));
      const selectFrom = vi.fn(() => ({ where: selectWhere }));
      const selectFn = vi.fn((_selection: Record<string, unknown>) => ({ from: selectFrom }));
      const module = makeModule({ select: selectFn });

      const res = await module.getSessionTokenData("sess" as never);

      expect(res.success).toBe(true);
      if (!res.success) throw new Error("expected success");
      const selection = selectFn.mock.calls[0][0];
      expect(Object.keys(selection).sort()).toEqual(["expires", "user_id"]);
      expect(res.data?.user_id).toBe("u1");
    });

    it("returns null when no session matches", async () => {
      const selectLimit = vi.fn().mockResolvedValue([]);
      const selectWhere = vi.fn(() => ({ limit: selectLimit }));
      const selectFrom = vi.fn(() => ({ where: selectWhere }));
      const selectFn = vi.fn((_selection: Record<string, unknown>) => ({ from: selectFrom }));
      const module = makeModule({ select: selectFn });

      const res = await module.getSessionTokenData("missing" as never);

      expect(res.success).toBe(true);
      if (!res.success) throw new Error("expected success");
      expect(res.data).toBeNull();
    });
  });

  describe("deleteExpiredSessions", () => {
    it("returns the real affected-row count", async () => {
      const deleteWhere = vi.fn().mockResolvedValue({ changes: 5 });
      const deleteFn = vi.fn(() => ({ where: deleteWhere }));
      const module = makeModule({ delete: deleteFn });

      const res = await module.deleteExpiredSessions();

      expect(res.success).toBe(true);
      if (!res.success) throw new Error("expected success");
      expect(res.data).toBe(5);
      expect(deleteWhere).toHaveBeenCalledTimes(1);
    });
  });
});
