/**
 * @file tests/unit/services/website-starter-seed.test.ts
 * @description Unit tests for Website Starter homepage seeding.
 */

import { describe, expect, it, vi } from "vitest";
import { seedWebsiteStarterPages } from "@src/routes/setup/seed";
import type { DatabaseAdapter } from "@src/databases/db-interface";

function createMockAdapter(existingPages: unknown[] = []) {
  return {
    crud: {
      findMany: vi.fn().mockResolvedValue(existingPages),
      insertMany: vi.fn().mockResolvedValue({ success: true }),
    },
  } as unknown as DatabaseAdapter;
}

describe("seedWebsiteStarterPages", () => {
  it("skips insert when a home page already exists", async () => {
    const adapter = createMockAdapter([{ slug: "home", title: "Home" }]);

    await seedWebsiteStarterPages(adapter, { siteName: "Acme" });

    expect(adapter.crud!.findMany).toHaveBeenCalledWith(
      "pages",
      expect.objectContaining({ slug: "home" }),
      expect.objectContaining({ bypassTenantCheck: true }),
    );
    expect(adapter.crud!.insertMany).not.toHaveBeenCalled();
  });

  it("inserts a published homepage with Svedit content when none exists", async () => {
    const adapter = createMockAdapter([]);

    await seedWebsiteStarterPages(adapter, { siteName: "Acme Corp" });

    expect(adapter.crud!.insertMany).toHaveBeenCalledTimes(1);
    const [collectionId, rows] = vi.mocked(adapter.crud!.insertMany).mock.calls[0]!;
    expect(collectionId).toBe("pages");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      slug: "home",
      status: "published",
      pageType: "static",
      heroHeading: "Welcome to Acme Corp",
    });
    const row = rows[0] as Record<string, unknown>;
    expect(typeof row.content).toBe("string");
    expect(row.content).toContain("document_id");
  });

  it("no-ops when CRUD is unavailable", async () => {
    const adapter = {} as DatabaseAdapter;

    await expect(seedWebsiteStarterPages(adapter)).resolves.toBeUndefined();
  });
});
