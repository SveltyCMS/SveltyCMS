/**
 * @file tests/unit/api/workflow-security.test.ts
 * @description Unit tests for Workflows API admin gate + namespace ownership.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { GET as dispatcherGET, POST as dispatcherPOST } from "@src/routes/api/[...path]/+server";
import { createMockUser } from "../utils/mock-factories";

vi.mock("@src/services/background/workflow-service", () => ({
  workflowService: {
    getWorkflowForCollection: vi.fn().mockResolvedValue({
      _id: "wf1",
      collectionId: "posts",
      states: [{ id: "draft", label: "Draft", color: "#000", isInitial: true }],
      transitions: [],
    }),
    getWorkflowInstance: vi.fn().mockResolvedValue(null),
    saveWorkflow: vi.fn().mockResolvedValue({
      _id: "wf1",
      collectionId: "posts",
      states: [],
      transitions: [],
    }),
    deleteWorkflow: vi.fn().mockResolvedValue(undefined),
    transition: vi.fn(),
  },
}));

vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: vi.fn().mockReturnValue(true),
  getPublicSettingSync: vi.fn().mockReturnValue("mediaFolder"),
  getUntypedSetting: vi.fn().mockResolvedValue(undefined),
}));

describe("Workflow API Security", () => {
  const admin = createMockUser({ _id: "admin1", role: "admin", isAdmin: true });
  const editor = createMockUser({ _id: "ed1", role: "editor", isAdmin: false });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /api/workflows?collectionId allows authenticated admin", async () => {
    const event = {
      locals: { user: admin, tenantId: "t1", __testBypass: true },
      params: { path: "workflows" },
      request: { method: "GET", headers: new Headers() },
      url: new URL("http://localhost/api/workflows?collectionId=posts"),
      cookies: { get: vi.fn() },
    } as any;

    const res = await dispatcherGET(event);
    expect(res.status).toBeLessThan(400);
  });

  it("POST /api/workflows rejects non-admin", async () => {
    const event = {
      locals: { user: editor, tenantId: "t1", __testBypass: true },
      params: { path: "workflows" },
      request: {
        method: "POST",
        headers: new Headers({ "Content-Type": "application/json" }),
        json: async () => ({
          collectionId: "posts",
          states: [
            { id: "draft", label: "Draft", color: "#000", isInitial: true },
            { id: "done", label: "Done", color: "#0f0", isFinal: true },
          ],
          transitions: [],
        }),
      },
      url: new URL("http://localhost/api/workflows"),
      cookies: { get: vi.fn() },
    } as any;

    const res = await dispatcherPOST(event);
    expect(res.status).toBe(403);
  });

  it("POST /api/workflows allows admin", async () => {
    const { workflowService } = await import("@src/services/background/workflow-service");
    const event = {
      locals: { user: admin, tenantId: "t1", __testBypass: true },
      params: { path: "workflows" },
      request: {
        method: "POST",
        headers: new Headers({ "Content-Type": "application/json" }),
        json: async () => ({
          collectionId: "posts",
          states: [
            { id: "draft", label: "Draft", color: "#000", isInitial: true },
            { id: "done", label: "Done", color: "#0f0", isFinal: true },
          ],
          transitions: [],
        }),
      },
      url: new URL("http://localhost/api/workflows"),
      cookies: { get: vi.fn() },
    } as any;

    const res = await dispatcherPOST(event);
    expect(res.status).toBeLessThan(400);
    expect(workflowService.saveWorkflow).toHaveBeenCalled();
  });
});
