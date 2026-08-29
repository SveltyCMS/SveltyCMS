/**
 * @file tests/unit/utils/user-attribute-update.test.ts
 * @description Privilege gate for in-process profile updates (no HTTP hop).
 */

import { describe, expect, it, vi } from "vitest";
import { applyUserAttributeUpdate } from "@utils/server/user-attribute-update.server";

vi.mock("@src/hooks/handle-authentication", () => ({
  invalidateSessionCache: vi.fn(),
  primeSessionMemoryCache: vi.fn(),
}));

describe("applyUserAttributeUpdate", () => {
  it("forbids non-admin updates of another user", async () => {
    const cms = { auth: { updateUserAttributes: vi.fn() } };
    const event = {
      locals: { user: { _id: "self", role: "editor" }, roles: [] },
      cookies: { get: () => null },
      url: { protocol: "http:" },
    };
    await expect(
      applyUserAttributeUpdate(event as never, cms as never, "t1" as never, {
        user_id: "other",
        newUserData: { username: "x" },
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(cms.auth.updateUserAttributes).not.toHaveBeenCalled();
  });

  it("strips privileged fields for non-admin self updates", async () => {
    const cms = {
      auth: {
        updateUserAttributes: vi.fn().mockResolvedValue({
          success: true,
          data: { _id: "self", username: "ada" },
        }),
      },
    };
    const event = {
      locals: { user: { _id: "self", role: "editor" }, roles: [], session_id: "s1" },
      cookies: { get: () => null },
      url: { protocol: "http:" },
    };
    await applyUserAttributeUpdate(event as never, cms as never, "t1" as never, {
      user_id: "self",
      newUserData: { username: "ada", isAdmin: true, role: "admin" },
    });
    const patch = cms.auth.updateUserAttributes.mock.calls[0][1] as Record<string, unknown>;
    expect(patch.username).toBe("ada");
    expect(patch.isAdmin).toBeUndefined();
    expect(patch.role).toBeUndefined();
  });
});
