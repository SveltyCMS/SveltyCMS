/**
 * @file src/plugins/unified-data-hub/server/rest-fixture.ts
 * @description In-process WordPress REST mock for integration tests (TEST_MODE only).
 *
 * External HTTP fixture — independent of CMS DB_TYPE. Serves WP v2 JSON on loopback
 * for REST connector integration without staging WordPress.
 *
 * Features:
 * - Node http.Server (Bun + Node compatible)
 * - WordPress posts pagination (per_page / page)
 * - Idempotent start/stop for test isolation
 */

import http from "node:http";
import type { AddressInfo } from "node:net";

export const WORDPRESS_FIXTURE_SLUG = "wp-articles";
export const WORDPRESS_FIXTURE_CONNECTOR_ID = "udh-rest-fixture-conn";
export const WORDPRESS_FIXTURE_DEFAULT_PORT = 18_765;

let server: http.Server | null = null;
let fixturePort = WORDPRESS_FIXTURE_DEFAULT_PORT;
let fixturePosts: Record<string, unknown>[] = [];

function assertTestMode(): void {
  const env = process.env;
  const allowed =
    env.TEST_MODE === "true" ||
    env.BENCHMARK === "true" ||
    env.SVELTY_BENCHMARK_SUITE === "true" ||
    env.NODE_ENV === "test";
  if (!allowed) {
    throw new Error("rest-fixture is only available in test/benchmark environments");
  }
}

function buildPosts(rowCount: number): Record<string, unknown>[] {
  return Array.from({ length: rowCount }, (_, i) => ({
    id: i + 1,
    title: { rendered: `Fixture Post ${i + 1}` },
    slug: `fixture-post-${i + 1}`,
    status: "publish",
    content: { rendered: `<p>Body ${i + 1}</p>` },
    excerpt: { rendered: `Excerpt ${i + 1}` },
    date: "2026-07-08T12:00:00",
    modified: "2026-07-08T12:00:00",
    author: 1,
    featured_media: 0,
  }));
}

function mapPostForConnector(row: Record<string, unknown>): Record<string, unknown> {
  const title = row.title as { rendered?: string } | undefined;
  const content = row.content as { rendered?: string } | undefined;
  const excerpt = row.excerpt as { rendered?: string } | undefined;
  return {
    id: row.id,
    title: title?.rendered ?? row.title,
    slug: row.slug,
    status: row.status,
    content: content?.rendered ?? row.content,
    excerpt: excerpt?.rendered ?? row.excerpt,
    date: row.date,
    modified: row.modified,
    author: row.author,
    featured_media: row.featured_media,
  };
}

export function getWordPressFixtureBaseUrl(port = fixturePort): string {
  return `http://127.0.0.1:${port}`;
}

export function getWordPressFixturePort(): number {
  return fixturePort;
}

export async function isWordPressRestFixtureReachable(): Promise<boolean> {
  if (!server) return false;
  try {
    const res = await fetch(`${getWordPressFixtureBaseUrl()}/wp-json/wp/v2/posts?per_page=1`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function startWordPressRestFixture(
  options: { rowCount?: number; port?: number } = {},
): Promise<string> {
  assertTestMode();

  const rowCount = Math.max(1, options.rowCount ?? 25);
  fixturePosts = buildPosts(rowCount);

  if (server) {
    return getWordPressFixtureBaseUrl();
  }

  fixturePort =
    options.port ?? (Number(process.env.UDH_REST_FIXTURE_PORT) || WORDPRESS_FIXTURE_DEFAULT_PORT);

  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", getWordPressFixtureBaseUrl());

    const postItemMatch = url.pathname.match(/^\/wp-json\/wp\/v2\/posts\/([^/]+)$/);
    if (postItemMatch && req.method === "PATCH") {
      const id = postItemMatch[1];
      const existing = fixturePosts.find((p) => String(p.id) === id);
      if (!existing) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ code: "rest_post_invalid_id", message: "Invalid post ID." }));
        return;
      }
      readJsonBody(req)
        .then((patch) => {
          Object.assign(existing, patch);
          if (typeof patch.title === "string") {
            existing.title = { rendered: patch.title };
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(mapPostForConnector(existing)));
        })
        .catch(() => {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ message: "Invalid JSON" }));
        });
      return;
    }

    if (postItemMatch && req.method === "DELETE") {
      const id = postItemMatch[1];
      const idx = fixturePosts.findIndex((p) => String(p.id) === id);
      if (idx < 0) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ code: "rest_post_invalid_id", message: "Invalid post ID." }));
        return;
      }
      fixturePosts.splice(idx, 1);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ deleted: true, id: Number(id) }));
      return;
    }

    if (url.pathname === "/wp-json/wp/v2/posts" && req.method === "POST") {
      readJsonBody(req)
        .then((body) => {
          const nextId = fixturePosts.reduce((max, p) => Math.max(max, Number(p.id) || 0), 0) + 1;
          const title = typeof body.title === "string" ? body.title : `Fixture Post ${nextId}`;
          const row: Record<string, unknown> = {
            id: nextId,
            title: { rendered: title },
            slug: body.slug ?? `fixture-post-${nextId}`,
            status: body.status ?? "draft",
            content: { rendered: body.content ?? "" },
            excerpt: { rendered: body.excerpt ?? "" },
            date: "2026-07-09T12:00:00",
            modified: "2026-07-09T12:00:00",
            author: body.author ?? 1,
            featured_media: body.featured_media ?? 0,
          };
          fixturePosts.push(row);
          res.writeHead(201, { "Content-Type": "application/json" });
          res.end(JSON.stringify(mapPostForConnector(row)));
        })
        .catch(() => {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ message: "Invalid JSON" }));
        });
      return;
    }

    if (url.pathname === "/wp-json/wp/v2/posts" && req.method === "GET") {
      const perPage = Math.min(100, Math.max(1, Number(url.searchParams.get("per_page")) || 10));
      const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
      const slugFilter = url.searchParams.get("slug");
      const statusFilter = url.searchParams.get("status");
      const searchFilter = url.searchParams.get("search")?.toLowerCase();

      let filtered = fixturePosts;
      if (slugFilter) {
        filtered = filtered.filter((p) => p.slug === slugFilter);
      }
      if (statusFilter) {
        filtered = filtered.filter((p) => p.status === statusFilter);
      }
      if (searchFilter) {
        filtered = filtered.filter((p) => {
          const title = p.title as { rendered?: string } | string | undefined;
          const text =
            typeof title === "string" ? title : (title?.rendered ?? String(p.slug ?? ""));
          return text.toLowerCase().includes(searchFilter);
        });
      }

      const offset = (page - 1) * perPage;
      const slice = filtered.slice(offset, offset + perPage).map(mapPostForConnector);

      res.writeHead(200, {
        "Content-Type": "application/json",
        "X-WP-Total": String(filtered.length),
        "X-WP-TotalPages": String(Math.ceil(filtered.length / perPage) || 1),
      });
      res.end(JSON.stringify(slice));
      return;
    }

    if (url.pathname === "/wp-json/wp/v2/posts" && req.method === "HEAD") {
      res.writeHead(200);
      res.end();
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ code: "rest_no_route", message: "No route" }));
  });

  await new Promise<void>((resolve, reject) => {
    server!.once("error", reject);
    server!.listen(fixturePort, "127.0.0.1", () => {
      const addr = server!.address() as AddressInfo | null;
      if (addr?.port) fixturePort = addr.port;
      resolve();
    });
  });

  return getWordPressFixtureBaseUrl();
}

export async function stopWordPressRestFixture(): Promise<void> {
  if (!server) return;
  const active = server;
  server = null;
  await new Promise<void>((resolve, reject) => {
    active.close((err) => (err ? reject(err) : resolve()));
  });
}

export function getRestFixtureServerPort(): number | null {
  if (!server) return null;
  const addr = server.address() as AddressInfo | null;
  return addr?.port ?? fixturePort;
}

function readJsonBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? (JSON.parse(raw) as Record<string, unknown>) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}
