/**
 * @file tests/unit/routes/automations-page-server.test.ts
 * @description Admin gates + flow resolution for the automations list and editor pages.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const getFlow = vi.fn();

vi.mock("@src/services/background/automation/automation-service", () => ({
  automationService: {
    getFlows: vi.fn(() => Promise.resolve([])),
    getFlow: (...args: unknown[]) => getFlow(...args),
  },
}));

import { load } from "../../../src/routes/(app)/config/automations/+page.server";
import { load as loadEditor } from "../../../src/routes/(app)/config/automations/[id]/+page.server";

describe("automations +page.server load", () => {
  beforeEach(() => vi.clearAllMocks());

  it("allows admin", async () => {
    const data: any = await load({
      locals: { user: { _id: "u1" }, isAdmin: true },
    } as any);
    expect(data.isAdmin).toBe(true);
  });

  it("throws 403 for non-admin", async () => {
    await expect(
      load({ locals: { user: { _id: "u2" }, isAdmin: false } } as any),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("automations/[id] +page.server load", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders a blank editor for the `new` param without reading the DB", async () => {
    const data: any = await loadEditor({
      locals: { user: { _id: "u1" }, isAdmin: true },
      params: { id: "new" },
    } as any);

    expect(data).toEqual({ isNew: true, flow: null });
    expect(getFlow).not.toHaveBeenCalled();
  });

  it("loads a tenant-scoped flow", async () => {
    const flow = { _id: "f1", name: "Nightly sync" };
    getFlow.mockResolvedValueOnce(flow);

    const data: any = await loadEditor({
      locals: { user: { _id: "u1" }, isAdmin: true, tenantId: "t1" },
      params: { id: "f1" },
    } as any);

    expect(getFlow).toHaveBeenCalledWith("f1", "t1");
    expect(data).toEqual({ isNew: false, flow });
  });

  it("404s for an unknown flow", async () => {
    getFlow.mockResolvedValueOnce(null);

    await expect(
      loadEditor({
        locals: { user: { _id: "u1" }, isAdmin: true },
        params: { id: "missing" },
      } as any),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("throws 403 for non-admin", async () => {
    await expect(
      loadEditor({
        locals: { user: { _id: "u2" }, isAdmin: false },
        params: { id: "f1" },
      } as any),
    ).rejects.toMatchObject({ status: 403 });
  });
});
