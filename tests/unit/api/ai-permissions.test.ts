/**
 * @file tests/unit/api/ai-permissions.test.ts
 * @description Regression tests for AI endpoint authorization.
 *
 * Before this change `/api/ai/*` and `/api/chat` were mapped to `system:settings`,
 * so the built-in editor role received 403 on every AI button (translation,
 * enrichment, scoring). The AI surface now uses the dedicated `ai:use`
 * capability; the AI builder stays admin-gated.
 *
 * ### Features:
 * - `/api/ai` and `/api/chat` map to `ai:use`
 * - built-in editor and developer roles carry `ai:use`
 * - a role without `ai:use` is still denied (fail-closed)
 * - `ai-builder` remains `system:settings` (admin/dev only)
 */

import { describe, it, expect } from "vitest";
import { _checkEndpointPermission } from "@src/routes/api/[...path]/+server";
import { defaultRoles } from "@src/databases/auth/default-roles";
import { createMockUser } from "../utils/mock-factories";

const editor = createMockUser({ _id: "editor-1", role: "editor", isAdmin: false } as never);
const customUser = createMockUser({ _id: "custom-1", role: "custom", isAdmin: false } as never);
const admin = createMockUser({ _id: "admin-1", role: "admin", isAdmin: true } as never);

const editorRole = defaultRoles.find((role) => String(role._id) === "editor")!;
const customRole = {
  _id: "custom",
  name: "Custom",
  isAdmin: false,
  permissions: [] as string[],
};

describe("AI endpoint authorization", () => {
  it.each(["ai", "chat"])("maps /api/%s to ai:use", (namespace) => {
    expect(
      _checkEndpointPermission(editor, [editorRole], "POST", namespace, [namespace, "enrich"]),
    ).toBe(true);
    expect(
      _checkEndpointPermission(customUser, [customRole], "POST", namespace, [namespace, "enrich"]),
    ).toBe(false);
  });

  it("ships ai:use on the built-in editor and developer roles", () => {
    for (const id of ["editor", "developer"]) {
      const role = defaultRoles.find((candidate) => String(candidate._id) === id);
      expect(role?.permissions, `${id} must be able to use AI features`).toContain("ai:use");
    }
  });

  it("keeps the AI builder admin/dev gated", () => {
    expect(
      _checkEndpointPermission(editor, [editorRole], "POST", "ai-builder", [
        "ai-builder",
        "design-collection",
      ]),
    ).toBe(false);
    expect(
      _checkEndpointPermission(admin, [], "POST", "ai-builder", [
        "ai-builder",
        "design-collection",
      ]),
    ).toBe(true);
  });
});
