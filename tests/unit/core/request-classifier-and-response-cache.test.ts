/**
 * @file tests/unit/core/request-classifier-and-response-cache.test.ts
 * @description Unit tests for Request Classifier lane routing, Response Cache service, GraphQL parity, and multi-user security isolation.
 */

import { describe, expect, test } from "vitest";
import {
  classifyRequest,
  RequestLane,
  CACHEABLE_PREFIXES,
} from "@src/hooks/handle-request-classifier";
import {
  responseCache,
  buildUserResponseCacheKey,
  buildGraphQLResponseCacheKey,
  generateContentEtag,
  classifyTurboKey,
  collectionResponseCacheTags,
} from "@src/services/cache/response-cache";

describe("Request Classifier Lane Router", () => {
  test("classifies FAST_STATIC assets accurately", () => {
    const faviconUrl = new URL("http://localhost:5173/favicon.ico");
    const staticUrl = new URL("http://localhost:5173/static/logo.png");
    const headers = new Headers();

    expect(classifyRequest(faviconUrl, "GET", headers)).toBe(RequestLane.FAST_STATIC);
    expect(classifyRequest(staticUrl, "GET", headers)).toBe(RequestLane.FAST_STATIC);
  });

  test("classifies HEALTH check endpoints accurately", () => {
    const healthUrl = new URL("http://localhost:5173/health");
    const apiHealthUrl = new URL("http://localhost:5173/api/system/health");
    const headers = new Headers();

    expect(classifyRequest(healthUrl, "GET", headers)).toBe(RequestLane.HEALTH);
    expect(classifyRequest(apiHealthUrl, "GET", headers)).toBe(RequestLane.HEALTH);
  });

  test("classifies FILES and PUBLIC_SITE routes accurately", () => {
    const fileUrl = new URL("http://localhost:5173/files/document.pdf");
    const publicUrl = new URL("http://localhost:5173/about-us");
    const headers = new Headers();

    expect(classifyRequest(fileUrl, "GET", headers)).toBe(RequestLane.FILES);
    expect(classifyRequest(publicUrl, "GET", headers)).toBe(RequestLane.PUBLIC_SITE);
  });

  test("classifies APP_SSR for admin application pages accurately", () => {
    const dashboardUrl = new URL("http://localhost:5173/dashboard");
    const configUrl = new URL("http://localhost:5173/en/config");
    const collectionsUrl = new URL("http://localhost:5173/de/collections/posts");
    const headers = new Headers();

    expect(classifyRequest(dashboardUrl, "GET", headers)).toBe(RequestLane.APP_SSR);
    expect(classifyRequest(configUrl, "GET", headers)).toBe(RequestLane.APP_SSR);
    expect(classifyRequest(collectionsUrl, "GET", headers)).toBe(RequestLane.APP_SSR);
  });

  test("classifies HYPER_TURBO vs API_READ correctly based on session presence", () => {
    const collectionsUrl = new URL("http://localhost:5173/api/collections/posts");
    const graphqlUrl = new URL("http://localhost:5173/api/graphql");
    const publicHeaders = new Headers();
    // Production cookie name is auth_sessions (SESSION_COOKIE_NAME), not svelty_session
    const sessionHeaders = new Headers({ cookie: "auth_sessions=xyz123" });
    const hostSession = new Headers({ cookie: "__Host-auth_sessions=xyz123" });
    const secureSession = new Headers({ cookie: "__Secure-auth_sessions=xyz123" });
    const bearerHeaders = new Headers({ authorization: "Bearer tok" });

    expect(classifyRequest(collectionsUrl, "GET", publicHeaders)).toBe(RequestLane.API_READ);
    expect(classifyRequest(collectionsUrl, "GET", sessionHeaders)).toBe(RequestLane.HYPER_TURBO);
    expect(classifyRequest(collectionsUrl, "GET", hostSession)).toBe(RequestLane.HYPER_TURBO);
    expect(classifyRequest(collectionsUrl, "GET", secureSession)).toBe(RequestLane.HYPER_TURBO);
    expect(classifyRequest(collectionsUrl, "GET", bearerHeaders)).toBe(RequestLane.HYPER_TURBO);
    expect(classifyRequest(graphqlUrl, "GET", sessionHeaders)).toBe(RequestLane.HYPER_TURBO);
  });

  test("exact cookie boundary: lookalike cookie names never match the session token", () => {
    const collectionsUrl = new URL("http://localhost:5173/api/collections/posts");
    // `my_auth_sessions_extra` must NOT match the exact `auth_sessions` boundary —
    // it is a public request (API_READ), not a warm-session HYPER_TURBO request.
    const extraName = new Headers({ cookie: "my_auth_sessions_extra=1" });
    const hostExtra = new Headers({ cookie: "__Host-auth_sessions_extra=1" });
    const multiCookie = new Headers({
      cookie: "theme=dark; my_auth_sessions_extra=1; auth_sessions=xyz123",
    });

    expect(classifyRequest(collectionsUrl, "GET", extraName)).toBe(RequestLane.API_READ);
    expect(classifyRequest(collectionsUrl, "GET", hostExtra)).toBe(RequestLane.API_READ);
    // The real session cookie later in the header still matches exactly.
    expect(classifyRequest(collectionsUrl, "GET", multiCookie)).toBe(RequestLane.HYPER_TURBO);
  });

  test("classifies OPTIONS preflights as API_READ (never HYPER_TURBO / API_WRITE)", () => {
    const collectionsUrl = new URL("http://localhost:5173/api/collections/posts");
    const publicHeaders = new Headers();
    const sessionHeaders = new Headers({ cookie: "auth_sessions=xyz123" });

    expect(classifyRequest(collectionsUrl, "OPTIONS", publicHeaders)).toBe(RequestLane.API_READ);
    // Even with a warm session on a cacheable path, preflights skip HYPER_TURBO.
    expect(classifyRequest(collectionsUrl, "OPTIONS", sessionHeaders)).toBe(RequestLane.API_READ);
    // Method matching is case-insensitive.
    expect(classifyRequest(collectionsUrl, "options", publicHeaders)).toBe(RequestLane.API_READ);
    // Non-cacheable API paths behave identically for preflights.
    const nonCacheableUrl = new URL("http://localhost:5173/api/custom/route");
    expect(classifyRequest(nonCacheableUrl, "OPTIONS", publicHeaders)).toBe(RequestLane.API_READ);
  });

  test("locale normalization only strips configured locales (en|de), never public paths", () => {
    const headers = new Headers();
    // Public paths like /about must NOT be misclassified as APP_SSR (generic
    // [a-z]{2} locale regexes would strip them to "/").
    const aboutUrl = new URL("http://localhost:5173/about");
    const blogUrl = new URL("http://localhost:5173/blog");
    // /en-US is not a configured locale (locales are en|de) — stays public.
    const enUsUrl = new URL("http://localhost:5173/en-US/products");
    // Real locale prefix on a public path is stripped, then re-classified.
    const enAboutUrl = new URL("http://localhost:5173/en/about");

    expect(classifyRequest(aboutUrl, "GET", headers)).toBe(RequestLane.PUBLIC_SITE);
    expect(classifyRequest(blogUrl, "GET", headers)).toBe(RequestLane.PUBLIC_SITE);
    expect(classifyRequest(enUsUrl, "GET", headers)).toBe(RequestLane.PUBLIC_SITE);
    expect(classifyRequest(enAboutUrl, "GET", headers)).toBe(RequestLane.PUBLIC_SITE);
  });

  test("classifies API_WRITE for mutation methods", () => {
    const collectionsUrl = new URL("http://localhost:5173/api/collections/posts");
    const headers = new Headers();

    expect(classifyRequest(collectionsUrl, "POST", headers)).toBe(RequestLane.API_WRITE);
    expect(classifyRequest(collectionsUrl, "DELETE", headers)).toBe(RequestLane.API_WRITE);
  });

  test("exports valid CACHEABLE_PREFIXES array including /api/graphql", () => {
    expect(Array.isArray(CACHEABLE_PREFIXES)).toBe(true);
    expect(CACHEABLE_PREFIXES).toContain("/api/collections");
    expect(CACHEABLE_PREFIXES).toContain("/api/graphql");
  });

  test("classifies every RequestLane enum member at least once (hooks contract)", () => {
    const headers = new Headers();
    const cases: Array<[string, string, Headers, RequestLane]> = [
      ["http://localhost/favicon.ico", "GET", headers, RequestLane.FAST_STATIC],
      ["http://localhost/health", "GET", headers, RequestLane.HEALTH],
      ["http://localhost/files/x.pdf", "GET", headers, RequestLane.FILES],
      [
        "http://localhost/api/collections/posts",
        "GET",
        new Headers({ cookie: "auth_sessions=abc" }),
        RequestLane.HYPER_TURBO,
      ],
      ["http://localhost/api/collections/posts", "GET", headers, RequestLane.API_READ],
      ["http://localhost/api/collections/posts", "POST", headers, RequestLane.API_WRITE],
      ["http://localhost/dashboard", "GET", headers, RequestLane.APP_SSR],
      ["http://localhost/setup", "GET", headers, RequestLane.BOOTSTRAP],
      ["http://localhost/about-us", "GET", headers, RequestLane.PUBLIC_SITE],
    ];
    const seen = new Set<RequestLane>();
    for (const [href, method, h, expected] of cases) {
      const lane = classifyRequest(new URL(href), method, h);
      expect(lane).toBe(expected);
      seen.add(lane);
    }
    // All enum members must remain reachable — guards against dead lanes after hooks refactors
    for (const lane of Object.values(RequestLane)) {
      expect(seen.has(lane as RequestLane)).toBe(true);
    }
  });
});

describe("Unified Response Cache Security & GraphQL Parity", () => {
  test("enforces multi-user cache isolation (User A payload never leaks to User B)", async () => {
    const path = "/api/collections/posts";
    const search = "?limit=10";

    const keyUserA = buildUserResponseCacheKey(path, search, "user-A-123");
    const keyUserB = buildUserResponseCacheKey(path, search, "user-B-456");

    expect(keyUserA).not.toBe(keyUserB);

    const payloadUserA = { body: '{"user":"A"}', etag: generateContentEtag('{"user":"A"}') };
    const payloadUserB = { body: '{"user":"B"}', etag: generateContentEtag('{"user":"B"}') };

    responseCache.set(keyUserA, payloadUserA, 60_000);
    responseCache.set(keyUserB, payloadUserB, 60_000);

    const cachedA = responseCache.get(keyUserA);
    const cachedB = responseCache.get(keyUserB);

    expect(cachedA?.body).toBe('{"user":"A"}');
    expect(cachedB?.body).toBe('{"user":"B"}');
  });

  test("normalizes GraphQL variables (empty object vs empty string vs undefined parity)", () => {
    const query = "query { contentSystemHealth { state } }";
    const userId = "usr-123";

    const keyEmptyObj = buildGraphQLResponseCacheKey(query, {}, "all", userId);
    const keyEmptyStr = buildGraphQLResponseCacheKey(query, "", "all", userId);
    const keyUndefined = buildGraphQLResponseCacheKey(query, undefined, "all", userId);

    expect(keyEmptyObj).toBe(keyEmptyStr);
    expect(keyEmptyObj).toBe(keyUndefined);
  });

  test("normalizes GraphQL variables (parsed JSON object vs raw query string parity)", () => {
    const query = "query GetPost($id: String!) { post(id: $id) { title } }";
    const userId = "usr-123";

    const keyObj = buildGraphQLResponseCacheKey(query, { id: "10" }, "published", userId);
    const keyStr = buildGraphQLResponseCacheKey(query, '{"id":"10"}', "published", userId);

    expect(keyObj).toBe(keyStr);
  });

  test("sorts GraphQL variable object keys deterministically (deep nested)", () => {
    const query = "query Search($filter: FilterInput) { items(filter: $filter) { id } }";
    const userId = "usr-123";

    const key1 = buildGraphQLResponseCacheKey(query, { filter: { b: 1, a: 2 } }, "all", userId);
    const key2 = buildGraphQLResponseCacheKey(query, { filter: { a: 2, b: 1 } }, "all", userId);
    const key3 = buildGraphQLResponseCacheKey(query, '{"filter":{"b":1,"a":2}}', "all", userId);

    expect(key1).toBe(key2);
    expect(key1).toBe(key3);
  });

  test("normalizes userId parameter across string, number, and ObjectId shapes", () => {
    const query = "query { me { email } }";
    const fakeObjectId = { toString: () => "507f1f77bcf86cd799439011" };

    const keyObjId = buildGraphQLResponseCacheKey(query, {}, "all", fakeObjectId);
    const keyString = buildGraphQLResponseCacheKey(query, {}, "all", "507f1f77bcf86cd799439011");

    expect(keyObjId).toBe(keyString);
  });

  test("calculates deterministic content-based ETag hashes", () => {
    const body1 = '{"data":[1,2,3]}';
    const body2 = '{"data":[1,2,3]}';
    const body3 = '{"data":[1,2,4]}';

    const etag1 = generateContentEtag(body1);
    const etag2 = generateContentEtag(body2);
    const etag3 = generateContentEtag(body3);

    expect(etag1).toBe(etag2);
    expect(etag1).not.toBe(etag3);
    expect(etag1.startsWith('"')).toBe(true);
  });

  test("invalidates response cache on clearLocal / invalidateAll", async () => {
    const key = buildGraphQLResponseCacheKey("query { ping }", {}, "all", "u1");
    responseCache.set(key, { body: '{"data":true}', etag: '"123"' }, 60_000);

    expect(responseCache.get(key)).not.toBeNull();
    await responseCache.clearLocal();
    expect(responseCache.get(key)).toBeNull();
  });

  test("classifyTurboKey splits list, point-read, and GraphQL keys", () => {
    expect(classifyTurboKey("u:1:/api/collections/posts?limit=10")).toEqual({
      graphql: false,
      collection: "posts",
    });
    expect(classifyTurboKey("u:1:/api/collections/posts/abc-123")).toEqual({
      graphql: false,
      collection: "posts",
      entryId: "abc-123",
    });
    expect(classifyTurboKey("anon:/api/graphql?q=deadbeef")).toEqual({ graphql: true });
    expect(classifyTurboKey("u:1:/api/collections/posts/list")).toEqual({
      graphql: false,
      collection: "posts",
    });
  });

  test("collectionResponseCacheTags never puts list tags on point-reads", () => {
    const point = collectionResponseCacheTags("posts", "abc-123");
    expect(point.skipSharedL1).toBe(true);
    expect(point.tags).toEqual(["res:all", "doc:posts:abc-123"]);
    const list = collectionResponseCacheTags("posts", null);
    expect(list.skipSharedL1).toBe(false);
    expect(list.tags).toContain("collection:posts");
    expect(list.tags).toContain("res:posts");
  });

  test("surgical invalidateLocal keeps sibling findById turbo hits", () => {
    const tenant = "surgical-iso";
    const keyList = buildUserResponseCacheKey("/api/collections/posts", "?limit=10", "user-1");
    const keyGql = buildGraphQLResponseCacheKey("query { posts { id } }", {}, "all", "user-1");
    const pointA = buildUserResponseCacheKey("/api/collections/posts/id-a", "", "user-1");
    const pointB = buildUserResponseCacheKey("/api/collections/posts/id-b", "", "user-1");

    // Admission (2-touch, see `pointAdmission`): each point id must be seen twice before
    // it takes a slot, so the surgical-invalidation assertions below act on admitted
    // entries rather than on a first-sighting filter entry.
    responseCache.set(pointA, { body: '{"id":"a"}', etag: '"a"' }, 60_000, tenant);
    responseCache.set(pointB, { body: '{"id":"b"}', etag: '"b"' }, 60_000, tenant);
    responseCache.set(pointA, { body: '{"id":"a"}', etag: '"a"' }, 60_000, tenant);
    responseCache.set(pointB, { body: '{"id":"b"}', etag: '"b"' }, 60_000, tenant);
    responseCache.set(keyList, { body: '{"items":[]}', etag: '"l"' }, 60_000, tenant);
    responseCache.set(keyGql, { body: '{"data":[]}', etag: '"g"' }, 60_000, tenant);

    responseCache.invalidateLocal("posts", tenant, { entryIds: ["id-a"] });

    expect(responseCache.get(pointA, tenant)).toBeNull();
    expect(responseCache.get(pointB, tenant)?.body).toBe('{"id":"b"}');
    const listAfter = responseCache.get(keyList, tenant);
    expect(listAfter?.body).toBe('{"items":[]}');
    expect(listAfter?.stale).toBe(true);
    const gqlAfter = responseCache.get(keyGql, tenant);
    expect(gqlAfter?.body).toBe('{"data":[]}');
    expect(gqlAfter?.stale).toBe(true);

    responseCache.set(keyList, { body: '{"items":[1]}', etag: '"l2"' }, 60_000, tenant);
    expect(responseCache.get(keyList, tenant)?.stale).toBe(false);
    expect(responseCache.get(keyList, tenant)?.body).toBe('{"items":[1]}');
  });

  test("a cold random point scan takes no point-tier slots", async () => {
    const tenant = "cold-scan";
    const keyFor = (i: number) =>
      buildUserResponseCacheKey(`/api/collections/posts/id-${i}`, "", "user-1");

    // 500 distinct ids, one read each — the `findByIdRandom` shape. Before admission,
    // every one of them inserted a full body into the 2000-slot tier and was evicted
    // unread; now a first sighting costs one filter entry and no response slot. Measured
    // as a delta: sibling tests in this file share the tier, so absolute counts are theirs.
    const before = responseCache.getL1ByteStats();
    for (let i = 0; i < 500; i++) {
      responseCache.set(keyFor(i), { body: `{"id":"${i}"}`, etag: `"${i}"` }, 60_000, tenant);
    }
    const afterCold = responseCache.getL1ByteStats();
    expect(afterCold.pointEntries).toBe(before.pointEntries);
    expect(afterCold.pointBytes).toBe(before.pointBytes);

    // Second pass: the ids are now repeated, so they take slots (and the tier's byte
    // accounting stays exact).
    for (let i = 0; i < 500; i++) {
      responseCache.set(keyFor(i), { body: `{"id":"${i}"}`, etag: `"${i}"` }, 60_000, tenant);
    }
    const afterWarm = responseCache.getL1ByteStats();
    expect(afterWarm.pointEntries).toBe(before.pointEntries + 500);
    expect(afterWarm.pointBytes).toBe(afterWarm.recountPointBytes);
    expect(responseCache.get(keyFor(499), tenant)?.body).toBe('{"id":"499"}');
    await responseCache.clearLocal();
  });

  test("point-read turbo L1 admits on the second touch and does not evict lists", async () => {
    const tenant = "admit-iso";
    const point = buildUserResponseCacheKey("/api/collections/posts/id-hot", "", "user-1");
    const list = buildUserResponseCacheKey("/api/collections/posts", "?limit=10", "user-1");
    responseCache.set(list, { body: '{"items":[]}', etag: '"l"' }, 60_000, tenant);
    // Admission (2-touch): a first sighting of a point id takes no slot — with 100k
    // uniform random ids and 2000 slots, admitting on the first touch meant every cold
    // read inserted a full-body entry that was evicted unread. The second touch admits.
    responseCache.set(point, { body: '{"id":"hot"}', etag: '"h"' }, 60_000, tenant);
    expect(responseCache.get(point, tenant)).toBeNull();
    responseCache.set(point, { body: '{"id":"hot"}', etag: '"h"' }, 60_000, tenant);
    expect(responseCache.get(point, tenant)?.body).toBe('{"id":"hot"}');
    expect(responseCache.get(list, tenant)?.body).toBe('{"items":[]}');
    await responseCache.clearLocal();
  });
});
