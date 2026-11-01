/**
 * @file tests/unit/auth/post-auth-landing.test.ts
 * @description Post-auth landing resolution: an invited user whose token carries a
 * non-builder role must not be sent to `/config/collectionbuilder`, whose load
 * throws `error(403)` for roles without the collection-builder permission — and a
 * caller who IS builder-capable must not be sent to a page their role cannot
 * open either.
 *
 * The capability input is what actually drifted between the auth paths (2FA,
 * passkey and sign-up passed role + isAdmin only), so the server-side composition
 * `resolveUserPostAuthLanding` is asserted against real role permission sets
 * instead of against the source text of its call sites.
 */

import { describe, expect, it } from "vitest";
import {
  COLLECTION_BUILDER_PATH,
  DEFAULT_AUTH_LANDING_PATH,
  canOpenCollectionBuilder,
  resolvePostAuthLandingPath,
} from "@utils/auth/post-auth-landing";
import { resolveUserPostAuthLanding } from "@utils/auth/post-auth-landing.server";
import { DEFAULT_ROLE_GRANTS } from "@src/databases/auth/permission-catalog";
import type { Role } from "@src/databases/auth/types";

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

/** Role row shaped like a stored role (id + permission list). */
function role(id: string, permissions: readonly string[]): Role {
  return { _id: id, name: id, permissions: [...permissions] } as unknown as Role;
}

describe("resolveUserPostAuthLanding — one capability input for every auth path", () => {
  it("gives a custom role granted config:collectionbuilder the builder, not the dashboard", () => {
    // 2FA / passkey / sign-up used to pass only role + isAdmin here, so this
    // caller was mis-routed to the dashboard although the builder page opens
    // for their role.
    const path = resolveUserPostAuthLanding(
      { role: "auditor" },
      { roles: [role("auditor", ["collections:read", "config:collectionbuilder"])] },
    );

    expect(path).toBe(COLLECTION_BUILDER_PATH);
  });

  it("uses the same deep landing for that caller as the builder page allows", () => {
    const path = resolveUserPostAuthLanding(
      { role: "auditor" },
      {
        roles: [role("auditor", ["config:collectionbuilder"])],
        firstCollectionPath: "/collection/posts",
      },
    );

    expect(path).toBe("/collection/posts");
  });

  it("keeps a plain custom role on the dashboard", () => {
    const path = resolveUserPostAuthLanding(
      { role: "auditor" },
      { roles: [role("auditor", ["collections:read"])] },
    );

    expect(path).toBe(DEFAULT_AUTH_LANDING_PATH);
  });

  it("matches the seeded roles: editor → dashboard, developer → builder", () => {
    expect(
      resolveUserPostAuthLanding(
        { role: "editor" },
        { roles: [role("editor", DEFAULT_ROLE_GRANTS.editor)] },
      ),
    ).toBe(DEFAULT_AUTH_LANDING_PATH);

    expect(
      resolveUserPostAuthLanding(
        { role: "developer" },
        { roles: [role("developer", DEFAULT_ROLE_GRANTS.developer)] },
      ),
    ).toBe(COLLECTION_BUILDER_PATH);
  });

  it("honours the hook's admin flag and the user's own admin mark", () => {
    expect(resolveUserPostAuthLanding({ role: "editor" }, { isAdmin: true })).toBe(
      COLLECTION_BUILDER_PATH,
    );
    expect(resolveUserPostAuthLanding({ role: "editor", isAdmin: true })).toBe(
      COLLECTION_BUILDER_PATH,
    );
    expect(resolveUserPostAuthLanding({ role: "admin" })).toBe(COLLECTION_BUILDER_PATH);
  });

  it("falls back to the dashboard for an unknown or missing user", () => {
    expect(resolveUserPostAuthLanding(undefined)).toBe(DEFAULT_AUTH_LANDING_PATH);
    expect(resolveUserPostAuthLanding({ role: "no-such-role" }, { roles: [] })).toBe(
      DEFAULT_AUTH_LANDING_PATH,
    );
  });
});
