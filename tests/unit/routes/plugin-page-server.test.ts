/**
 * @file tests/unit/routes/plugin-page-server.test.ts
 * @description Unit tests for the plugin page server load — resolution, RBAC gate, load hook.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@utils/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
  },
}));

vi.mock("@src/plugins/plugin-page-registry.svelte.ts", () => ({
  pluginPageRegistry: {
    getByPath: vi.fn(),
  },
}));

import { pluginPageRegistry } from "@src/plugins/plugin-page-registry.svelte.ts";
import { load } from "../../../src/routes/(app)/plugin/[...path]/+page.server";

const mockedGetByPath = vi.mocked(pluginPageRegistry.getByPath);

function makeLocals(overrides: Record<string, unknown> = {}) {
  return {
    user: { _id: "u1", email: "admin@test.com", role: "admin" },
    isAdmin: true,
    roles: [{ _id: "editor", permissions: ["manage:x"] }],
    tenantId: "t1",
    ...overrides,
  };
}

const pageDef = (caps: string[] = []) => ({
  id: "demo:console",
  path: "console",
  pluginId: "demo",
  title: "Demo Console",
  requiredCapabilities: caps,
  component: () => Promise.resolve({ default: {} }),
  load: vi.fn().mockResolvedValue({ greeting: "hi" }),
});

describe("plugin page server load", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves the page and returns its id/title/props", async () => {
    const def = pageDef();
    mockedGetByPath.mockReturnValue(def);
    const data: any = await load({
      locals: makeLocals(),
      params: { path: "console" },
      url: new URL("http://localhost/plugin/console"),
    } as any);
    expect(data.pageId).toBe("demo:console");
    expect(data.title).toBe("Demo Console");
    expect(def.load).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "t1", params: { path: "console" } }),
    );
  });

  it("throws 404 when no page is registered for the path", async () => {
    mockedGetByPath.mockReturnValue(undefined);
    await expect(
      load({
        locals: makeLocals(),
        params: { path: "nope" },
        url: new URL("http://localhost/plugin/nope"),
      } as any),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws 403 when required capabilities are missing", async () => {
    mockedGetByPath.mockReturnValue(pageDef(["manage:secret"]));
    await expect(
      load({
        locals: makeLocals({
          isAdmin: false,
          user: { _id: "u2", email: "editor@test.com", role: "editor" },
        }),
        params: { path: "console" },
        url: new URL("http://localhost/plugin/console"),
      } as any),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("allows a non-admin whose roles carry the required capability", async () => {
    mockedGetByPath.mockReturnValue(pageDef(["manage:x"]));
    const data: any = await load({
      locals: makeLocals({ isAdmin: false, user: { _id: "u2", email: "e@t.com", role: "editor" } }),
      params: { path: "console" },
      url: new URL("http://localhost/plugin/console"),
    } as any);
    expect(data.pageId).toBe("demo:console");
  });

  it("allows admins to bypass capability gates (fast-path)", async () => {
    mockedGetByPath.mockReturnValue(pageDef(["manage:secret"]));
    const data: any = await load({
      locals: makeLocals(),
      params: { path: "console" },
      url: new URL("http://localhost/plugin/console"),
    } as any);
    expect(data.pageId).toBe("demo:console");
  });

  it("runs no load hook when the page declares none", async () => {
    const def = { ...pageDef(), load: undefined };
    mockedGetByPath.mockReturnValue(def as any);
    const data: any = await load({
      locals: makeLocals(),
      params: { path: "console" },
      url: new URL("http://localhost/plugin/console"),
    } as any);
    expect(data.props).toEqual({});
  });
});
