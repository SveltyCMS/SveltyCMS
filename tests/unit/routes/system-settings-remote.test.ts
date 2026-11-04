/**
 * @file tests/unit/routes/system-settings-remote.test.ts
 * @description Unit tests for system settings remote functions (saveSettingsGroup & loadSettingsGroup).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const mockPreferencesSetMany = vi.fn();
const mockPreferencesGetMany = vi.fn();
const mockPreferencesGet = vi.fn();
const mockInvalidateCache = vi.fn();
const mockSettingsSet = vi.fn();
const mockSettingsGet = vi.fn();

let mockUser: any = { _id: "admin-1", role: "admin", isAdmin: true };
let mockIsAdmin = true;

vi.mock("$app/server", () => ({
  query: (_mode: string, fn: any) => fn,
  command: (_mode: string, fn: any) => fn,
  getRequestEvent: () => ({
    locals: {
      user: mockUser,
      isAdmin: mockIsAdmin,
      tenantId: "test-tenant",
    },
  }),
}));

vi.mock("@utils/server/request-cms.server", () => ({
  getRequestLocalCMS: async () => ({
    cms: {
      db: {
        system: {
          preferences: {
            setMany: mockPreferencesSetMany,
            getMany: mockPreferencesGetMany,
            get: mockPreferencesGet,
          },
        },
      },
      system: {
        settings: {
          set: mockSettingsSet,
          get: mockSettingsGet,
          invalidateCache: mockInvalidateCache,
        },
      },
    },
    tenantId: "test-tenant",
  }),
  remoteErrorMessage: (err: any, fallback: string) =>
    err instanceof Error ? err.message : fallback,
}));

vi.mock("@src/services/security/field-permission-service", () => ({
  invalidateFieldPermissionCache: vi.fn(),
}));

import {
  loadSettingsGroup,
  saveSettingsGroup,
} from "@src/routes/(app)/config/system-settings/settings.remote";

describe("system settings remote functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = { _id: "admin-1", role: "admin", isAdmin: true };
    mockIsAdmin = true;
    mockPreferencesSetMany.mockResolvedValue({ success: true });
    mockPreferencesGetMany.mockResolvedValue({ success: true, data: {} });
    mockPreferencesGet.mockResolvedValue({ success: true, data: null });
    mockInvalidateCache.mockResolvedValue(undefined);
  });

  describe("saveSettingsGroup", () => {
    it("persists individual setting fields with correct categories and scope", async () => {
      const result = await saveSettingsGroup({
        groupId: "appearance",
        values: {
          SEASONS: true,
          SEASON_REGION: "Western_Europe",
        },
      });

      expect(result.success).toBe(true);
      expect(mockPreferencesSetMany).toHaveBeenCalledTimes(1);

      const [ops, options] = mockPreferencesSetMany.mock.calls[0];
      expect(options.tenantId).toBe("test-tenant");

      expect(ops).toEqual([
        {
          key: "SEASONS",
          value: true,
          category: "public",
          scope: "system",
        },
        {
          key: "SEASON_REGION",
          value: "Western_Europe",
          category: "public",
          scope: "system",
        },
      ]);
      expect(mockInvalidateCache).toHaveBeenCalled();
    });

    it("rejects invalid keys not belonging to the group", async () => {
      const result = await saveSettingsGroup({
        groupId: "appearance",
        values: {
          INVALID_KEY_ATTEMPT: "bad",
        },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Invalid setting key INVALID_KEY_ATTEMPT");
      expect(mockPreferencesSetMany).not.toHaveBeenCalled();
    });

    it("rejects unauthorized non-admin users", async () => {
      mockUser = { _id: "user-2", role: "editor", isAdmin: false };
      mockIsAdmin = false;

      const result = await saveSettingsGroup({
        groupId: "appearance",
        values: { SEASONS: true },
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Admin access required");
      expect(mockPreferencesSetMany).not.toHaveBeenCalled();
    });
  });

  describe("loadSettingsGroup", () => {
    it("loads fields by keys without throwing on undefined or null preferences", async () => {
      mockPreferencesGetMany.mockResolvedValue({
        success: true,
        data: {
          SEASONS: true,
          SEASON_REGION: "Western_Europe",
        },
      });

      const result = await loadSettingsGroup({
        groupId: "appearance",
        bypassCache: true,
      });

      expect(result.success).toBe(true);
      expect(result.values).toEqual({
        SEASONS: true,
        SEASON_REGION: "Western_Europe",
      });
      expect(mockPreferencesGetMany).toHaveBeenCalledWith(
        ["SEASONS", "SEASON_REGION"],
        expect.objectContaining({ scope: "system", tenantId: "test-tenant" }),
      );
      expect(mockInvalidateCache).toHaveBeenCalled();
    });

    it("handles database returning undefined/null gracefully without throwing 'Cannot read properties of undefined'", async () => {
      mockPreferencesGetMany.mockResolvedValue(undefined as any);
      mockPreferencesGet.mockResolvedValue(undefined as any);

      const result = await loadSettingsGroup({
        groupId: "appearance",
      });

      expect(result.success).toBe(true);
      expect(result.values).toEqual({});
    });
  });
});
