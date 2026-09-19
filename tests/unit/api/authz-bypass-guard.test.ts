/**
 * @file tests/unit/api/authz-bypass-guard.test.ts
 * @description Guardrail against authorization-bypass surfaces in the catch-all API
 * dispatcher (`src/routes/api/[...path]/+server.ts`) and the public-route allowlist
 * (`src/utils/hook-utils.ts`).
 *
 * Background: two authorization bypasses shared one root cause — the set of paths that
 * skip authorization was hand-maintained and nothing asserted it against the permission
 * matrix (the docs described the model, the exemptions silently diverged):
 *   1. `POST /api/user` skipped the endpoint gate because the dispatcher treated a
 *      namespace root (no action segment) as public, so any authenticated user could
 *      create a `role: "admin"` account (CWE-862).
 *   2. `/api/token/*` was a deny-list (everything except list/batch/create-token/resolve
 *      was public), so `PUT`/`DELETE /api/token/:id` never reached `ENDPOINT_PERMISSIONS`
 *      — any session could re-point tokens (CWE-862, account takeover).
 *
 * Features:
 * - Namespace-root invariant: every `/api/<namespace>` root is denied to a permissionless
 *   authenticated non-admin unless the root is in an explicit, reasoned exemption table.
 * - Action-allowlist tripwire: the `action` literals inside `_checkEndpointPermission`
 *   must equal a declared contract, parsed with the TypeScript compiler API.
 * - Public-route tripwire: `PUBLIC_EXACT_ROUTES` / `PUBLIC_PREFIX_ROUTES` /
 *   `isPublicRoute()` branch literals must be declared with a reason, and a corpus probe
 *   over the real namespace inventory fails if any new `/api/...` path becomes public.
 * - Bootstrap-route tripwire: `/api/...` literals inside `isBootstrapRoute()` are declared
 *   (setup-window only) and namespace roots are bootstrap exactly when declared.
 *
 * Source is parsed with the TypeScript compiler API rather than regexes: a naive comment
 * strip has silently deleted real code in this repo (see
 * `tests/unit/routes/endpoint-exports.test.ts`). Every parser has a self-check proving it
 * found a non-empty set, so a broken walk fails instead of passing on nothing.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as ts from "typescript";
import { isPublicRoute, isBootstrapRoute, PUBLIC_ROUTES } from "@utils/hook-utils";
import {
  _API_NAMESPACE_KEYS,
  _ENDPOINT_PERMISSIONS,
  _checkEndpointPermission,
} from "@src/routes/api/[...path]/+server";
import type { Role, User } from "@src/databases/auth/types";
import type { DatabaseId, ISODateString } from "@src/content/types";

const ROOT = process.cwd();
const DISPATCHER_FILE = join(ROOT, "src/routes/api/[...path]/+server.ts");
const HOOK_UTILS_FILE = join(ROOT, "src/utils/hook-utils.ts");

// ─────────────────────────────────────────────────────────────────────────────
// Source parsing (TypeScript compiler API)
// ─────────────────────────────────────────────────────────────────────────────

function sourceOf(text: string, fileName = "guard-fixture.ts"): ts.SourceFile {
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function readSource(file: string): ts.SourceFile {
  // readFileSync throws on a missing/unreadable file — the guard must not pass on that.
  return sourceOf(readFileSync(file, "utf8"), file);
}

function findFunction(source: ts.SourceFile, name: string): ts.FunctionDeclaration | null {
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === name) return statement;
  }
  return null;
}

function stringLiteralsIn(node: ts.Node): string[] {
  const found: string[] = [];
  const visit = (current: ts.Node): void => {
    if (ts.isStringLiteralLike(current)) found.push(current.text);
    else ts.forEachChild(current, visit);
  };
  visit(node);
  return found;
}

/** Values of `const NAME = new Set([...])` or `const NAME = [...]` (string elements). */
function arrayValues(source: ts.SourceFile, name: string): string[] {
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== name) continue;
      const initializer = declaration.initializer;
      if (!initializer) return [];
      if (ts.isArrayLiteralExpression(initializer)) return stringLiteralsIn(initializer);
      if (ts.isNewExpression(initializer) && initializer.arguments?.[0]) {
        return stringLiteralsIn(initializer.arguments[0]);
      }
    }
  }
  return [];
}

/** String literals starting with `prefix` anywhere inside a named function. */
function functionLiterals(source: ts.SourceFile, fnName: string, prefix: string): string[] {
  const fn = findFunction(source, fnName);
  if (!fn) {
    throw new Error(
      `[authz-guard] ${fnName}() not found — the tripwire cannot observe its target. ` +
        `Renaming it must update this guard, never silently disable it.`,
    );
  }
  return [...new Set(stringLiteralsIn(fn).filter((value) => value.startsWith(prefix)))];
}

/**
 * Action names the dispatcher allowlists by name: `action === "<name>"` and
 * `action.startsWith("<name>")` comparisons inside `_checkEndpointPermission`.
 */
function actionLiterals(source: ts.SourceFile): string[] {
  const fn = findFunction(source, "_checkEndpointPermission");
  if (!fn) {
    throw new Error(
      "[authz-guard] _checkEndpointPermission() not found — the allowlist tripwire cannot observe its target.",
    );
  }

  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsEqualsEqualsToken &&
      ts.isIdentifier(node.left) &&
      node.left.text === "action" &&
      ts.isStringLiteralLike(node.right)
    ) {
      found.push(node.right.text);
    } else if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === "startsWith" &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === "action" &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      found.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  };

  visit(fn);
  return [...new Set(found)];
}

function reportDrift(title: string, undeclared: string[], stale: string[]): void {
  if (undeclared.length === 0 && stale.length === 0) return;
  expect.fail(
    `${title}\n` +
      (undeclared.length > 0
        ? `  Undeclared (add to the contract table in this file, with a reason):\n${undeclared
            .map((v) => `    - ${v}`)
            .join("\n")}\n`
        : "") +
      (stale.length > 0
        ? `  Stale contract entries (remove from the contract table in this file):\n${stale
            .map((v) => `    - ${v}`)
            .join("\n")}`
        : ""),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixtures: a permissionless, non-admin session
// ─────────────────────────────────────────────────────────────────────────────

const NO_PERMISSION_ROLE_ID = "guard-no-permission-role";

const noPermissionRoles: Role[] = [
  {
    _id: NO_PERMISSION_ROLE_ID as DatabaseId,
    name: "Guard No Permission",
    permissions: [],
    isAdmin: false,
  },
];

const noPermissionUser: User = {
  _id: "guard-no-permission-user" as DatabaseId,
  email: "guard@example.com",
  role: NO_PERMISSION_ROLE_ID,
  permissions: [],
  createdAt: "2026-01-01T00:00:00Z" as ISODateString,
  updatedAt: "2026-01-01T00:00:00Z" as ISODateString,
};

const adminUser: User = {
  _id: "guard-admin-user" as DatabaseId,
  email: "guard-admin@example.com",
  role: "admin",
  isAdmin: true,
  permissions: [],
  createdAt: "2026-01-01T00:00:00Z" as ISODateString,
  updatedAt: "2026-01-01T00:00:00Z" as ISODateString,
};

const API_NAMESPACES: readonly string[] = [..._API_NAMESPACE_KEYS];
const ALL_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Contract A: dispatcher namespace-root gate
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Namespace roots that intentionally pass `_checkEndpointPermission` for an
 * authenticated non-admin holding no permissions. Adding a root here is a security
 * decision: write the reason, do not silence the test.
 */
const ROOT_GATE_EXEMPTIONS: Record<string, { methods: readonly string[]; reason: string }> = {
  gdpr: {
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    reason:
      "GDPR self-service: any authenticated user; handleGdprRoutes enforces self-or-admin per record, so the root is not a privilege boundary",
  },
  auth: {
    methods: ["GET"],
    reason:
      "bare GET /api/auth returns only the caller's own session user (self-read); every mutation on the namespace stays gated",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Contract B: auth/user action allowlist inside _checkEndpointPermission
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Every literal compared against `action` in `_checkEndpointPermission` must be declared.
 * - `public-exempt`: allowed by name for any authenticated user.
 * - `self-service`: allowed only as `/<namespace>/<action>` (exactly one action segment);
 *   deeper paths fall through to the permission check, so no id can be targeted.
 * - `deny`: never allowed by name (falls through to the permission map).
 */
const AUTH_USER_ACTION_CONTRACT: Record<string, "public-exempt" | "self-service" | "deny"> = {
  me: "public-exempt",
  login: "public-exempt",
  logout: "public-exempt",
  "oidc-login": "public-exempt",
  "oidc-callback": "public-exempt",
  "oidc-logout": "public-exempt",
  "sso-providers": "public-exempt",
  "frontchannel-logout": "public-exempt",
  "backchannel-logout": "public-exempt",
  saml: "public-exempt",
  "2fa": "public-exempt",
  "update-roles": "deny",
  "update-user-attributes": "self-service",
  "save-avatar": "self-service",
  "delete-avatar": "self-service",
};

/** Actions that must never be reachable by name without the mapped permission. */
const UNDECLARED_ACTION_PROBES = [
  "impersonate",
  "create-user",
  "delete-user",
  "update-role",
  "admin",
  "2fa-bypass",
  "me-too",
];

// ─────────────────────────────────────────────────────────────────────────────
// Contract C: public routes
// ─────────────────────────────────────────────────────────────────────────────

interface PublicRouteExpectation {
  readonly path: string;
  readonly kind: "exact" | "prefix";
  readonly reason: string;
}

/**
 * The complete public-route contract for `isPublicRoute()`. Every entry of
 * `PUBLIC_EXACT_ROUTES` ("exact") and `PUBLIC_PREFIX_ROUTES` ("prefix") must appear here
 * with a reason. A new entry in either source array fails until it is declared — that is
 * the drift tripwire this file exists for.
 */
const PUBLIC_ROUTE_CONTRACT: readonly PublicRouteExpectation[] = [
  // Page routes (no API authorization gate involved).
  { path: "/login", kind: "exact", reason: "credential login page" },
  { path: "/register", kind: "exact", reason: "self-registration page (feature-gated)" },
  { path: "/forgot-password", kind: "exact", reason: "password reset request page" },
  { path: "/setup", kind: "exact", reason: "install wizard page (locked by setup middleware)" },
  { path: "/share", kind: "exact", reason: "public share link entry point" },
  { path: "/share", kind: "prefix", reason: "public share link sub-paths" },

  // Unauthenticated API flows.
  { path: "/api/system/health", kind: "exact", reason: "liveness probe, read-only" },
  { path: "/api/system/version", kind: "exact", reason: "version probe, read-only" },
  { path: "/api/user/login", kind: "exact", reason: "credential login (user alias)" },
  { path: "/api/user/2fa/verify", kind: "exact", reason: "second-factor submission (pre-session)" },
  { path: "/api/auth/login", kind: "exact", reason: "credential login" },
  { path: "/api/auth/logout", kind: "exact", reason: "idempotent session teardown for guests" },
  { path: "/api/auth/oidc-login", kind: "exact", reason: "OIDC authorization redirect start" },
  {
    path: "/api/auth/oidc-callback",
    kind: "exact",
    reason: "OIDC redirect target (state/PKCE validated by the handler)",
  },
  { path: "/api/auth/oidc-logout", kind: "exact", reason: "OIDC RP-initiated logout" },
  {
    path: "/api/auth/sso-providers",
    kind: "exact",
    reason: "public list of enabled SSO providers",
  },
  {
    path: "/api/auth/frontchannel-logout",
    kind: "exact",
    reason: "OIDC front-channel logout (a session must be able to end)",
  },
  {
    path: "/api/auth/backchannel-logout",
    kind: "exact",
    reason: "OIDC back-channel logout (assertion verified by the IdP)",
  },
  { path: "/api/auth/saml/login", kind: "exact", reason: "SAML AuthnRequest start" },
  {
    path: "/api/auth/saml/acs",
    kind: "exact",
    reason: "SAML assertion consumer service (signature verified)",
  },
  { path: "/api/preview", kind: "exact", reason: "draft preview token flow" },
  { path: "/api/media/share", kind: "exact", reason: "public share-link media read" },
  {
    path: "/api/system/penalize-bounce",
    kind: "exact",
    reason: "bounce telemetry beacon, counter-only",
  },
  {
    path: "/api/system/prewarm-route",
    kind: "exact",
    reason: "navigation prewarm hint, cache-only",
  },
  {
    path: "/api/security/csp-report",
    kind: "exact",
    reason: "browser CSP report sink (browsers post it without credentials)",
  },
  { path: "/api/settings/public", kind: "prefix", reason: "public (non-secret) settings subset" },
  { path: "/api/theme/public", kind: "prefix", reason: "public theme tokens for pre-login render" },
  {
    path: "/api/commerce/cart",
    kind: "prefix",
    reason: "guest cart (tenant-scoped; CSRF-gated on mutation)",
  },
  { path: "/api/commerce/quote", kind: "prefix", reason: "guest quote request" },
  { path: "/api/commerce/coupon", kind: "prefix", reason: "guest coupon validation" },
  { path: "/api/commerce/checkout", kind: "prefix", reason: "guest checkout" },
  { path: "/api/commerce/pay", kind: "prefix", reason: "guest payment step" },
  { path: "/api/commerce/confirm", kind: "prefix", reason: "guest order confirmation" },
  { path: "/api/commerce/panes", kind: "prefix", reason: "guest storefront panes" },
  { path: "/api/commerce/downloads", kind: "prefix", reason: "guest digital download links" },
  {
    path: "/api/stripe/webhook",
    kind: "prefix",
    reason: "Stripe webhook (signature-verified, no session)",
  },
  {
    path: "/api/stripe/config",
    kind: "prefix",
    reason: "publishable Stripe config for checkout UI",
  },
];

type PublicBranchKind = "public-prefix" | "gated-prefix" | "test-mode-prefix";

/**
 * `/api/...` literals inside `isPublicRoute()` that are not array entries. The corpus
 * tripwire covers behaviour; this table forces a written justification when a new branch
 * literal appears (a new deny-list branch is exactly how the token bypass was born).
 */
const PUBLIC_BRANCH_CONTRACT: readonly {
  literal: string;
  kind: PublicBranchKind;
  reason: string;
}[] = [
  {
    literal: "/api/token/",
    kind: "gated-prefix",
    reason:
      "namespace anchor: every /api/token/* path is NOT public unless a deeper literal matches. The pre-fix deny-list exposed PUT/DELETE /api/token/:id (CWE-862)",
  },
  {
    literal: "/api/token/validate-token/",
    kind: "public-prefix",
    reason: "read-only token validation flow (the handler serves it for GET only)",
  },
  {
    literal: "/api/testing",
    kind: "test-mode-prefix",
    reason:
      "public only with isPublicRoute(path, true); /api/testing is fail-closed via x-test-secret and stripped from production bundles",
  },
];

/**
 * `/api/...` entries of `PUBLIC_ROUTES` (the docs/audit surface) that are namespace
 * umbrellas rather than public paths. They must NOT be public themselves — the umbrella
 * documents "this namespace has public sub-paths", not "this namespace is public".
 */
const PUBLIC_ROUTES_UMBRELLA: Record<string, string> = {
  "/api/auth": "umbrella for the login/logout/SSO paths declared above",
  "/api/system": "umbrella for the health/version/prewarm paths declared above",
};

/**
 * Segment probes covering the shapes bypasses have historically used: id-like segments
 * (deny-list leftovers), action names of the token flow, and the public sub-paths above.
 */
const PROBE_SEGMENTS = [
  "list",
  "batch",
  "create-token",
  "resolve",
  "validate-token",
  "some-token-id",
  "abc123",
  "test-id",
  "public",
  "health",
  "version",
  "share",
  "config",
  "webhook",
  "login",
  "logout",
  "oidc-login",
  "oidc-callback",
  "oidc-logout",
  "sso-providers",
  "frontchannel-logout",
  "backchannel-logout",
  "saml",
  "acs",
  "2fa",
  "me",
  "penalize-bounce",
  "prewarm-route",
  "csp-report",
  "cart",
  "quote",
  "coupon",
  "checkout",
  "pay",
  "confirm",
  "panes",
  "downloads",
  "guard-probe",
];

const PROBE_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ["validate-token", "secret-value"],
  ["saml", "acs"],
  ["saml", "login"],
  ["2fa", "verify"],
  ["token-id", "update"],
  ["list", "batch"],
];

/** `/api/...` and `/api/v1/...` corpus over the real namespace inventory. */
function buildCorpus(): string[] {
  const paths = new Set<string>();
  const roots = ["/api", "/api/v1"];
  for (const root of roots) {
    for (const namespace of API_NAMESPACES) {
      paths.add(`${root}/${namespace}`);
      for (const probe of PROBE_SEGMENTS) paths.add(`${root}/${namespace}/${probe}`);
      for (const [first, second] of PROBE_PAIRS) {
        paths.add(`${root}/${namespace}/${first}/${second}`);
      }
    }
  }
  return [...paths];
}

const PUBLIC_EXACT_DECLARED = new Set(
  PUBLIC_ROUTE_CONTRACT.filter((entry) => entry.kind === "exact").map((entry) => entry.path),
);
const PUBLIC_PREFIX_DECLARED = new Set(
  PUBLIC_ROUTE_CONTRACT.filter((entry) => entry.kind === "prefix").map((entry) => entry.path),
);

/**
 * Exact match, or a declared prefix — mirrors `isPublicRoute()` prefix semantics.
 * Declared `public-prefix` branch literals (e.g. /api/token/validate-token/) count too;
 * `gated-prefix` / `test-mode-prefix` literals deliberately do not cover production paths.
 */
function declaredPublicCoverage(path: string): string | null {
  if (PUBLIC_EXACT_DECLARED.has(path)) return `exact:${path}`;
  for (const prefix of PUBLIC_PREFIX_DECLARED) {
    if (path.startsWith(prefix)) return `prefix:${prefix}`;
  }
  for (const entry of PUBLIC_BRANCH_CONTRACT) {
    if (entry.kind === "public-prefix" && path.startsWith(entry.literal)) {
      return `branch:${entry.literal}`;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Contract D: bootstrap routes (setup-window only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * `/api/...` literals inside `isBootstrapRoute()`. Bootstrap routes are treated as public
 * by `classifyRequest()` ONLY while setup is incomplete (`setupApiLocked`), so they are
 * not an authorization bypass for a configured instance — but they must stay declared,
 * because a new prefix here silently widens the pre-install surface.
 *
 * `bootstrap-prefix` entries are positively matched; `api-guard` entries are negation
 * guards (`!pathname.startsWith("/api/")`) and must therefore NOT be bootstrap routes.
 */
const BOOTSTRAP_CONTRACT: readonly {
  literal: string;
  kind: "bootstrap-prefix" | "api-guard";
  reason: string;
}[] = [
  {
    literal: "/api/setup",
    kind: "bootstrap-prefix",
    reason: "install wizard API; classifyRequest locks it once setup is complete (CWE-306 fix)",
  },
  {
    literal: "/api/auth",
    kind: "bootstrap-prefix",
    reason: "login/logout/SSO flows run before any session exists",
  },
  { literal: "/api/user/login", kind: "bootstrap-prefix", reason: "credential login alias" },
  {
    literal: "/api/system",
    kind: "bootstrap-prefix",
    reason: "health/version/prewarm probes used pre-login",
  },
  {
    literal: "/api/debug",
    kind: "bootstrap-prefix",
    reason: "debug surface; public only while setup is incomplete, never on a configured instance",
  },
  {
    literal: "/api/testing",
    kind: "bootstrap-prefix",
    reason: "E2E harness API; fail-closed via x-test-secret, stripped from production bundles",
  },
  {
    literal: "/api/settings/public",
    kind: "bootstrap-prefix",
    reason: "public settings subset needed on the login screen",
  },
  {
    literal: "/api/content/version",
    kind: "bootstrap-prefix",
    reason: "content version probe used by setup/health UI",
  },
  {
    literal: "/api/dashboard/health",
    kind: "bootstrap-prefix",
    reason: "dashboard health probe",
  },
  {
    literal: "/api/",
    kind: "api-guard",
    reason:
      "negation guard: non-API static paths only — this literal must never make /api/... paths bootstrap in production",
  },
];

/**
 * Namespace roots that `isBootstrapRoute()` matches only because it uses raw prefix
 * `startsWith` (registry aliases sharing the `/api/system` prefix). They stay declared so
 * a new alias cannot silently inherit bootstrap status; the dispatcher gate still denies
 * them for permissionless callers (asserted below).
 */
const BOOTSTRAP_PREFIX_OVERMATCHES: Record<string, string> = {
  "system-jobs": "alias of the system handler, matched by the /api/system prefix",
  "system-settings": "alias of the settings handler, matched by the /api/system prefix",
  "system-preferences": "alias of the preference handler, matched by the /api/system prefix",
  "system-webhooks": "alias of the webhook handler, matched by the /api/system prefix",
  "system-virtual-folder": "alias of the virtual-folder handler, matched by the /api/system prefix",
  systemVirtualFolder: "alias of the virtual-folder handler, matched by the /api/system prefix",
};

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("authz bypass guard (dispatcher gate + public-route allowlist)", () => {
  describe("parser self-checks", () => {
    const PARSER_FIXTURE = `
      const DECOY = ["/api/decoy"];
      const PUBLIC_EXACT_ROUTES = new Set([
        "/login", // trailing comment with "/api/ghost" must not leak
        /* block comment: new Set(["/api/ghost-two"])
           multi-line, with real-looking code */
        \`/api/template-literal\`,
      ]);
      function isPublicRoute(pathname: string): boolean {
        if (pathname.startsWith("/api/real")) return true;
        return pathname.includes("/not-api");
      }
      function _checkEndpointPermission(user: unknown, segments: string[]): boolean {
        const action = segments[1];
        if (action === "me" || action === "2fa") return true;
        if (action.startsWith("2fa")) return true;
        if (action === "me") return true;
        return false;
      }
    `;

    it("extracts array literals without leaking comments, and targets the right binding", () => {
      const fixture = sourceOf(PARSER_FIXTURE);
      expect(arrayValues(fixture, "PUBLIC_EXACT_ROUTES")).toEqual([
        "/login",
        "/api/template-literal",
      ]);
      expect(arrayValues(fixture, "DECOY")).toEqual(["/api/decoy"]);
      expect(arrayValues(fixture, "NOT_PRESENT")).toEqual([]);
    });

    it("extracts function-scoped literal prefixes and action comparisons (deduplicated)", () => {
      const fixture = sourceOf(PARSER_FIXTURE);
      expect(functionLiterals(fixture, "isPublicRoute", "/api/")).toEqual(["/api/real"]);
      expect(actionLiterals(fixture)).toEqual(["me", "2fa"]);
    });

    it("fails loudly when the guarded function is renamed away", () => {
      const fixture = sourceOf(PARSER_FIXTURE);
      expect(() => functionLiterals(fixture, "isPublicRouteRenamed", "/api/")).toThrow(
        /isPublicRouteRenamed\(\) not found/,
      );
      expect(() => actionLiterals(sourceOf("function other() {}"))).toThrow(
        /_checkEndpointPermission\(\) not found/,
      );
    });
  });

  describe("dispatcher namespace-root gate (POST /api/user regression)", () => {
    it("discovers the real namespace inventory (self-check)", () => {
      expect(API_NAMESPACES.length).toBeGreaterThan(20);
      expect(API_NAMESPACES).toContain("user");
      expect(API_NAMESPACES).toContain("token");
    });

    it("declares no exemption for a namespace that does not exist", () => {
      const unknown = Object.keys(ROOT_GATE_EXEMPTIONS).filter(
        (namespace) => !API_NAMESPACES.includes(namespace),
      );
      expect(unknown, `Remove stale ROOT_GATE_EXEMPTIONS entries: ${unknown.join(", ")}`).toEqual(
        [],
      );
    });

    it("denies every non-exempt namespace root for a permissionless non-admin", () => {
      const unexpectedAllows: string[] = [];
      const missingExpectedAllows: string[] = [];

      for (const namespace of API_NAMESPACES) {
        const exemption = ROOT_GATE_EXEMPTIONS[namespace];
        for (const method of ALL_METHODS) {
          const allowed = _checkEndpointPermission(
            noPermissionUser,
            noPermissionRoles,
            method,
            namespace,
            [namespace],
          );
          const expected = exemption?.methods.includes(method) ?? false;
          if (allowed && !expected) {
            unexpectedAllows.push(`${method} /api/${namespace}`);
          } else if (!allowed && expected) {
            missingExpectedAllows.push(`${method} /api/${namespace}`);
          }
        }
      }

      if (unexpectedAllows.length > 0) {
        expect.fail(
          `These namespace roots pass the endpoint gate without the mapped permission ` +
            `(${unexpectedAllows.length}). A root has no action segment: it must fall through to ` +
            `ENDPOINT_PERMISSIONS, or be declared in ROOT_GATE_EXEMPTIONS with a reason.\n` +
            unexpectedAllows.map((entry) => `  - ${entry}`).join("\n"),
        );
      }
      if (missingExpectedAllows.length > 0) {
        expect.fail(
          `ROOT_GATE_EXEMPTIONS no longer matches behaviour — remove or fix these declarations:\n` +
            missingExpectedAllows.map((entry) => `  - ${entry}`).join("\n"),
        );
      }
    });

    it("keeps the gate alive for privileged callers (control — the matrix is not vacuous)", () => {
      for (const namespace of API_NAMESPACES) {
        expect(
          _checkEndpointPermission(adminUser, [], "POST", namespace, [namespace]),
          `admin fast-path broken for /api/${namespace}`,
        ).toBe(true);
      }

      const userManager: User = { ...noPermissionUser, _id: "guard-user-manager" as DatabaseId };
      const userManagerRoles: Role[] = [
        {
          _id: NO_PERMISSION_ROLE_ID as DatabaseId,
          name: "Guard No Permission",
          permissions: ["user:write", "user:read"],
          isAdmin: false,
        },
      ];
      expect(
        _checkEndpointPermission(userManager, userManagerRoles, "POST", "user", ["user"]),
        "user:write must still open POST /api/user",
      ).toBe(true);
    });

    it("denies the historical bypass shapes by name", () => {
      // 1) Account creation with a privileged payload: POST /api/user (bare namespace root).
      expect(
        _checkEndpointPermission(noPermissionUser, noPermissionRoles, "POST", "user", ["user"]),
      ).toBe(false);
      // 2) Token mutation: the middleware bypass is asserted below, this is the dispatcher gate.
      expect(
        _checkEndpointPermission(noPermissionUser, noPermissionRoles, "PUT", "token", [
          "token",
          "some-token-id",
        ]),
      ).toBe(false);
      expect(
        _checkEndpointPermission(noPermissionUser, noPermissionRoles, "DELETE", "token", [
          "token",
          "some-token-id",
        ]),
      ).toBe(false);
      expect(
        _checkEndpointPermission(noPermissionUser, noPermissionRoles, "POST", "token", [
          "token",
          "create-token",
        ]),
      ).toBe(false);
      // 3) Root aliases of the same handlers must not be softer than the canonical route.
      expect(
        _checkEndpointPermission(noPermissionUser, noPermissionRoles, "PUT", "website-tokens", [
          "website-tokens",
          "some-token-id",
        ]),
      ).toBe(false);
    });

    it("maps every mapped namespace to a non-empty permission for mutating methods", () => {
      const entries = Object.entries(_ENDPOINT_PERMISSIONS);
      expect(entries.length).toBeGreaterThan(20); // self-check

      const broken: string[] = [];
      for (const [namespace, mapping] of entries) {
        for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const) {
          const permission = typeof mapping === "function" ? mapping(method) : mapping;
          if (typeof permission !== "string" || permission.trim() === "") {
            broken.push(`${method} /api/${namespace} → ${JSON.stringify(permission)}`);
          }
        }
      }
      expect(
        broken,
        `Mapped namespaces must resolve to a real permission id:\n${broken.join("\n")}`,
      ).toEqual([]);
    });
  });

  describe("auth/user action allowlist (_checkEndpointPermission)", () => {
    it("declares exactly the action names the source allowlists (drift tripwire)", () => {
      const parsed = actionLiterals(readSource(DISPATCHER_FILE));
      expect(parsed.length).toBeGreaterThanOrEqual(10); // self-check: parser found the allowlist

      const declared = Object.keys(AUTH_USER_ACTION_CONTRACT);
      reportDrift(
        "_checkEndpointPermission compares action names that are not declared in AUTH_USER_ACTION_CONTRACT.",
        parsed.filter((action) => !declared.includes(action)),
        declared.filter((action) => !parsed.includes(action)),
      );
    });

    it("behaves exactly as the action contract declares", () => {
      const mismatches: string[] = [];

      for (const [action, kind] of Object.entries(AUTH_USER_ACTION_CONTRACT)) {
        for (const namespace of ["auth", "user"] as const) {
          const allowed = _checkEndpointPermission(
            noPermissionUser,
            noPermissionRoles,
            "POST",
            namespace,
            [namespace, action],
          );

          if (kind === "public-exempt" && !allowed) {
            mismatches.push(`POST /api/${namespace}/${action} → denied (declared: public-exempt)`);
          }
          if (kind === "deny" && allowed) {
            mismatches.push(`POST /api/${namespace}/${action} → allowed (declared: deny)`);
          }
          if (kind === "self-service") {
            if (!allowed) {
              mismatches.push(`POST /api/${namespace}/${action} → denied (declared: self-service)`);
            }
            const deeper = _checkEndpointPermission(
              noPermissionUser,
              noPermissionRoles,
              "POST",
              namespace,
              [namespace, action, "extra"],
            );
            if (deeper) {
              mismatches.push(
                `POST /api/${namespace}/${action}/extra → allowed (self-service must stay scoped to exactly one action segment)`,
              );
            }
          }
        }
      }

      if (mismatches.length > 0) {
        expect.fail(
          `The auth/user action allowlist diverged from AUTH_USER_ACTION_CONTRACT:\n` +
            mismatches.map((entry) => `  - ${entry}`).join("\n"),
        );
      }
    });

    it("denies undeclared auth/user actions for a permissionless caller", () => {
      const allowed: string[] = [];
      for (const action of UNDECLARED_ACTION_PROBES) {
        for (const namespace of ["auth", "user"] as const) {
          const permitted = _checkEndpointPermission(
            noPermissionUser,
            noPermissionRoles,
            "POST",
            namespace,
            [namespace, action],
          );
          if (permitted) allowed.push(`POST /api/${namespace}/${action}`);
        }
      }
      expect(
        allowed,
        `Only actions declared in AUTH_USER_ACTION_CONTRACT may be exempt by name:\n${allowed.join("\n")}`,
      ).toEqual([]);
    });

    it("allows the caller's own profile by id but denies foreign ids", () => {
      const ownId = String(noPermissionUser._id);
      expect(
        _checkEndpointPermission(noPermissionUser, noPermissionRoles, "GET", "user", [
          "user",
          ownId,
        ]),
      ).toBe(true);
      expect(
        _checkEndpointPermission(noPermissionUser, noPermissionRoles, "GET", "user", [
          "user",
          "someone-else",
        ]),
      ).toBe(false);
      expect(
        _checkEndpointPermission(noPermissionUser, noPermissionRoles, "DELETE", "user", [
          "user",
          ownId,
        ]),
      ).toBe(true); // own account deletion is a self-service flow
      expect(
        _checkEndpointPermission(noPermissionUser, noPermissionRoles, "DELETE", "user", [
          "user",
          "someone-else",
        ]),
      ).toBe(false);
    });
  });

  describe("public route allowlist (isPublicRoute)", () => {
    it("parses both public route arrays from source (self-check)", () => {
      const hookUtils = readSource(HOOK_UTILS_FILE);
      const exact = arrayValues(hookUtils, "PUBLIC_EXACT_ROUTES");
      const prefix = arrayValues(hookUtils, "PUBLIC_PREFIX_ROUTES");
      expect(exact.length).toBeGreaterThan(20);
      expect(prefix.length).toBeGreaterThan(10);
      expect(exact).toContain("/api/media/share");
      expect(prefix).toContain("/api/settings/public");
    });

    it("declares every source allowlist entry with a reason (drift tripwire)", () => {
      const hookUtils = readSource(HOOK_UTILS_FILE);
      const parsedExact = arrayValues(hookUtils, "PUBLIC_EXACT_ROUTES");
      const parsedPrefix = arrayValues(hookUtils, "PUBLIC_PREFIX_ROUTES");

      reportDrift(
        "hook-utils.ts public route arrays contain entries missing from PUBLIC_ROUTE_CONTRACT.",
        [
          ...parsedExact.filter((path) => !PUBLIC_EXACT_DECLARED.has(path)),
          ...parsedPrefix.filter((path) => !PUBLIC_PREFIX_DECLARED.has(path)),
        ],
        [
          ...[...PUBLIC_EXACT_DECLARED].filter((path) => !parsedExact.includes(path)),
          ...[...PUBLIC_PREFIX_DECLARED].filter((path) => !parsedPrefix.includes(path)),
        ],
      );
    });

    it("every declared contract entry is actually public (no stale declarations)", () => {
      const stale = PUBLIC_ROUTE_CONTRACT.filter((entry) => !isPublicRoute(entry.path, false)).map(
        (entry) => `${entry.kind} ${entry.path}`,
      );
      expect(
        stale,
        `PUBLIC_ROUTE_CONTRACT entries no longer return true from isPublicRoute():\n${stale.join("\n")}`,
      ).toEqual([]);
    });

    it("no /api path becomes public without a contract entry (corpus tripwire)", () => {
      const corpus = buildCorpus();
      expect(corpus.length).toBeGreaterThan(1000); // self-check

      const undeclaredPublic: string[] = [];
      for (const path of corpus) {
        if (isPublicRoute(path, false) && declaredPublicCoverage(path) === null) {
          undeclaredPublic.push(path);
        }
      }

      if (undeclaredPublic.length > 0) {
        expect.fail(
          `These /api paths are public but not declared in PUBLIC_ROUTE_CONTRACT ` +
            `(${undeclaredPublic.length}). A new bypass surface must be a reviewed, reasoned ` +
            `contract entry — not an add-only patch to the allowlist.\n` +
            undeclaredPublic.map((path) => `  - ${path}`).join("\n"),
        );
      }
    });

    it("TEST_MODE widens the public surface by exactly the declared test-mode prefixes", () => {
      const corpus = buildCorpus();
      const unexpected: string[] = [];

      for (const path of corpus) {
        const declaredTestMode = PUBLIC_BRANCH_CONTRACT.some(
          (entry) => entry.kind === "test-mode-prefix" && path.startsWith(entry.literal),
        );
        const inProduction = isPublicRoute(path, false);
        const inTestMode = isPublicRoute(path, true);
        if (inTestMode !== (inProduction || declaredTestMode)) {
          unexpected.push(
            `${path} → production=${inProduction}, test-mode=${inTestMode}, declaredTestMode=${declaredTestMode}`,
          );
        }
      }

      expect(
        unexpected,
        `isPublicRoute(path, true) must differ from production exactly on declared test-mode prefixes:\n${unexpected
          .slice(0, 20)
          .join("\n")}`,
      ).toEqual([]);
    });

    it("declares every /api/... literal inside isPublicRoute()", () => {
      const parsed = functionLiterals(readSource(HOOK_UTILS_FILE), "isPublicRoute", "/api/");
      expect(parsed.length).toBeGreaterThanOrEqual(3); // self-check: parser found the branches

      const declared = PUBLIC_BRANCH_CONTRACT.map((entry) => entry.literal);
      reportDrift(
        "isPublicRoute() gained an /api/... literal that is not declared in PUBLIC_BRANCH_CONTRACT.",
        parsed.filter((literal) => !declared.includes(literal)),
        declared.filter((literal) => !parsed.includes(literal)),
      );
    });

    it("keeps every branch literal meaningful", () => {
      const problems: string[] = [];

      for (const entry of PUBLIC_BRANCH_CONTRACT) {
        if (entry.kind === "public-prefix" && !isPublicRoute(entry.literal, false)) {
          problems.push(`${entry.literal} is declared public-prefix but isPublicRoute() says no`);
        }
        if (entry.kind === "gated-prefix") {
          if (isPublicRoute(entry.literal, false)) {
            problems.push(`${entry.literal} is declared gated-prefix but is public`);
          }
          const deeper = PUBLIC_BRANCH_CONTRACT.some(
            (other) => other.kind === "public-prefix" && other.literal.startsWith(entry.literal),
          );
          if (!deeper) {
            problems.push(
              `${entry.literal} is a dead anchor: no declared public-prefix lives under it`,
            );
          }
        }
        if (entry.kind === "test-mode-prefix") {
          if (isPublicRoute(entry.literal, false)) {
            problems.push(
              `${entry.literal} is declared test-mode-prefix but is public in production`,
            );
          }
          if (!isPublicRoute(entry.literal, true)) {
            problems.push(
              `${entry.literal} is declared test-mode-prefix but is not public in TEST_MODE`,
            );
          }
        }
      }

      expect(problems, problems.join("\n")).toEqual([]);
    });

    it("keeps the token namespace closed except the declared validation flow", () => {
      // Regression: /api/token/<anything> was public while the middleware used a deny-list.
      for (const path of [
        "/api/token/some-token-id",
        "/api/token/list",
        "/api/token/batch",
        "/api/token/create-token",
        "/api/token/resolve",
        "/api/token/validate-token-list/abc",
      ]) {
        expect(isPublicRoute(path, false), `${path} must not be public`).toBe(false);
      }
      expect(isPublicRoute("/api/token/validate-token/some-token-value", false)).toBe(true);
      // Same guarantee for the versioned alias the dispatcher strips.
      expect(isPublicRoute("/api/v1/token/some-token-id", false)).toBe(false);
    });

    it("PUBLIC_ROUTES (docs surface) claims no undeclared /api path", () => {
      const claimedApiPaths = PUBLIC_ROUTES.filter((path) => path.startsWith("/api/"));
      expect(claimedApiPaths.length).toBeGreaterThan(20); // self-check: the export is populated

      const undeclared = claimedApiPaths.filter(
        (path) => declaredPublicCoverage(path) === null && !(path in PUBLIC_ROUTES_UMBRELLA),
      );
      expect(
        undeclared,
        `PUBLIC_ROUTES must not claim /api paths outside PUBLIC_ROUTE_CONTRACT:\n${undeclared.join("\n")}`,
      ).toEqual([]);

      const wronglyPublic = Object.keys(PUBLIC_ROUTES_UMBRELLA).filter((path) =>
        isPublicRoute(path, false),
      );
      expect(
        wronglyPublic,
        `Umbrella entries document public sub-paths; they must not be public themselves:\n${wronglyPublic.join("\n")}`,
      ).toEqual([]);
    });
  });

  describe("bootstrap route allowlist (isBootstrapRoute)", () => {
    it("declares every /api/... literal inside isBootstrapRoute()", () => {
      const parsed = functionLiterals(readSource(HOOK_UTILS_FILE), "isBootstrapRoute", "/api/");
      expect(parsed.length).toBeGreaterThanOrEqual(5); // self-check: parser found the prefixes

      const declared = BOOTSTRAP_CONTRACT.map((entry) => entry.literal);
      reportDrift(
        "isBootstrapRoute() gained an /api/... prefix that is not declared in BOOTSTRAP_CONTRACT.",
        parsed.filter((literal) => !declared.includes(literal)),
        declared.filter((literal) => !parsed.includes(literal)),
      );
    });

    it("every declared bootstrap literal behaves as declared", () => {
      const problems: string[] = [];
      for (const entry of BOOTSTRAP_CONTRACT) {
        const actual = isBootstrapRoute(entry.literal);
        if (entry.kind === "bootstrap-prefix" && !actual) {
          problems.push(
            `${entry.literal} declared bootstrap-prefix but isBootstrapRoute() says no`,
          );
        }
        if (entry.kind === "api-guard" && actual) {
          problems.push(`${entry.literal} is a negation guard but was classified bootstrap`);
        }
      }
      expect(problems, problems.join("\n")).toEqual([]);
    });

    it("treats namespace roots as bootstrap exactly when declared", () => {
      const declaredPrefixes = BOOTSTRAP_CONTRACT.filter(
        (entry) => entry.kind === "bootstrap-prefix",
      ).map((entry) => entry.literal);
      const unexpected: string[] = [];

      for (const namespace of API_NAMESPACES) {
        const root = `/api/${namespace}`;
        const covered = declaredPrefixes.some((literal) => root.startsWith(literal));
        const actual = isBootstrapRoute(root);
        if (actual !== covered) {
          unexpected.push(`${root} → bootstrap=${actual}, declared=${covered}`);
        }
      }

      expect(
        unexpected,
        `Namespace roots must be bootstrap exactly when BOOTSTRAP_CONTRACT declares them (bootstrap ` +
          `skips the auth middleware while setup is incomplete):\n${unexpected.join("\n")}`,
      ).toEqual([]);
    });

    it("declares the /api/system* prefix over-match and keeps the dispatcher gate on them", () => {
      const declaredPrefixes = BOOTSTRAP_CONTRACT.filter(
        (entry) => entry.kind === "bootstrap-prefix",
      ).map((entry) => entry.literal);

      // Derived from source + inventory: roots matched only by a LONGER declared literal.
      const overMatched = API_NAMESPACES.filter((namespace) => {
        const root = `/api/${namespace}`;
        return declaredPrefixes.some((literal) => root.startsWith(literal) && root !== literal);
      });

      expect(
        overMatched.sort(),
        `New namespace roots inherit bootstrap status through a raw prefix match. Declare them in ` +
          `BOOTSTRAP_PREFIX_OVERMATCHES (or tighten the isBootstrapRoute prefix), then re-run.`,
      ).toEqual(Object.keys(BOOTSTRAP_PREFIX_OVERMATCHES).sort());

      // Over-match is a middleware classification only: the dispatcher gate must still deny.
      const allowed: string[] = [];
      for (const namespace of overMatched) {
        if (
          _checkEndpointPermission(noPermissionUser, noPermissionRoles, "POST", namespace, [
            namespace,
          ])
        ) {
          allowed.push(`POST /api/${namespace}`);
        }
      }
      expect(
        allowed,
        `Bootstrap over-match must not open the dispatcher gate:\n${allowed.join("\n")}`,
      ).toEqual([]);
    });

    it("keeps the setup/bootstrap regressions closed", () => {
      // First-install surface stays bootstrap; configured-instance surfaces do not.
      expect(isBootstrapRoute("/api/setup/complete")).toBe(true);
      expect(isBootstrapRoute("/api/setup/seed-db")).toBe(true);
      for (const path of [
        "/api/collections",
        "/api/media",
        "/api/user",
        "/api/permission",
        "/api/api-keys",
        "/api/webhooks",
        "/api/database",
        "/api/logs",
        "/api/backups",
        "/api/config",
        "/api/migrations",
        "/api/graphql",
        "/api/security",
        "/api/plugin-settings",
      ]) {
        expect(isBootstrapRoute(path), `${path} must not be a bootstrap route`).toBe(false);
      }
    });
  });
});
