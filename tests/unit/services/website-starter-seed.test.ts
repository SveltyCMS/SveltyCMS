/**
 * @file tests/unit/services/website-starter-seed.test.ts
 * @description Unit tests for Website Starter page seeding.
 */
import { withSystemScope } from "@src/databases/system-tenant-scope";

import { describe, expect, it, vi } from "vitest";
import { seedWebsiteStarterPages } from "@src/routes/setup/seed";
import type { DatabaseAdapter } from "@src/databases/db-interface";

function createMockAdapter(existingPages: Array<Record<string, unknown>> = []) {
  return {
    crud: {
      findMany: vi.fn(async (_collection: string, filter?: { slug?: string }) =>
        existingPages.filter((page) => !filter?.slug || page.slug === filter.slug),
      ),
      insertMany: vi.fn().mockResolvedValue({ success: true }),
      update: vi.fn().mockResolvedValue({ success: true }),
    },
  } as unknown as DatabaseAdapter;
}

describe("seedWebsiteStarterPages", () => {
  it("leaves an existing homepage and adds the legal pages", async () => {
    const adapter = createMockAdapter([{ _id: "home-1", slug: "home", title: "Home" }]);

    await seedWebsiteStarterPages(adapter, { siteName: "Acme" });

    expect(adapter.crud!.update).toHaveBeenCalledWith(
      "pages",
      "home-1",
      expect.objectContaining({ slug: "home", heroHeading: "Welcome to Acme" }),
      expect.objectContaining(withSystemScope("seed")),
    );
    const [collectionId, rows] = vi.mocked(adapter.crud!.insertMany).mock.calls[0]!;
    expect(collectionId).toBe("pages");
    expect(rows.map((row) => (row as { slug: string }).slug)).toEqual(["impressum", "privacy"]);
  });

  it("does not overwrite a legal page the operator already edited", async () => {
    const adapter = createMockAdapter([
      { _id: "home-1", slug: "home" },
      { _id: "imp-1", slug: "impressum", body: "Laden GmbH" },
      { _id: "pri-1", slug: "privacy", body: "Edited" },
    ]);

    await seedWebsiteStarterPages(adapter, { siteName: "Acme" });

    expect(adapter.crud!.insertMany).not.toHaveBeenCalled();
    expect(adapter.crud!.update).toHaveBeenCalledTimes(1);
  });

  it("inserts a published homepage with Svedit content when none exists", async () => {
    const adapter = createMockAdapter([]);

    await seedWebsiteStarterPages(adapter, { siteName: "Acme Corp" });

    expect(adapter.crud!.insertMany).toHaveBeenCalledTimes(1);
    const [collectionId, rows] = vi.mocked(adapter.crud!.insertMany).mock.calls[0]!;
    expect(collectionId).toBe("pages");
    expect(rows.map((row) => (row as { slug: string }).slug)).toEqual([
      "home",
      "impressum",
      "privacy",
    ]);
    expect(rows[0]).toMatchObject({
      slug: "home",
      status: "publish",
      pageType: "static",
      heroHeading: "Welcome to Acme Corp",
    });
    const row = rows[0] as Record<string, unknown>;
    expect(typeof row.content).toBe("string");
    expect(row.content).toContain("document_id");
    expect(String(rows[1] && (rows[1] as { body?: string }).body)).toContain("Acme Corp");
  });

  it("no-ops when CRUD is unavailable", async () => {
    const adapter = {} as DatabaseAdapter;

    await expect(seedWebsiteStarterPages(adapter)).resolves.toBeUndefined();
  });
});
