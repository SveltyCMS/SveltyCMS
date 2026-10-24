/**
 * @file tests/unit/scripts/check-route-behaviour.test.ts
 * @description Self-guarding unit test for `scripts/check/check-route-behaviour.ts`.
 *
 * Two halves:
 * 1. Pure scoring — synthetic routes + synthetic test sources pin the mapping
 *    rules (module import, URL literal, ambiguity, locale params) and the four
 *    behaviour cells, so the metric cannot silently change meaning.
 * 2. Repo floor — the live tree must stay at or above the recorded score, so
 *    route-behaviour coverage can only improve.
 */

import { describe, expect, it } from "vitest";
import {
  BEHAVIOUR_CLASSES,
  applicableClasses,
  discoverRoutes,
  discoverTestFiles,
  extractStringConstants,
  extractUrlLiterals,
  formatJson,
  loadLocales,
  matchUrlToRoute,
  parseArgs,
  resolveUrl,
  scoreRouteBehaviour,
  splitTestBlocks,
  type RouteEntry,
  type RouteSegment,
} from "../../../scripts/check/check-route-behaviour";

const ROOT = process.cwd();

/** Recorded 2026-10-24: 99/99 applicable cells (100%). Floor only — never drop. */
const SCORE_FLOOR = 99;

function segmentFor(raw: string): RouteSegment {
  if (raw.startsWith("[...") && raw.endsWith("]")) return { kind: "rest", raw };
  if (raw.startsWith("[") && raw.endsWith("]")) return { kind: "param", raw };
  return { kind: "static", raw };
}

function route(url: string, kind: "page" | "api" = "page"): RouteEntry {
  const segments = url.split("/").filter(Boolean).map(segmentFor);
  const id = `src/routes${kind === "page" ? "/(app)" : "/api"}${url}`;
  return {
    id,
    kind,
    file: `${id}/+${kind === "page" ? "page.server" : "server"}.ts`,
    url,
    segments,
  };
}

function score(routes: RouteEntry[], files: Array<[string, string]>, locales = ["en", "de"]) {
  return scoreRouteBehaviour({
    routes,
    testFiles: files.map(([path, source]) => ({ path, source })),
    locales,
  });
}

const row = (result: ReturnType<typeof score>, id: string) => {
  const found = result.routes.find((entry) => entry.id === id);
  if (!found) throw new Error(`missing route row: ${id}`);
  return found;
};

describe("pure scoring — mapping rules", () => {
  it("credits load-contract when a test imports the route module and asserts its result", () => {
    const dashboard = route("/dashboard");
    const result = score(
      [dashboard],
      [
        [
          "tests/unit/routes/dashboard.test.ts",
          `
          import { describe, it, expect } from "vitest";
          import { load } from "../../src/routes/(app)/dashboard/+page.server";
          it("returns page data", async () => {
            const data = await load({ locals: {} });
            expect(data.pageData.user.id).toBe("u1");
          });
        `,
        ],
      ],
    );

    expect(row(result, dashboard.id).flags["load-contract"]).toBe(true);
    expect(row(result, dashboard.id).flags["failure-path"]).toBe(false);
    expect(row(result, dashboard.id).flags.persistence).toBe(false);
    expect(row(result, dashboard.id).flags.concurrency).toBe(false);
  });

  it("does not credit 'request fired' or a visibility assertion", () => {
    const userApi = route("/api/user", "api");
    const result = score(
      [userApi],
      [
        [
          "tests/e2e/routes/user/shell.spec.ts",
          `
          test("fires the request", async ({ page }) => {
            await page.request.post("/api/user/batch", { data: {} });
            await expect(page.getByTestId("user-page")).toBeVisible();
            expect(fetchMock).toHaveBeenCalledWith("/api/user/batch", expect.anything());
          });
        `,
        ],
      ],
    );

    expect(row(result, userApi.id).score).toBe(0);
  });

  it("credits failure-path from a 4xx status assertion", () => {
    const userApi = route("/api/[...path]", "api");
    const result = score(
      [userApi],
      [
        [
          "tests/unit/api/user.test.ts",
          `
          it("denies anonymous", async () => {
            const res = await fetch("/api/user/me");
            expect(res.status).toBe(401);
          });
          it("denies editors", async () => {
            const res = await fetch("/api/user/me");
            expect([200, 403]).toContain(res.status);
          });
        `,
        ],
      ],
    );

    const flags = row(result, userApi.id).flags;
    expect(flags["failure-path"]).toBe(true);
    expect(flags["load-contract"]).toBe(true);
  });

  it("requires mutation AND a re-read AND an assertion for persistence", () => {
    const userApi = route("/api/[...path]", "api");
    const userPage = route("/user");
    const result = score(
      [userApi, userPage],
      [
        [
          "tests/e2e/routes/user/persist.spec.ts",
          `
          test("mutates then re-reads", async ({ page }) => {
            await page.request.post("/api/user/update-user-attributes", { data: { name: "x" } });
            await page.reload();
            expect(pageData.user.name).toBe("x");
          });
          test("mutates but never re-reads", async ({ page }) => {
            await page.request.post("/api/user/batch", { data: {} });
            expect(toast.textContent).toBe("Saved");
          });
        `,
        ],
      ],
    );

    // POST block: mutation + reload → persistence.
    expect(row(result, userApi.id).flags.persistence).toBe(true);
    // A second route is referenced in the same file; it must not inherit the reload.
    expect(row(result, userPage.id).flags.persistence).toBe(false);
  });

  it("credits concurrency for parallel requests and ignores a sequential loop", () => {
    const userApi = route("/api/[...path]", "api");
    const result = score(
      [userApi],
      [
        [
          "tests/integration/api/user-race.test.ts",
          `
          it("parallel writes", async () => {
            const [a, b] = await Promise.all([
              fetch("/api/user/batch", { method: "POST" }),
              fetch("/api/user/batch", { method: "POST" }),
            ]);
            expect(a.status).toBe(200);
            expect(b.status).toBe(200);
          });
        `,
        ],
      ],
    );

    expect(row(result, userApi.id).flags.concurrency).toBe(true);
  });

  it("discards a URL block that resolves to two different routes (ambiguity)", () => {
    const a = route("/config/webhooks");
    const b = route("/config/workflows");
    const result = score(
      [a, b],
      [
        [
          "tests/e2e/routes/config/ambiguous.spec.ts",
          `
          test("hits both", async ({ page }) => {
            await page.goto("/config/webhooks");
            await page.request.post("/config/workflows", { data: {} });
            expect(pageData.ok).toBe(true);
          });
        `,
        ],
      ],
    );

    expect(row(result, a.id).score).toBe(0);
    expect(row(result, b.id).score).toBe(0);
  });

  it("does not mix route facts across test blocks", () => {
    const api = route("/api/[...path]", "api");
    const page = route("/user");
    const result = score(
      [api, page],
      [
        [
          "tests/e2e/routes/user/mixed.spec.ts",
          `
          test("api contract", async () => {
            const res = await fetch("/api/user/me");
            expect(res.status).toBe(200);
            expect(await res.json()).toMatchObject({ success: true });
          });
          test("ui only", async ({ page }) => {
            await page.goto("/user");
            await expect(page.getByTestId("user-page")).toBeVisible();
          });
        `,
        ],
      ],
    );

    expect(row(result, api.id).flags["load-contract"]).toBe(true);
    expect(row(result, page.id).flags["load-contract"]).toBe(false);
  });
});

describe("pure scoring — URL resolution", () => {
  const collection = route("/[language]/[...collection]");
  const language = route("/[language]");

  it("prefers a static route over the API catch-all", () => {
    const catchAll = route("/api/[...path]", "api");
    const graphql = route("/api/graphql", "api");
    const resolved = resolveUrl("/api/graphql", [catchAll, graphql], ["en"]);
    expect(resolved?.id).toBe(graphql.id);
  });

  it("prefers an exact match over a zero-width rest", () => {
    expect(resolveUrl("/de", [language, collection], ["en", "de"])?.id).toBe(language.id);
  });

  it("only treats configured locales as a language param", () => {
    expect(resolveUrl("/de/posts", [language, collection], ["en", "de"])?.id).toBe(collection.id);
    expect(resolveUrl("/photo.jpg", [language, collection], ["en", "de"])).toBeNull();
    expect(resolveUrl("/wp-json/posts", [language, collection], ["en", "de"])).toBeNull();
  });

  it("returns null when two routes tie at the same specificity", () => {
    const a = route("/api/plugins/[pluginId]", "api");
    const b = route("/api/widgets/[pluginId]", "api");
    expect(matchUrlToRoute("/api/plugins/toggle", a, [])).not.toBeNull();
    expect(resolveUrl("/api/plugins/toggle", [a, b], [])?.id).toBe(a.id);
    const tied = [route("/api/[action]", "api"), route("/api/[pluginId]", "api")];
    expect(resolveUrl("/api/toggle", tied, [])).toBeNull();
  });

  it("resolves same-file string constants and keeps unknown interpolations as wildcards", () => {
    const constants = extractStringConstants(`const LANGUAGE = "en"; const API = getBaseUrl();`);
    const urls = extractUrlLiterals(
      "const res = await fetch(`${API}/${LANGUAGE}/collection/${ID}`);",
      constants,
    );
    expect(urls).toEqual(["/en/collection/${ID}"]);
    expect(resolveUrl(urls[0], [collection], ["en"])?.id).toBe(collection.id);
  });
});

describe("pure scoring — helpers", () => {
  it("splits per-test blocks and falls back to the whole file", () => {
    const blocks = splitTestBlocks(`test("a", () => {});\nit("b", () => {});`);
    expect(blocks.map((block) => block.line)).toEqual([1, 2]);
    expect(splitTestBlocks("// no cases here")).toHaveLength(1);
  });

  it("parses CLI flags", () => {
    expect(parseArgs(["--check", "--min=45", "--json"])).toMatchObject({
      check: true,
      min: 45,
      json: true,
    });
    expect(parseArgs([])).toMatchObject({ check: false, min: 0, json: false });
  });

  it("emits valid JSON with every behaviour class", () => {
    const dashboard = route("/dashboard");
    const result = score([dashboard], []);
    const parsed = JSON.parse(formatJson(result, 0)) as {
      score: number;
      routes: Array<{ flags: Record<string, boolean> }>;
    };
    expect(parsed.routes).toHaveLength(1);
    expect(Object.keys(parsed.routes[0].flags)).toEqual([...BEHAVIOUR_CLASSES]);
  });
});

describe("pure scoring — applicability", () => {
  it("scopes persistence and concurrency to routes that can write", () => {
    expect(applicableClasses("api", "export const GET = async () => {};")).toEqual([
      "load-contract",
      "failure-path",
      "concurrency",
    ]);
    expect(applicableClasses("api", "export const POST = async () => {};")).toEqual([
      "load-contract",
      "failure-path",
      "persistence",
      "concurrency",
    ]);
    expect(applicableClasses("page", "export const load = async () => {};")).toEqual([
      "load-contract",
      "failure-path",
    ]);
    expect(applicableClasses("page", "export const actions = {};")).toEqual([
      "load-contract",
      "failure-path",
      "persistence",
      "concurrency",
    ]);
  });

  it("scores against the applicable cells only", () => {
    const page: RouteEntry = {
      ...route("/dashboard"),
      applicable: ["load-contract", "failure-path"],
    };
    const api: RouteEntry = {
      ...route("/api/[...path]", "api"),
      applicable: [...BEHAVIOUR_CLASSES],
    };
    const result = score(
      [page, api],
      [
        [
          "tests/unit/routes/dashboard.test.ts",
          `
          import { load } from "../../src/routes/(app)/dashboard/+page.server";
          it("returns page data", async () => {
            const data = await load({ locals: {} });
            expect(data.pageData.user.id).toBe("u1");
          });
        `,
        ],
      ],
    );

    // 2 + 4 applicable cells; only the referenced page's load contract is covered.
    expect(result.totals.cells).toBe(6);
    expect(result.totals.covered).toBe(1);
    expect(row(result, page.id).score).toBe(0.5);
    expect(row(result, api.id).score).toBe(0);
  });
});

describe("repo floor", () => {
  const routes = discoverRoutes(ROOT);
  const testFiles = discoverTestFiles(ROOT);
  const result = scoreRouteBehaviour({ routes, testFiles, locales: loadLocales(ROOT) });

  it("discovers the admin page loaders and API endpoints", () => {
    expect(routes.length).toBeGreaterThanOrEqual(30);
    expect(routes.some((entry) => entry.id === "src/routes/(app)/dashboard")).toBe(true);
    expect(routes.some((entry) => entry.id === "src/routes/api/[...path]")).toBe(true);
    for (const entry of routes) expect(entry.file.endsWith(".ts")).toBe(true);
  });

  it("keeps route-behaviour coverage at or above the recorded floor", () => {
    const applicableCells = routes.reduce(
      (sum, entry) => sum + (entry.applicable ?? BEHAVIOUR_CLASSES).length,
      0,
    );
    expect(result.totals.cells).toBe(applicableCells);
    expect(result.totals.cells).toBeLessThanOrEqual(routes.length * BEHAVIOUR_CLASSES.length);
    expect(result.score).toBeGreaterThanOrEqual(SCORE_FLOOR);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it("reports every class and every route with four flags", () => {
    for (const cls of BEHAVIOUR_CLASSES) {
      expect(result.perClass[cls].covered).toBeGreaterThanOrEqual(0);
      expect(result.perClass[cls].percent).toBeGreaterThanOrEqual(0);
    }
    for (const entry of result.routes) {
      expect(Object.keys(entry.flags).sort()).toEqual([...BEHAVIOUR_CLASSES].sort());
    }
  });
});
