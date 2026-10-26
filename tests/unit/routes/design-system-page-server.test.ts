/**
 * @file tests/unit/routes/design-system-page-server.test.ts
 * @description Loader contract for `/config/design-system` (Appearance workspace).
 *
 * Boundaries mocked: admin-theme service, auth guard and the layout user cache.
 * The loader's graceful theme fallback and error classification run for real.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { redirect } from "@sveltejs/kit";

vi.mock("@src/services/core/admin-theme-service", () => ({
  adminThemeService: {
    getAdminTheme: vi.fn(),
    listThemes: vi.fn(),
  },
}));

vi.mock("@utils/page-guards.server", () => ({
  getAuthenticatedUser: vi.fn(),
}));

vi.mock("@utils/server/layout-caches.server", () => ({
  getFreshLayoutUser: vi.fn(),
}));

import { load } from "../../../src/routes/(app)/config/design-system/+page.server";
import { adminThemeService } from "@src/services/core/admin-theme-service";
import { getAuthenticatedUser } from "@utils/page-guards.server";
import { getFreshLayoutUser } from "@utils/server/layout-caches.server";

type DesignSystemData = {
  user: { _id?: string };
  isAdmin: boolean;
  adminTheme: Record<string, unknown> | null;
  themes: unknown[];
};

const sessionUser = {
  _id: 42,
  email: "admin@example.com",
  role: "admin",
};

function makeEvent(): Parameters<typeof load>[0] {
  return {
    locals: { user: sessionUser, isAdmin: true, tenantId: "t1", roles: [] },
  } as unknown as Parameters<typeof load>[0];
}

describe("config/design-system +page.server", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(getAuthenticatedUser).mockReturnValue(
      sessionUser as unknown as ReturnType<typeof getAuthenticatedUser>,
    );
    vi.mocked(getFreshLayoutUser).mockResolvedValue(
      null as unknown as Awaited<ReturnType<typeof getFreshLayoutUser>>,
    );
    vi.mocked(adminThemeService.getAdminTheme).mockResolvedValue({
      density: "compact",
      variant: "flat",
    } as unknown as Awaited<ReturnType<typeof adminThemeService.getAdminTheme>>);
    vi.mocked(adminThemeService.listThemes).mockResolvedValue([
      { id: "default", name: "Default", isActive: true, isDefault: true },
    ] as unknown as Awaited<ReturnType<typeof adminThemeService.listThemes>>);
  });

  it("returns a serialisable user, the active theme and the theme list (load-contract)", async () => {
    const data = (await load(makeEvent())) as unknown as DesignSystemData;

    expect(data.user._id).toBe("42");
    expect(data.isAdmin).toBe(true);
    expect(data.adminTheme).toMatchObject({ density: "compact", variant: "flat" });
    expect(data.themes).toHaveLength(1);
    expect(vi.mocked(adminThemeService.getAdminTheme)).toHaveBeenCalledWith("t1");
    expect(vi.mocked(getFreshLayoutUser)).toHaveBeenCalledWith(sessionUser, "t1");
  });

  it("falls back to a null admin theme when the theme service rejects (failure-path)", async () => {
    vi.mocked(adminThemeService.getAdminTheme).mockRejectedValue(
      new Error("theme store unavailable"),
    );

    const data = (await load(makeEvent())) as unknown as DesignSystemData;

    expect(data.adminTheme).toBeNull();
    expect(data.themes).toHaveLength(1);
    expect(data.user._id).toBe("42");
  });

  it("propagates a redirect thrown by the auth guard (failure-path)", async () => {
    vi.mocked(getAuthenticatedUser).mockImplementation(() => {
      throw redirect(302, "/login");
    });

    await expect(load(makeEvent())).rejects.toMatchObject({
      status: 302,
      location: "/login",
    });
  });

  it("turns an unexpected non-HTTP error into a 500 (failure-path)", async () => {
    vi.mocked(getFreshLayoutUser).mockRejectedValue(new Error("layout cache unavailable"));

    await expect(load(makeEvent())).rejects.toMatchObject({
      status: 500,
      body: { message: "Failed to load design system settings" },
    });
  });
});
