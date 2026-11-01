/**
 * @file tests/unit/auth/post-auth-landing.test.ts
 * @description Post-auth landing resolution: an invited user whose token carries a
 * non-builder role must not be sent to `/config/collectionbuilder`, whose load
 * throws `error(403)` for roles without the collection-builder permission.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  COLLECTION_BUILDER_PATH,
  DEFAULT_AUTH_LANDING_PATH,
  canOpenCollectionBuilder,
  resolvePostAuthLandingPath,
} from "@utils/auth/post-auth-landing";

const ROOT = process.cwd();

describe("resolvePostAuthLandingPath", () => {
  it("lands an invited user with the default role on the dashboard", () => {
    expect(resolvePostAuthLandingPath({ role: "user" })).toBe("/dashboard");
  });

  it("never sends a non-builder to the guarded collection builder", () => {
    for (const role of ["user", "editor", "author", "", null, undefined, "guest"]) {
      const path = resolvePostAuthLandingPath({ role: role as string | null | undefined });
      expect(path).not.toBe(COLLECTION_BUILDER_PATH);
      expect(path).toBe(DEFAULT_AUTH_LANDING_PATH);
    }
  });

  it("keeps the builder for admins and developers", () => {
    expect(resolvePostAuthLandingPath({ role: "admin" })).toBe(COLLECTION_BUILDER_PATH);
    expect(resolvePostAuthLandingPath({ role: "ADMIN" })).toBe(COLLECTION_BUILDER_PATH);
    expect(resolvePostAuthLandingPath({ role: "developer" })).toBe(COLLECTION_BUILDER_PATH);
    expect(resolvePostAuthLandingPath({ isAdmin: true, role: "user" })).toBe(
      COLLECTION_BUILDER_PATH,
    );
    expect(resolvePostAuthLandingPath({ role: "editor", canBuildCollections: true })).toBe(
      COLLECTION_BUILDER_PATH,
    );
  });

  it("prefers the first usable collection page for builder-capable callers", () => {
    expect(
      resolvePostAuthLandingPath({ role: "admin", firstCollectionPath: "/collection/posts" }),
    ).toBe("/collection/posts");
  });

  it("ignores unsafe landing targets", () => {
    for (const bad of ["https://evil.example", "//evil.example", "javascript:alert(1)", ""]) {
      expect(resolvePostAuthLandingPath({ role: "admin", firstCollectionPath: bad })).toBe(
        COLLECTION_BUILDER_PATH,
      );
    }
  });

  it("ignores the first collection path for callers who cannot open the builder", () => {
    expect(
      resolvePostAuthLandingPath({ role: "user", firstCollectionPath: "/collection/posts" }),
    ).toBe(DEFAULT_AUTH_LANDING_PATH);
  });
});

describe("canOpenCollectionBuilder", () => {
  it("mirrors the page guard: admin flag, builder roles or an explicit capability", () => {
    expect(canOpenCollectionBuilder({ isAdmin: true })).toBe(true);
    expect(canOpenCollectionBuilder({ role: "admin" })).toBe(true);
    expect(canOpenCollectionBuilder({ role: "developer" })).toBe(true);
    expect(canOpenCollectionBuilder({ role: "auditor", canBuildCollections: true })).toBe(true);
    expect(canOpenCollectionBuilder({ role: "auditor" })).toBe(false);
    expect(canOpenCollectionBuilder({})).toBe(false);
  });
});

describe("post-auth redirect wiring", () => {
  const sources = ["src/routes/login/auth.remote.ts", "src/routes/login/+page.server.ts"].map(
    (rel) => ({ rel, text: readFileSync(join(ROOT, rel), "utf8") }),
  );

  it("no auth path sends the caller to the builder unconditionally", () => {
    // `redirectPath: "/config/collectionbuilder"` / `redirect(303, "/config/...")`
    // is exactly what put an invited non-builder on a 403 page.
    for (const { rel, text } of sources) {
      expect(text, rel).not.toMatch(/redirectPath:\s*"\/config\/collectionbuilder"/);
      expect(text, rel).not.toMatch(/redirect\(\s*\d{3}\s*,\s*"\/config\/collectionbuilder"\s*\)/);
    }
  });

  it("routes the landing decision through resolvePostAuthLandingPath", () => {
    for (const { rel, text } of sources) {
      expect(text, rel).toContain("resolvePostAuthLandingPath");
    }
  });
});
