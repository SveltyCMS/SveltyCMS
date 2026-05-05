import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadSettingsCache, invalidateSettingsCache } from "@src/services/core/settings-service";

describe("SettingsService - Dynamic Scaling Infrastructure", () => {
  let mockAdapter: any;

  beforeEach(() => {
    vi.clearAllMocks();
    invalidateSettingsCache();

    mockAdapter = {
      system: {
        preferences: {
          // Use a robust mock that doesn't care about call order
          getMany: vi.fn(async (keys) => {
            if (keys.includes("JWT_SECRET_KEY")) {
              return { success: true, data: {} }; // We provide this via DI instead
            }
            return { success: true, data: {} };
          }),
        },
      },
      configureReplicas: vi.fn(),
      isConnected: vi.fn(() => true),
    };
  });

  it("should hot-load read-replicas via explicit Dependency Injection", async () => {
    const replicaUrls = ["https://read-1.mysql.com", "https://read-2.mysql.com"];
    const getPrivateEnv = vi.fn(() => ({})) as any;

    // Setup mock to return replicas when private keys are requested
    mockAdapter.system.preferences.getMany.mockImplementation(async (keys: string[]) => {
      // Check if this is the private keys call (it won't have public only keys)
      if (keys.includes("DB_REPLICA_URLS") || keys.length > 20) {
        return { success: true, data: { DB_REPLICA_URLS: replicaUrls } };
      }
      return { success: true, data: {} };
    });

    // 🔥 USE DEPENDENCY INJECTION on GLOBAL_TENANT to prove core merge
    await loadSettingsCache("global", { dbAdapter: mockAdapter, getPrivateEnv });

    // Verify configuration was triggered
    expect(mockAdapter.configureReplicas).toHaveBeenCalledWith(replicaUrls);
  });

  it("should merge private config with dynamic database settings via DI", async () => {
    const getPrivateEnv = vi.fn(() => ({ JWT_SECRET_KEY: "static-secret" })) as any;

    mockAdapter.system.preferences.getMany.mockImplementation(async (keys: string[]) => {
      if (keys.includes("LICENSE_KEY") || keys.length > 20) {
        return { success: true, data: { LICENSE_KEY: "dynamic-license" } };
      }
      return { success: true, data: {} };
    });

    const cache = await loadSettingsCache("global", { dbAdapter: mockAdapter, getPrivateEnv });

    expect(cache.private.JWT_SECRET_KEY).toBe("static-secret");
    expect((cache.private as any).LICENSE_KEY).toBe("dynamic-license");
  });
});
