/**
 * @file tests/unit/plugins/unified-data-hub/rest-fixture.test.ts
 * @description Unit tests for in-process WordPress REST fixture server.
 */

import { afterEach, describe, expect, it } from "vitest";
import {
  getRestFixtureServerPort,
  isWordPressRestFixtureReachable,
  startWordPressRestFixture,
  stopWordPressRestFixture,
} from "@plugins/unified-data-hub/server/rest-fixture";

function pickTestPort(): number {
  return 30_000 + Math.floor(Math.random() * 20_000);
}

describe("WordPress REST fixture", () => {
  beforeEach(async () => {
    await stopWordPressRestFixture();
  });

  afterEach(async () => {
    await stopWordPressRestFixture();
  });

  it("serves paginated posts with flattened title fields", async () => {
    const port = pickTestPort();
    const baseUrl = await startWordPressRestFixture({ rowCount: 30, port });
    expect(getRestFixtureServerPort()).toBe(port);

    const reachable = await isWordPressRestFixtureReachable();
    expect(reachable).toBe(true);

    const page1 = await fetch(`${baseUrl}/wp-json/wp/v2/posts?per_page=10&page=1`);
    expect(page1.ok).toBe(true);
    expect(page1.headers.get("X-WP-Total")).toBe("30");

    const items = await page1.json();
    expect(items).toHaveLength(10);
    expect(items[0].title).toBe("Fixture Post 1");
    expect(items[0].slug).toBe("fixture-post-1");

    const page2 = await fetch(`${baseUrl}/wp-json/wp/v2/posts?per_page=10&page=2`);
    const items2 = await page2.json();
    expect(items2[0].title).toBe("Fixture Post 11");

    const createRes = await fetch(`${baseUrl}/wp-json/wp/v2/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "New Post", slug: "new-post", status: "draft" }),
    });
    expect(createRes.status).toBe(201);
    const created = await createRes.json();
    expect(created.title).toBe("New Post");

    const patchRes = await fetch(`${baseUrl}/wp-json/wp/v2/posts/${created.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Updated Post" }),
    });
    expect(patchRes.ok).toBe(true);
    const updated = await patchRes.json();
    expect(updated.title).toBe("Updated Post");

    const deleteRes = await fetch(`${baseUrl}/wp-json/wp/v2/posts/${created.id}`, {
      method: "DELETE",
    });
    expect(deleteRes.ok).toBe(true);
  });

  it("reuses the same server on repeated start calls", async () => {
    const first = await startWordPressRestFixture({ rowCount: 5, port: pickTestPort() });
    const second = await startWordPressRestFixture({ rowCount: 12 });
    expect(first).toBe(second);

    const res = await fetch(`${first}/wp-json/wp/v2/posts?per_page=100`);
    const items = await res.json();
    expect(items).toHaveLength(12);
  });
});
