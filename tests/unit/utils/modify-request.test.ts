/**
 * @file tests/unit/utils/modify-request.test.ts
 * @description Widget pipeline: field-cached active widgets + reused accessor.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const getWidgetSync = vi.fn();

vi.mock("@src/services/core/widget-registry-service", () => ({
  widgetRegistryService: { getWidgetSync },
}));

vi.mock("@utils/security/input-sanitizer", () => ({
  sanitizeObject: (value: unknown) => value,
}));

const { modifyRequest } = await import("@src/utils/modify-request");

function makeWidget(name: string, modifyRequestFn: (args: any) => Promise<unknown>) {
  const widget = { Name: name, modifyRequest: modifyRequestFn };
  return widget;
}

describe("modifyRequest", () => {
  beforeEach(() => {
    getWidgetSync.mockReset();
  });

  it("caches active widgets on the fields array after the first call", async () => {
    const widget = makeWidget("DateTime", async ({ data }) => {
      data.update("normalized");
    });
    getWidgetSync.mockReturnValue(widget);

    const fields: any[] = [{ widget: { Name: "DateTime" }, db_fieldName: "publishedAt" }];
    const data = [{ publishedAt: "raw" }];

    await modifyRequest({
      collection: {} as any,
      data,
      fields,
      type: "GET",
      user: { _id: "u1" } as any,
    });

    expect(data[0].publishedAt).toBe("normalized");
    expect((fields as any)._activeWidgets).toHaveLength(1);
    expect(getWidgetSync).toHaveBeenCalledTimes(1);

    data[0].publishedAt = "raw-2";
    await modifyRequest({
      collection: {} as any,
      data,
      fields,
      type: "GET",
      user: { _id: "u1" } as any,
    });

    expect(data[0].publishedAt).toBe("normalized");
    expect(getWidgetSync).toHaveBeenCalledTimes(1);
  });

  it("skips widgets whose field is absent on the entry", async () => {
    const modify = vi.fn();
    getWidgetSync.mockReturnValue(makeWidget("DateTime", modify));

    await modifyRequest({
      collection: {} as any,
      data: [{ title: "no date" }],
      fields: [{ widget: { Name: "DateTime" }, db_fieldName: "publishedAt" }] as any,
      type: "GET",
      user: { _id: "u1" } as any,
    });

    expect(modify).not.toHaveBeenCalled();
  });

  it("does not let one widget failure abort later fields", async () => {
    const boom = makeWidget("Boom", async () => {
      throw new Error("widget crashed");
    });
    const ok = makeWidget("Ok", async ({ data }) => {
      data.update("ok");
    });
    getWidgetSync.mockImplementation((name: string) => (name === "Boom" ? boom : ok));

    const data = [{ a: 1, b: 2 }];
    await modifyRequest({
      collection: {} as any,
      data,
      fields: [
        { widget: { Name: "Boom" }, db_fieldName: "a" },
        { widget: { Name: "Ok" }, db_fieldName: "b" },
      ] as any,
      type: "GET",
      user: { _id: "u1" } as any,
    });

    expect(data[0].b).toBe("ok");
  });
});
