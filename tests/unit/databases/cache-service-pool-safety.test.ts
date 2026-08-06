import { describe, it, expect, vi } from "vitest";

vi.mock("@src/services/core/settings-service", () => ({
  getPrivateSettingSync: vi.fn((key: string) => {
    if (key === "MULTI_TENANT") return false;
    if (key.startsWith("CACHE_TTL_")) return 300;
    if (key === "USE_REDIS") return false;
    return null;
  }),
  getPublicSettingSync: vi.fn((key: string) =>
    key === "SITE_NAME" ? "SveltyCMS Test" : undefined,
  ),
  getPrivateSetting: vi.fn(async () => null),
  getPublicSetting: vi.fn(async () => null),
}));

import { CollectionsNamespace } from "@src/services/sdk/namespaces/collections-namespace";
import { BaseAdapter } from "@src/databases/core/base-adapter";
import type { IBatchAdapter, ICrudAdapter } from "@src/databases/db-interface";

class DummyAdapter extends BaseAdapter {
  type = "sqlite" as any;
  constructor() {
    super();
    this.connected = true;
  }
  async connect() {
    return { success: true, data: undefined };
  }
  async disconnect() {
    return { success: true, data: undefined };
  }
  get batch(): IBatchAdapter {
    return {} as IBatchAdapter;
  }
  crud: ICrudAdapter = {
    findMany: async (_collection: string, _query: any, _options?: any) =>
      this.wrap(async () => [{ _id: "doc-1", title: "Article 1" }], "FIND_FAILED"),
    insert: async (_collection: string, _data: any, _options?: any) =>
      this.wrap(async () => ({ _id: "doc-new" }), "INSERT_FAILED"),
    update: async (_collection: string, _id: any, _data: any, _options?: any) =>
      this.wrap(async () => ({ _id: "doc-1" }), "UPDATE_FAILED"),
    delete: async (_collection: string, _id: any, _options?: any) =>
      this.wrap(async () => undefined, "DELETE_FAILED"),
  } as unknown as ICrudAdapter;
}

describe("Ring Buffer Pool Cache Safety", () => {
  it("prevents ring buffer pool recycling from corrupting cached result references", async () => {
    const adapter = new DummyAdapter();
    const ns = new CollectionsNamespace(adapter as any);

    const schema = {
      _id: "Articles",
      name: "Articles",
      slug: "articles",
      fields: [{ db_fieldName: "title", widget: { Name: "Input" } }],
      status: "published",
    };

    ns.registerSchema("Articles", schema as any);

    // 1. Initial find query -> caches payload
    const initialResult = await ns.find("Articles", { limit: 10, skipValidation: true } as any);
    expect(initialResult.success).toBe(true);
    expect(initialResult.data).toHaveLength(1);

    // 2. Recycle ring buffer 300 times (exceeding 256 pool size)
    for (let i = 0; i < 300; i++) {
      await adapter.crud.findMany("Articles", {});
    }

    // 3. Retrieve from cache
    const cachedHit = await ns.find("Articles", { limit: 10, skipValidation: true } as any);
    expect(cachedHit.success).toBe(true);
    expect(Array.isArray(cachedHit.data)).toBe(true);
    expect(cachedHit.data).toHaveLength(1);
    expect(cachedHit.data?.[0]?.title).toBe("Article 1");
  });
});
