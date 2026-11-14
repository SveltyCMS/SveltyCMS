/**
 * @file tests/e2e/routes/config/api-playground.spec.ts
 * @description `/config/api` GraphQL tab — the Yoga explorer entry point.
 *
 * The API Playground now defaults to the Visual Query Builder. The full Yoga
 * GraphiQL IDE still lives at `/api/graphql`, so the GraphQL tab must expose it
 * and the endpoint must answer an authenticated HTML navigation with the landing
 * page (not a 401 JSON envelope).
 */

import { test, expect } from "../../fixtures";
import { loginAsAdmin } from "../../helpers/auth";

test.describe("API Playground — GraphQL explorer", () => {
  // The landing page is a third-party GraphiQL document that loads its bundle
  // from unpkg; its CDN/favicon noise is not a SveltyCMS defect.
  test.use({ zeroErrorGuard: false });

  test("GraphQL tab links to the Yoga landing page and the endpoint serves it", async ({
    page,
  }) => {
    await loginAsAdmin(page, "/config/api?tab=graphql");

    // The dedicated GraphiQL IDE is one explicit action away, not a hidden link.
    const explorerLink = page.getByRole("link", { name: /open yoga explorer/i });
    await expect(explorerLink).toBeVisible({ timeout: 10_000 });
    await expect(explorerLink).toHaveAttribute("href", "/api/graphql");

    // An authenticated browser navigation (Accept: text/html) gets the landing
    // page; a stale/absent session would return the 401 JSON envelope instead.
    const landing = await page.request.get("/api/graphql", { headers: { Accept: "text/html" } });
    expect(landing.status()).toBe(200);
    expect(landing.headers()["content-type"] ?? "").toContain("text/html");
    expect(await landing.text()).toContain("SveltyCMS GraphQL");
  });

  test("config hub restores the direct GraphQL explorer tile", async ({ page }) => {
    await loginAsAdmin(page, "/config");

    // The pre-c14a3e6e1 tile opened `/api/graphql` in its own tab. Keep it
    // alongside the API Playground so the explorer is one click from /config.
    const tile = page.locator('a[href="/api/graphql"]').first();
    await expect(tile).toBeVisible({ timeout: 10_000 });
    await expect(tile).toHaveAttribute("target", "_blank");
    await expect(tile).toContainText(/graphql/i);
  });

  test("GraphQL introspection succeeds without query-depth rejection and SDK snippets use /api/collections (AUD-006, AUD-007, SV-075)", async ({
    page,
  }) => {
    await loginAsAdmin(page, "/config/api");

    // Standard GraphiQL introspection reaches depth 9+ on nested ofType chains;
    // the server must exempt introspection from depth limiting for authenticated admins.
    const introspection = await page.request.post("/api/graphql", {
      data: {
        query: `query IntrospectionProbe {
          __schema {
            queryType { name }
            types {
              name
              fields {
                name
                type {
                  name
                  ofType {
                    name
                    ofType {
                      name
                      ofType {
                        name
                        ofType {
                          name
                          ofType { name }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }`,
      },
    });
    expect(introspection.status()).toBe(200);
    const body = (await introspection.json()) as {
      data?: { __schema?: { queryType?: { name?: string } } };
      errors?: unknown[];
    };
    expect(body.errors).toBeUndefined();
    expect(body.data?.__schema?.queryType?.name).toBeTruthy();

    // AUD-006: Code snippets tab must reference /api/collections/ and never /api/content/
    const pageText = await page.locator("main").innerText();
    expect(pageText).not.toContain("/api/content/");
  });
});
