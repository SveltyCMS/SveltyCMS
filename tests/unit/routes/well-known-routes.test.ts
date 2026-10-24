/**
 * @file tests/unit/routes/well-known-routes.test.ts
 * @description Unit tests for the discovery routes served at the site root:
 * `indexnow.txt`, `llms.txt`, `robots.txt` and `sitemap.xml`.
 *
 * Boundaries are mocked (DB adapter, LocalCMS, settings); the pure sitemap
 * builders and the route-level error handling run for real, so the assertions
 * cover the documents a crawler actually receives. The in-memory sitemap cache
 * is real too — each test uses its own tenant key and starts from a cold cache.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const h = vi.hoisted(() => ({
  getPublicSettingSync: vi.fn<(key: string) => unknown>(),
  listCollections: vi.fn<() => Promise<unknown>>(),
  findEntries: vi.fn<(collection: string, options?: unknown) => Promise<unknown>>(),
}));

vi.mock("@src/databases/db", () => ({
  dbAdapter: { name: "well-known-route-test-adapter" },
}));

vi.mock("@src/services/sdk", () => ({
  LocalCMS: class {
    collections = {
      list: () => h.listCollections(),
      find: (collection: string, options?: unknown) => h.findEntries(collection, options),
    };
  },
}));

vi.mock("@src/services/core/settings-service", () => ({
  getPublicSettingSync: (key: string) => h.getPublicSettingSync(key),
}));

import { GET as getIndexNow } from "../../../src/routes/indexnow.txt/+server";
import { GET as getLlms } from "../../../src/routes/llms.txt/+server";
import { GET as getRobots } from "../../../src/routes/robots.txt/+server";
import { GET as getSitemap } from "../../../src/routes/sitemap.xml/+server";
import { invalidateSitemapCache } from "@src/services/content/seo/sitemap-cache";

type RouteEvent = Parameters<typeof getIndexNow>[0];

const ORIGIN = "https://cms.example.com";
const LLMS_TENANT_A = "llms-tenant-a";
const LLMS_TENANT_B = "llms-tenant-b";
const SITEMAP_TENANT_A = "sitemap-tenant-a";
const SITEMAP_TENANT_B = "sitemap-tenant-b";

function makeEvent(path: string, tenantId?: string): RouteEvent {
  return {
    url: new URL(`${ORIGIN}${path}`),
    locals: tenantId ? { tenantId } : {},
  } as unknown as RouteEvent;
}

function settings(values: Record<string, unknown>): void {
  h.getPublicSettingSync.mockImplementation((key: string) => values[key]);
}

beforeEach(() => {
  vi.clearAllMocks();
  invalidateSitemapCache(`llms:${LLMS_TENANT_A}`);
  invalidateSitemapCache(`llms:${LLMS_TENANT_B}`);
  invalidateSitemapCache(SITEMAP_TENANT_A);
  invalidateSitemapCache(SITEMAP_TENANT_B);
  invalidateSitemapCache("global");
  h.listCollections.mockResolvedValue([]);
  h.findEntries.mockResolvedValue({ data: [] });
});

describe("GET /indexnow.txt", () => {
  it("404s when INDEXNOW_KEY is not configured", async () => {
    settings({});

    const response = await getIndexNow(makeEvent("/indexnow.txt"));

    expect(response.status).toBe(404);
    expect(await response.text()).toBe("Not Found");
    expect(h.getPublicSettingSync).toHaveBeenCalledWith("INDEXNOW_KEY");
  });

  it("serves the configured key as plain text", async () => {
    settings({ INDEXNOW_KEY: "a1b2c3d4e5f6" });

    const response = await getIndexNow(makeEvent("/indexnow.txt"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("public, max-age=86400");
    expect(await response.text()).toBe("a1b2c3d4e5f6");
  });
});

describe("GET /robots.txt", () => {
  it("serves the disallow rules and the absolute sitemap URL", async () => {
    settings({});

    const response = await getRobots(makeEvent("/robots.txt"));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain");
    expect(body).toContain("User-agent: *");
    expect(body).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
    for (const rule of ["/api/", "/login", "/setup", "/share", "/email-previews"]) {
      expect(body).toContain(`Disallow: ${rule}`);
    }
  });

  it("applies the AI crawler policy without blocking search crawlers", async () => {
    settings({ AI_CRAWLER_POLICY: "block-training" });

    const response = await getRobots(makeEvent("/robots.txt"));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain("User-agent: GPTBot");
    expect(body).toContain("User-agent: CCBot");
    expect(body).not.toContain("User-agent: OAI-SearchBot");
  });
});

describe("GET /llms.txt", () => {
  it("renders site metadata and published collection links", async () => {
    settings({
      SITE_NAME: "Alpha CMS",
      SITE_SLOGAN: "Content, delivered fast",
      DEFAULT_CONTENT_LANGUAGE: "en",
    });
    h.listCollections.mockResolvedValue([
      { name: "posts", label: "Posts" },
      { name: "system_users" },
      { name: "redirects" },
    ]);
    h.findEntries.mockResolvedValue({
      data: [
        { slug: "hello-world", title: "Hello world", description: "First post" },
        { slug: "", title: "Unreachable entry" },
      ],
    });

    const response = await getLlms(makeEvent("/llms.txt", LLMS_TENANT_A));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8");
    expect(body).toContain("# Alpha CMS");
    expect(body).toContain("> Content, delivered fast");
    expect(body).toContain("## Posts");
    expect(body).toContain(
      "- [Hello world](https://cms.example.com/posts/hello-world): First post",
    );
    expect(body).not.toContain("system_users");
    expect(body).not.toContain("redirects");
    expect(body).not.toContain("Unreachable entry");
    expect(h.findEntries).toHaveBeenCalledTimes(1);
    expect(h.findEntries).toHaveBeenCalledWith(
      "posts",
      expect.objectContaining({
        publicationFilter: "published",
        tenantId: LLMS_TENANT_A,
        limit: 50,
      }),
    );
  });

  it("serves the tenant-scoped cache and keeps tenants isolated", async () => {
    settings({ SITE_NAME: "Alpha CMS" });
    h.listCollections.mockResolvedValue([{ name: "posts", label: "Posts" }]);
    h.findEntries.mockResolvedValue({ data: [{ slug: "first", title: "First" }] });

    const first = await getLlms(makeEvent("/llms.txt", LLMS_TENANT_A));
    const firstBody = await first.text();

    // A warm cache must answer without touching the data layer, even when the
    // underlying collection changed.
    h.findEntries.mockResolvedValue({ data: [{ slug: "second", title: "Second" }] });
    const cached = await getLlms(makeEvent("/llms.txt", LLMS_TENANT_A));
    const cachedBody = await cached.text();

    expect(cachedBody).toBe(firstBody);
    expect(h.listCollections).toHaveBeenCalledTimes(1);
    expect(h.findEntries).toHaveBeenCalledTimes(1);

    // Another tenant has its own cache namespace and rebuilds.
    settings({ SITE_NAME: "Beta CMS" });
    const otherTenant = await getLlms(makeEvent("/llms.txt", LLMS_TENANT_B));
    const otherBody = await otherTenant.text();

    expect(otherBody).toContain("# Beta CMS");
    expect(otherBody).toContain("second");
    expect(otherBody).not.toContain("/posts/first");
    expect(h.listCollections).toHaveBeenCalledTimes(2);
  });
});

describe("GET /sitemap.xml", () => {
  it("renders paginated XML for public collections", async () => {
    settings({ DEFAULT_CONTENT_LANGUAGE: "en" });
    h.listCollections.mockResolvedValue([
      { name: "posts" },
      { name: "system_users" },
      { name: "redirects" },
      { name: "articles" },
    ]);

    const firstPage = Array.from({ length: 200 }, (_, index) => ({
      slug: `post-${index}`,
      updatedAt: "2026-01-02T03:04:05.000Z",
    }));
    h.findEntries.mockImplementation(async (collection: string, options?: unknown) => {
      const offset = (options as { offset?: number } | undefined)?.offset ?? 0;
      if (collection === "posts") {
        return { data: offset === 0 ? firstPage : [{ slug: "post-last" }] };
      }
      if (collection === "articles") {
        return { data: [{ slug: "getting-started", updatedAt: "2026-02-03T04:05:06.000Z" }] };
      }
      return { data: [] };
    });

    const response = await getSitemap(makeEvent("/sitemap.xml", SITEMAP_TENANT_A));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/xml");
    expect(body).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(body).toContain("<loc>https://cms.example.com/posts/post-0</loc>");
    expect(body).toContain("<loc>https://cms.example.com/posts/post-last</loc>");
    expect(body).toContain("<loc>https://cms.example.com/articles/getting-started</loc>");
    expect(body).toContain("<lastmod>2026-01-02T03:04:05.000Z</lastmod>");
    expect(body).not.toContain("system_users");
    expect(body).not.toContain("redirects");
    expect(body.match(/<url>/g)).toHaveLength(202);
    expect(h.findEntries).toHaveBeenCalledWith(
      "posts",
      expect.objectContaining({ publicationFilter: "published", limit: 200, offset: 0 }),
    );
    expect(h.findEntries).toHaveBeenCalledWith(
      "posts",
      expect.objectContaining({ publicationFilter: "published", limit: 200, offset: 200 }),
    );
    expect(h.findEntries).toHaveBeenCalledWith(
      "articles",
      expect.objectContaining({ publicationFilter: "published", limit: 200, offset: 0 }),
    );
  });

  it("skips collections that fail to resolve and still serves the sitemap", async () => {
    settings({ DEFAULT_CONTENT_LANGUAGE: "en" });
    h.listCollections.mockResolvedValue([{ name: "broken" }, { name: "posts" }]);
    h.findEntries.mockImplementation(async (collection: string) => {
      if (collection === "broken") throw new Error("schema cache mismatch");
      return { data: [{ slug: "survivor", title: "Survivor" }] };
    });

    const response = await getSitemap(makeEvent("/sitemap.xml", SITEMAP_TENANT_B));
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/xml");
    expect(body).toContain("<loc>https://cms.example.com/posts/survivor</loc>");
    expect(body).not.toContain("broken");
    expect(h.findEntries).toHaveBeenCalledWith("broken", expect.anything());
    expect(h.findEntries).toHaveBeenCalledWith("posts", expect.anything());
  });
});
