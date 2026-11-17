/**
 * @file tests/unit/routes/queue-page-server.test.ts
 * @description Admin gate + jobs load for queue observability dashboard.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const listMock = vi.fn();
const countMock = vi.fn();

vi.mock("@src/databases/db", () => ({
  getDb: () => ({
    system: {
      jobs: {
        list: listMock,
        count: countMock,
      },
    },
  }),
}));

import { load } from "../../../src/routes/(app)/config/queue/+page.server";

describe("queue +page.server load", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listMock.mockResolvedValue({ success: true, data: [{ _id: "j1", status: "pending" }] });
    countMock.mockResolvedValue({ success: true, data: 1 });
  });

  it("returns jobs and stats for admin", async () => {
    const data: any = await load({
      url: new URL("http://localhost/config/queue"),
      locals: {
        user: { _id: "u1", role: "admin" },
        isAdmin: true,
      },
    } as any);

    expect(data.jobs).toHaveLength(1);
    expect(data.stats.total).toBe(1);
    expect(data.pagination.limit).toBe(25);
    expect(listMock).toHaveBeenCalledWith(expect.objectContaining({ tenantId: null }));
    expect(countMock).toHaveBeenCalledWith(expect.objectContaining({ tenantId: null }));
  });

  it("forwards explicit tenantId scope when locals.tenantId is set", async () => {
    await load({
      url: new URL("https://demo.sveltycms.com/config/queue"),
      locals: {
        user: { _id: "u1", role: "admin" },
        isAdmin: true,
        tenantId: "demo",
      },
    } as any);

    expect(listMock).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "demo" }));
    expect(countMock).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "demo" }));
  });

  it("throws 403 for non-admin", async () => {
    await expect(
      load({
        url: new URL("http://localhost/config/queue"),
        locals: {
          user: { _id: "u2", role: "editor" },
          isAdmin: false,
        },
      } as any),
    ).rejects.toMatchObject({ status: 403 });
  });
});
