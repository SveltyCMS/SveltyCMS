/**
 * @file tests/unit/sdk/sdk-fixes-audit.test.ts
 * @description Unit tests verifying the audit fixes.
 */

import { describe, it, expect, vi } from "vitest";
import { resolvePopulatedRelations } from "../../../src/services/sdk/namespaces/populate-resolver";
import { resolvePublicationFilter } from "../../../src/utils/security/publication-policy";
import { applyAdapterTenantContext } from "../../../src/databases/tenant-adapter";
import { createLoaders } from "../../../src/routes/api/graphql/loaders";

describe("Audit Fixes Verification", () => {
  describe("Fix 1: resolvePopulatedRelations argument handling & in-place mutation", () => {
    it("correctly populates relations onto items without throwing", async () => {
      const mockFindMany = vi.fn().mockResolvedValue({
        success: true,
        data: [
          { _id: "author_1", name: "Alice" },
          { _id: "author_2", name: "Bob" },
        ],
      });

      const mockAdapter = {
        crud: {
          findMany: mockFindMany,
        },
      };

      const schema = {
        _id: "posts",
        name: "posts",
        fields: [
          {
            name: "author",
            db_fieldName: "author",
            relation: "authors",
          },
        ],
      };

      const items = [
        { _id: "post_1", title: "Post 1", author: "author_1" },
        { _id: "post_2", title: "Post 2", author: "author_2" },
      ];

      await resolvePopulatedRelations(
        items,
        schema,
        ["author"],
        "tenant_123",
        mockAdapter,
        (id: string) => `collection_${id}`,
      );

      expect(mockFindMany).toHaveBeenCalledWith(
        "collection_authors",
        { _id: { $in: ["author_1", "author_2"] } },
        expect.objectContaining({ limit: 2, tenantId: "tenant_123" }),
      );

      expect((items[0] as any)._populated_author).toEqual({
        _id: "author_1",
        name: "Alice",
      });
      expect((items[1] as any)._populated_author).toEqual({
        _id: "author_2",
        name: "Bob",
      });
    });
  });

  describe("Fix 2: Publication policy privilege check", () => {
    it("does NOT grant draft access to unprivileged role named editor", () => {
      const result = resolvePublicationFilter({ user: { _id: "e1", role: "editor" } }, "draft");
      expect(result).toBe("published");
    });

    it("grants draft access to user with draft read permission", () => {
      const result = resolvePublicationFilter(
        { user: { _id: "e2", role: "editor", permissions: ["content:read_drafts"] } },
        "draft",
      );
      expect(result).toBe("draft");
    });

    it("grants draft access to admin user", () => {
      const result = resolvePublicationFilter({ user: { _id: "a1", isAdmin: true } }, "draft");
      expect(result).toBe("draft");
    });
  });

  describe("Fix 7: GraphQL batch loaders limit parameter", () => {
    it("passes explicit limit to findMany to avoid 1000-row cap", async () => {
      const mockFindMany = vi.fn().mockResolvedValue({
        success: true,
        data: [{ _id: "1", name: "Item 1" }],
      });

      const mockAdapter = {
        crud: {
          findMany: mockFindMany,
          findByIds: vi.fn().mockResolvedValue({ success: true, data: [] }),
        },
      } as any;

      const loaders = createLoaders(mockAdapter, "tenant_1", "all");
      const loader = loaders.collectionLoader.get("products");

      await loader.load("1");

      expect(mockFindMany).toHaveBeenCalledWith(
        "collection_products",
        expect.anything(),
        expect.objectContaining({ limit: 1000, tenantId: "tenant_1" }),
      );
    });
  });

  describe("Fix 8: Tenant context deduplication", () => {
    it("skips setTenantContext if the tenant is already active", async () => {
      const mockSetTenantContext = vi.fn().mockResolvedValue(undefined);
      const mockAdapter = {
        _currentTenantId: "tenant_alpha",
        setTenantContext: mockSetTenantContext,
      } as any;

      await applyAdapterTenantContext(mockAdapter, "tenant_alpha");
      expect(mockSetTenantContext).not.toHaveBeenCalled();

      await applyAdapterTenantContext(mockAdapter, "tenant_beta");
      expect(mockSetTenantContext).toHaveBeenCalledWith("tenant_beta");
    });
  });
});
