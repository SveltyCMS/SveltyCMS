/**
 * @file tests/unit/plugins/registry-auth-hooks.test.ts
 * @description Unit tests for PluginRegistry.runAuthHooks — the afterAuthenticate
 *              hook dispatch system used for auth policy enforcement.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@utils/logger", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  },
}));

// Import the real registry class but we'll test via a clean instance
import { PluginRegistry } from "@src/plugins/registry";

describe("PluginRegistry.runAuthHooks", () => {
  let registry: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a fresh registry instance with empty plugins map
    registry = new (PluginRegistry as any)();
    registry.plugins = new Map();
  });

  const makeAuthEvent = (overrides: Record<string, unknown> = {}) => ({
    user: {
      _id: "u1",
      email: "test@example.com",
      role: "admin",
      is2FAEnabled: false,
      ...(overrides.user as Record<string, unknown>),
    },
    method: (overrides.method as string) || "password",
    ip: (overrides.ip as string) || "127.0.0.1",
    userAgent: (overrides.userAgent as string) || "TestAgent/1.0",
    userHas2FA: (overrides.userHas2FA as boolean) ?? false,
    tenantId: (overrides.tenantId as string) || null,
  });

  const registerPlugin = (hooks: Record<string, Function>) => {
    registry.plugins.set("test-plugin", {
      plugin: {
        metadata: {
          id: "test-plugin",
          enabled: true,
          name: "Test",
          version: "1.0.0",
          description: "Test plugin",
        },
        hooks,
      },
    });
  };

  it("should return null when no plugins are registered", async () => {
    const result = await registry.runAuthHooks(makeAuthEvent());
    expect(result).toBeNull();
  });

  it("should return null when no plugins have afterAuthenticate hooks", async () => {
    registerPlugin({ beforeSave: vi.fn(), afterSave: vi.fn() });
    const result = await registry.runAuthHooks(makeAuthEvent());
    expect(result).toBeNull();
  });

  it("should return null when afterAuthenticate returns void", async () => {
    registerPlugin({ afterAuthenticate: vi.fn().mockResolvedValue(undefined) });
    const result = await registry.runAuthHooks(makeAuthEvent());
    expect(result).toBeNull();
  });

  it("should return null when afterAuthenticate returns null", async () => {
    registerPlugin({ afterAuthenticate: vi.fn().mockResolvedValue(null) });
    const result = await registry.runAuthHooks(makeAuthEvent());
    expect(result).toBeNull();
  });

  it("should return deny when a plugin denies the login", async () => {
    registerPlugin({
      afterAuthenticate: vi.fn().mockResolvedValue({
        deny: true,
        message: "Access denied by security policy.",
      }),
    });
    const result = await registry.runAuthHooks(makeAuthEvent());
    expect(result).toEqual({ deny: true, message: "Access denied by security policy." });
  });

  it("should return default deny message if no message provided", async () => {
    registerPlugin({
      afterAuthenticate: vi.fn().mockResolvedValue({ deny: true }),
    });
    const result = await registry.runAuthHooks(makeAuthEvent());
    expect(result?.deny).toBe(true);
    expect(result?.message).toBe("Access denied by security policy.");
  });

  it("should return requires2FA when a plugin forces it", async () => {
    registerPlugin({
      afterAuthenticate: vi.fn().mockResolvedValue({ requires2FA: true }),
    });
    const result = await registry.runAuthHooks(makeAuthEvent());
    expect(result).toEqual({ requires2FA: true });
  });

  it("should prioritize deny over requires2FA from the same plugin", async () => {
    registerPlugin({
      afterAuthenticate: vi.fn().mockResolvedValue({
        deny: true,
        requires2FA: true,
        message: "Blocked",
      }),
    });
    const result = await registry.runAuthHooks(makeAuthEvent());
    expect(result?.deny).toBe(true);
  });

  it("should prioritize deny from first plugin over requires2FA from later plugins", async () => {
    registry.plugins.set("plugin-a", {
      plugin: {
        metadata: {
          id: "plugin-a",
          enabled: true,
          name: "A",
          version: "1.0.0",
          description: "Plugin A",
        },
        hooks: {
          afterAuthenticate: vi.fn().mockResolvedValue({ deny: true, message: "Blocked by A" }),
        },
      },
    });
    registry.plugins.set("plugin-b", {
      plugin: {
        metadata: {
          id: "plugin-b",
          enabled: true,
          name: "B",
          version: "1.0.0",
          description: "Plugin B",
        },
        hooks: {
          afterAuthenticate: vi.fn().mockResolvedValue({ requires2FA: true }),
        },
      },
    });

    const result = await registry.runAuthHooks(makeAuthEvent());
    expect(result?.deny).toBe(true);
    expect(result?.message).toBe("Blocked by A");
  });

  it("should aggregate requires2FA from multiple plugins", async () => {
    registry.plugins.set("plugin-a", {
      plugin: {
        metadata: {
          id: "plugin-a",
          enabled: true,
          name: "A",
          version: "1.0.0",
          description: "Plugin A",
        },
        hooks: {
          afterAuthenticate: vi.fn().mockResolvedValue({ requires2FA: true }),
        },
      },
    });
    registry.plugins.set("plugin-b", {
      plugin: {
        metadata: {
          id: "plugin-b",
          enabled: true,
          name: "B",
          version: "1.0.0",
          description: "Plugin B",
        },
        hooks: {
          afterAuthenticate: vi.fn().mockResolvedValue(null),
        },
      },
    });

    const result = await registry.runAuthHooks(makeAuthEvent());
    expect(result).toEqual({ requires2FA: true });
  });

  it("should skip disabled plugins", async () => {
    registry.plugins.set("enabled-plugin", {
      plugin: {
        metadata: {
          id: "enabled-plugin",
          enabled: true,
          name: "EP",
          version: "1.0.0",
          description: "Enabled",
        },
        hooks: {
          afterAuthenticate: vi.fn().mockResolvedValue({ requires2FA: true }),
        },
      },
    });
    registry.plugins.set("disabled-plugin", {
      plugin: {
        metadata: {
          id: "disabled-plugin",
          enabled: false,
          name: "DP",
          version: "1.0.0",
          description: "Disabled",
        },
        hooks: {
          afterAuthenticate: vi.fn().mockResolvedValue({ deny: true, message: "Should not fire" }),
        },
      },
    });

    const result = await registry.runAuthHooks(makeAuthEvent());
    expect(result).toEqual({ requires2FA: true });
  });

  it("should pass the full auth event to the hook", async () => {
    const hookFn = vi.fn().mockResolvedValue(null);
    registerPlugin({ afterAuthenticate: hookFn });

    await registry.runAuthHooks(makeAuthEvent({ user: { _id: "u42", email: "u@test.com" } }));

    expect(hookFn).toHaveBeenCalledTimes(1);
    const received = hookFn.mock.calls[0][0];
    expect(received.user._id).toBe("u42");
    expect(received.user.email).toBe("u@test.com");
    expect(received.method).toBe("password");
    expect(received.ip).toBe("127.0.0.1");
    expect(received.userAgent).toBe("TestAgent/1.0");
  });

  it("should fail-open when a hook throws (not block login)", async () => {
    registerPlugin({
      afterAuthenticate: vi.fn().mockRejectedValue(new Error("Plugin crash!")),
    });

    const result = await registry.runAuthHooks(makeAuthEvent());
    expect(result).toBeNull();
  });

  it("should fail-open and still process other plugins if one throws", async () => {
    registry.plugins.set("crashy-plugin", {
      plugin: {
        metadata: {
          id: "crashy-plugin",
          enabled: true,
          name: "C",
          version: "1.0.0",
          description: "Crashes",
        },
        hooks: {
          afterAuthenticate: vi.fn().mockRejectedValue(new Error("Boom")),
        },
      },
    });
    registry.plugins.set("good-plugin", {
      plugin: {
        metadata: {
          id: "good-plugin",
          enabled: true,
          name: "G",
          version: "1.0.0",
          description: "Good",
        },
        hooks: {
          afterAuthenticate: vi.fn().mockResolvedValue({ requires2FA: true }),
        },
      },
    });

    const result = await registry.runAuthHooks(makeAuthEvent());
    expect(result).toEqual({ requires2FA: true });
  });

  it("should expose userHas2FA flag accurately", async () => {
    const hookFn = vi.fn().mockResolvedValue(null);
    registerPlugin({ afterAuthenticate: hookFn });

    await registry.runAuthHooks(
      makeAuthEvent({ userHas2FA: true, user: { _id: "u1", is2FAEnabled: true } }),
    );

    expect(hookFn.mock.calls[0][0].userHas2FA).toBe(true);
  });
});
