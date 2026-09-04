/**
 * @file tests/unit/routes/api-playground-page-server.test.ts
 * @description RBAC gate and load tests for /config/api Developer & API Playground.
 */

import { describe, expect, it } from "vitest";

describe("api playground +page.server gate", () => {
  it("allows admin user", async () => {
    const { load } = await import("../../../src/routes/(app)/config/api/+page.server");
    const result: any = await load({
      locals: {
        user: { _id: "admin1", role: "admin" },
        isAdmin: true,
        tenantId: "tenant_dev",
      },
    } as any);

    expect(result.isAdmin).toBe(true);
    expect(result.tenantId).toBe("tenant_dev");
    expect(result.openapiSpecUrl).toBe("/api/openapi.json");
    expect(result.graphqlEndpoint).toBe("/api/graphql");
    expect(Array.isArray(result.collections)).toBe(true);
  });

  it("allows developer role user", async () => {
    const { load } = await import("../../../src/routes/(app)/config/api/+page.server");
    const result: any = await load({
      locals: {
        user: { _id: "dev1", role: "developer" },
        isAdmin: false,
        tenantId: null,
      },
    } as any);

    expect(result.isAdmin).toBe(false);
    expect(result.openapiSpecUrl).toBe("/api/openapi.json");
    expect(result.graphqlEndpoint).toBe("/api/graphql");
  });

  it("rejects non-developer editor role with 403", async () => {
    const { load } = await import("../../../src/routes/(app)/config/api/+page.server");
    await expect(
      load({
        locals: {
          user: { _id: "ed1", role: "editor" },
          isAdmin: false,
        },
      } as any),
    ).rejects.toMatchObject({ status: 403 });
  });
});
