/**
 * @file tests/unit/api/ai-builder.test.ts
 * @description Unit tests for the AI Builder API namespace (/api/ai-builder/*).
 *
 * The @src/services/ai-builder service layer is implemented in parallel and is
 * fully mocked here so the dispatcher/handler wiring is tested hermetically.
 *
 * ### Features:
 * - fail-closed dispatcher registration (ai-builder → system:settings)
 * - defense-in-depth admin gate (401 unauthenticated / 403 non-admin)
 * - input guards (prompt / previousProposal)
 * - quota enforcement via builderAiGateway.checkQuota (429)
 * - approve-collection Phase 1 stub (501 NOT_IMPLEMENTED)
 * - unknown action (404 NOT_FOUND)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { AppError } from "@utils/error-handling";
import { createMockUser } from "../utils/mock-factories";
import { invokeApi } from "../utils/mock-event";
import { _checkEndpointPermission } from "@src/routes/api/[...path]/+server";

const aiBuilder = vi.hoisted(() => ({
  designCollection: vi.fn(),
  refineCollection: vi.fn(),
  checkQuota: vi.fn(),
}));

// Hermetic mock of the parallel services module — mirrors the full export set.
vi.mock("@src/services/ai-builder", () => ({
  designCollection: aiBuilder.designCollection,
  refineCollection: aiBuilder.refineCollection,
  builderAiGateway: { checkQuota: aiBuilder.checkQuota },
  BuilderAiGateway: class BuilderAiGateway {
    static resetQuotasForTests(): void {}
  },
}));

vi.mock("@utils/tenant", () => ({
  isMultiTenantEnabled: vi.fn().mockReturnValue(true),
  getTenantIdFromHostname: vi.fn().mockReturnValue(null),
}));

const PROPOSAL = {
  proposal: {
    name: "blog",
    fields: [{ name: "title", widget: "Input", required: true, translated: false }],
  },
  diff: null,
  backend: "mock-ai",
};

const admin = createMockUser({ _id: "admin-1", role: "admin", isAdmin: true } as any);
const editor = createMockUser({ _id: "editor-1", role: "editor", isAdmin: false } as any);

describe("AI Builder API (POST /api/ai-builder)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    aiBuilder.designCollection.mockResolvedValue(PROPOSAL);
    aiBuilder.refineCollection.mockResolvedValue(PROPOSAL);
    aiBuilder.checkQuota.mockImplementation(() => {});
  });

  describe("Defense-in-depth gates", () => {
    it("rejects unauthenticated requests with 401 before touching the service", async () => {
      const response = await invokeApi("POST", {
        path: "ai-builder/design-collection",
        body: { prompt: "Design a blog collection" },
        user: null,
        tenantId: "t1",
      });
      expect(response.status).toBe(401);
      expect(aiBuilder.designCollection).not.toHaveBeenCalled();
    });

    it("rejects non-admin users with 403", async () => {
      const response = await invokeApi("POST", {
        path: "ai-builder/design-collection",
        body: { prompt: "Design a blog collection" },
        user: editor,
        tenantId: "t1",
      });
      expect(response.status).toBe(403);
      expect(aiBuilder.designCollection).not.toHaveBeenCalled();
    });

    it("rejects requests without a tenant when multi-tenancy is enabled", async () => {
      const response = await invokeApi("POST", {
        path: "ai-builder/design-collection",
        body: { prompt: "Design a blog collection" },
        user: admin,
        tenantId: null,
      });
      expect(response.status).toBe(400);
      expect(aiBuilder.designCollection).not.toHaveBeenCalled();
    });
  });

  describe("design-collection", () => {
    it("rejects a missing prompt with 400", async () => {
      const response = await invokeApi("POST", {
        path: "ai-builder/design-collection",
        body: {},
        user: admin,
        tenantId: "t1",
      });
      expect(response.status).toBe(400);
      expect(aiBuilder.designCollection).not.toHaveBeenCalled();
    });

    it("checks quota before designing and returns the proposal envelope", async () => {
      const response = await invokeApi("POST", {
        path: "ai-builder/design-collection",
        body: {
          prompt: "Design a blog collection",
          existingSchema: { name: "blog" },
          language: "en",
          availableWidgets: ["Input", "RichText"],
        },
        user: admin,
        tenantId: "t1",
      });
      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload).toMatchObject({ success: true });
      expect(payload.data).toMatchObject({ backend: "mock-ai", diff: null });
      expect(payload.data.proposal.name).toBe("blog");
      expect(aiBuilder.checkQuota).toHaveBeenCalledWith("admin-1");
      expect(aiBuilder.designCollection).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: "Design a blog collection",
          tenantId: "t1",
          existingSchema: { name: "blog" },
          language: "en",
          availableWidgets: ["Input", "RichText"],
        }),
        "admin-1",
      );
    });

    it("returns 429 when the builder quota is exceeded", async () => {
      aiBuilder.checkQuota.mockImplementation(() => {
        throw new AppError("AI builder quota exceeded", 429, "RATE_LIMITED");
      });
      const response = await invokeApi("POST", {
        path: "ai-builder/design-collection",
        body: { prompt: "Design a blog collection" },
        user: admin,
        tenantId: "t1",
      });
      expect(response.status).toBe(429);
      expect(aiBuilder.designCollection).not.toHaveBeenCalled();
    });
  });

  describe("refine-collection", () => {
    it("rejects a missing previousProposal with 400", async () => {
      const response = await invokeApi("POST", {
        path: "ai-builder/refine-collection",
        body: { prompt: "Add a publishedDate field" },
        user: admin,
        tenantId: "t1",
      });
      expect(response.status).toBe(400);
      expect(aiBuilder.refineCollection).not.toHaveBeenCalled();
    });

    it("returns the refined proposal envelope on success", async () => {
      const previousProposal = { name: "blog", fields: [{ name: "title", widget: "Input" }] };
      const response = await invokeApi("POST", {
        path: "ai-builder/refine-collection",
        body: {
          prompt: "Add a publishedDate field",
          previousProposal,
          existingSchema: { name: "blog" },
          language: "en",
        },
        user: admin,
        tenantId: "t1",
      });
      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload.success).toBe(true);
      expect(payload.data.proposal.name).toBe("blog");
      expect(aiBuilder.checkQuota).toHaveBeenCalledWith("admin-1");
      expect(aiBuilder.refineCollection).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: "Add a publishedDate field",
          tenantId: "t1",
          previousProposal,
        }),
        "admin-1",
      );
    });
  });

  describe("approve-collection (Phase 1 reserved)", () => {
    it("returns 501 NOT_IMPLEMENTED", async () => {
      const response = await invokeApi("POST", {
        path: "ai-builder/approve-collection",
        body: { prompt: "Approve" },
        user: admin,
        tenantId: "t1",
      });
      expect(response.status).toBe(501);
    });
  });

  describe("Unknown actions", () => {
    it("returns 404 for unknown ai-builder actions", async () => {
      const response = await invokeApi("POST", {
        path: "ai-builder/not-a-real-action",
        body: { prompt: "x" },
        user: admin,
        tenantId: "t1",
      });
      expect(response.status).toBe(404);
    });
  });
});

describe("AI Builder fail-closed dispatcher registration (ENDPOINT_PERMISSIONS)", () => {
  it("maps ai-builder to system:settings through the real permission gate", () => {
    const editorNoPerms = createMockUser({
      _id: "np-user",
      role: "editor-np",
      isAdmin: false,
    } as any);
    const editorWithPerms = createMockUser({
      _id: "wp-user",
      role: "editor-wp",
      isAdmin: false,
    } as any);
    const noPermsRoles: any[] = [
      { _id: "editor-np", name: "Editor", isAdmin: false, permissions: [] },
    ];
    const withPermsRoles: any[] = [
      { _id: "editor-wp", name: "Editor", isAdmin: false, permissions: ["system:settings"] },
    ];

    expect(
      _checkEndpointPermission(editorNoPerms, noPermsRoles, "POST", "ai-builder", [
        "ai-builder",
        "design-collection",
      ]),
    ).toBe(false);

    expect(
      _checkEndpointPermission(editorWithPerms, withPermsRoles, "POST", "ai-builder", [
        "ai-builder",
        "design-collection",
      ]),
    ).toBe(true);

    // Admin fast-path bypasses the mapping.
    expect(
      _checkEndpointPermission(admin, [], "POST", "ai-builder", [
        "ai-builder",
        "design-collection",
      ]),
    ).toBe(true);
  });

  it("keeps unmapped namespaces fail-closed", () => {
    const stranger = createMockUser({
      _id: "stranger",
      role: "stranger",
      isAdmin: false,
    } as any);
    expect(
      _checkEndpointPermission(stranger, [], "POST", "not-a-namespace", ["not-a-namespace"]),
    ).toBe(false);
  });
});
