/**
 * @file src/hooks/route-table.ts
 * @description O(1) compiled route-to-policy lookup table for SveltyCMS request handling.
 *
 * Features:
 * - Static exact-match Map for O(1) hot-path lookups
 * - First-segment bucketed prefix table for O(1) average prefix matching
 * - Default fail-closed/safe policies for API, GraphQL, media, setup, and admin pages
 */

import { Policy, type PolicyMask } from "./policy";

export interface RoutePolicyEntry {
  readonly id: string;
  readonly pattern: string;
  readonly kind: "exact" | "prefix";
  readonly readPolicy: PolicyMask;
  readonly writePolicy: PolicyMask;
}

export interface ResolvedRoutePolicy {
  readonly policy: PolicyMask;
  readonly routeId: string;
}

interface CompiledRouteEntry {
  readonly entry: RoutePolicyEntry;
  readonly readResult: ResolvedRoutePolicy;
  readonly writeResult: ResolvedRoutePolicy;
}

export interface CompiledRouteTable {
  readonly exact: ReadonlyMap<string, CompiledRouteEntry>;
  readonly prefixBuckets: ReadonlyMap<string, readonly CompiledRouteEntry[]>;
  readonly apiBucket: readonly CompiledRouteEntry[] | undefined;
  readonly collectionsEntry: CompiledRouteEntry | undefined;
  readonly fallback: CompiledRouteEntry;
}

const API_READ_POLICY: PolicyMask =
  Policy.AUTH_COOKIE | Policy.AUTH_TOKEN | Policy.READ_LIMIT | Policy.TENANT_SCOPE;

const API_WRITE_POLICY: PolicyMask =
  Policy.AUTH_COOKIE |
  Policy.AUTH_TOKEN |
  Policy.CSRF |
  Policy.WRITE_LIMIT |
  Policy.TENANT_SCOPE |
  Policy.AUDIT_ASYNC;

const ADMIN_PAGE_READ_POLICY: PolicyMask =
  Policy.AUTH_COOKIE | Policy.READ_LIMIT | Policy.TENANT_SCOPE;

const ADMIN_PAGE_WRITE_POLICY: PolicyMask =
  Policy.AUTH_COOKIE | Policy.CSRF | Policy.WRITE_LIMIT | Policy.TENANT_SCOPE | Policy.AUDIT_ASYNC;

const PUBLIC_READ_POLICY: PolicyMask = Policy.STRIP_COOKIES | Policy.READ_LIMIT;
const PUBLIC_WRITE_POLICY: PolicyMask = Policy.STRIP_COOKIES | Policy.WRITE_LIMIT;

const AUTH_PUBLIC_POLICY: PolicyMask = Policy.READ_LIMIT;
const AUTH_MUTATION_POLICY: PolicyMask = Policy.WRITE_LIMIT | Policy.AUDIT_SYNC;

const DEFAULT_ROUTE_ENTRIES: readonly RoutePolicyEntry[] = [
  // Health & static probes (public, cookie-stripped)
  {
    id: "api:health",
    pattern: "/api/health",
    kind: "exact",
    readPolicy: PUBLIC_READ_POLICY,
    writePolicy: PUBLIC_WRITE_POLICY,
  },
  {
    id: "api:ping",
    pattern: "/api/ping",
    kind: "exact",
    readPolicy: PUBLIC_READ_POLICY,
    writePolicy: PUBLIC_WRITE_POLICY,
  },
  // Auth endpoints
  {
    id: "api:auth",
    pattern: "/api/auth/",
    kind: "prefix",
    readPolicy: AUTH_PUBLIC_POLICY,
    writePolicy: AUTH_MUTATION_POLICY,
  },
  {
    id: "api:login",
    pattern: "/api/login",
    kind: "exact",
    readPolicy: AUTH_PUBLIC_POLICY,
    writePolicy: AUTH_MUTATION_POLICY,
  },
  {
    id: "api:logout",
    pattern: "/api/logout",
    kind: "exact",
    readPolicy: Policy.AUTH_COOKIE | Policy.READ_LIMIT,
    writePolicy: Policy.AUTH_COOKIE | Policy.CSRF | Policy.WRITE_LIMIT | Policy.AUDIT_SYNC,
  },
  // Setup & testing
  {
    id: "api:setup",
    pattern: "/api/setup",
    kind: "prefix",
    readPolicy: Policy.READ_LIMIT,
    writePolicy: Policy.WRITE_LIMIT | Policy.AUDIT_SYNC,
  },
  {
    id: "api:testing",
    pattern: "/api/testing",
    kind: "prefix",
    readPolicy: Policy.STRIP_COOKIES,
    writePolicy: Policy.STRIP_COOKIES,
  },
  // GraphQL
  {
    id: "api:graphql",
    pattern: "/api/graphql",
    kind: "prefix",
    readPolicy: API_READ_POLICY,
    writePolicy: API_WRITE_POLICY,
  },
  // Collections & content API
  {
    id: "api:collections",
    pattern: "/api/collections/",
    kind: "prefix",
    readPolicy: API_READ_POLICY,
    writePolicy: API_WRITE_POLICY,
  },
  {
    id: "api:content-structure",
    pattern: "/api/content-structure",
    kind: "prefix",
    readPolicy: API_READ_POLICY,
    writePolicy: API_WRITE_POLICY,
  },
  // Media
  {
    id: "api:media",
    pattern: "/api/media",
    kind: "prefix",
    readPolicy: API_READ_POLICY,
    writePolicy: API_WRITE_POLICY,
  },
  // System & admin APIs (sync audit on mutations)
  {
    id: "api:system",
    pattern: "/api/system",
    kind: "prefix",
    readPolicy: Policy.AUTH_COOKIE | Policy.READ_LIMIT | Policy.TENANT_SCOPE,
    writePolicy:
      Policy.AUTH_COOKIE |
      Policy.CSRF |
      Policy.WRITE_LIMIT |
      Policy.TENANT_SCOPE |
      Policy.AUDIT_SYNC,
  },
  {
    id: "api:user",
    pattern: "/api/user",
    kind: "prefix",
    readPolicy: API_READ_POLICY,
    writePolicy:
      Policy.AUTH_COOKIE |
      Policy.AUTH_TOKEN |
      Policy.CSRF |
      Policy.WRITE_LIMIT |
      Policy.TENANT_SCOPE |
      Policy.AUDIT_SYNC,
  },
  // Catch-all API prefix
  {
    id: "api:default",
    pattern: "/api/",
    kind: "prefix",
    readPolicy: API_READ_POLICY,
    writePolicy: API_WRITE_POLICY,
  },
  // Public pages
  {
    id: "page:login",
    pattern: "/login",
    kind: "prefix",
    readPolicy: AUTH_PUBLIC_POLICY,
    writePolicy: AUTH_MUTATION_POLICY,
  },
  {
    id: "page:setup",
    pattern: "/setup",
    kind: "prefix",
    readPolicy: Policy.READ_LIMIT,
    writePolicy: Policy.WRITE_LIMIT,
  },
];

const FALLBACK_ENTRY: RoutePolicyEntry = {
  id: "page:app",
  pattern: "/",
  kind: "prefix",
  readPolicy: ADMIN_PAGE_READ_POLICY,
  writePolicy: ADMIN_PAGE_WRITE_POLICY,
};

function firstSegment(pathname: string): string {
  const idx = pathname.indexOf("/", 1);
  return idx === -1 ? pathname : pathname.slice(0, idx);
}

function compileEntry(entry: RoutePolicyEntry): CompiledRouteEntry {
  return {
    entry,
    readResult: Object.freeze({ policy: entry.readPolicy, routeId: entry.id }),
    writeResult: Object.freeze({ policy: entry.writePolicy, routeId: entry.id }),
  };
}

/**
 * Compiles route policy entries into O(1) exact and first-segment prefix lookup tables.
 */
export function compileRouteTable(
  entries: readonly RoutePolicyEntry[] = DEFAULT_ROUTE_ENTRIES,
): CompiledRouteTable {
  const exact = new Map<string, CompiledRouteEntry>();
  const prefixBuckets = new Map<string, CompiledRouteEntry[]>();

  for (const entry of entries) {
    const compiled = compileEntry(entry);
    if (entry.kind === "exact") {
      exact.set(entry.pattern, compiled);
      continue;
    }
    const seg = firstSegment(entry.pattern);
    let bucket = prefixBuckets.get(seg);
    if (!bucket) {
      bucket = [];
      prefixBuckets.set(seg, bucket);
    }
    bucket.push(compiled);
  }

  // Sort each bucket longest-pattern-first for deterministic most-specific matching
  for (const bucket of prefixBuckets.values()) {
    bucket.sort((a, b) => b.entry.pattern.length - a.entry.pattern.length);
  }

  const apiBucket = prefixBuckets.get("/api");
  const collectionsEntry = apiBucket?.find((c) => c.entry.pattern === "/api/collections/");

  return {
    exact,
    prefixBuckets,
    apiBucket,
    collectionsEntry,
    fallback: compileEntry(FALLBACK_ENTRY),
  };
}

const DEFAULT_TABLE = compileRouteTable();

/**
 * Resolves the policy bitmask for a given pathname and HTTP method in O(1) average time
 * with zero per-request object or substring allocations on hot `/api/*` paths.
 */
export function resolveRoutePolicy(
  pathname: string,
  method: string,
  table: CompiledRouteTable = DEFAULT_TABLE,
): ResolvedRoutePolicy {
  const isRead = method === "GET" || method === "HEAD" || method === "OPTIONS";

  // Hot-path fast bypass for `/api/collections/*`: skips exact Map hash + bucket scan.
  if (
    table.collectionsEntry !== undefined &&
    pathname.length > 17 &&
    pathname.charCodeAt(1) === 97 &&
    pathname.charCodeAt(5) === 99 &&
    pathname.startsWith("/api/collections/")
  ) {
    return isRead ? table.collectionsEntry.readResult : table.collectionsEntry.writeResult;
  }

  const exactHit = table.exact.get(pathname);
  if (exactHit) {
    return isRead ? exactHit.readResult : exactHit.writeResult;
  }

  // Hot-path fast lookup for `/api/*`: skips `firstSegment` slice + Map hash.
  const bucket =
    pathname.length >= 5 &&
    pathname.charCodeAt(1) === 97 &&
    pathname.charCodeAt(2) === 112 &&
    pathname.charCodeAt(3) === 105 &&
    pathname.charCodeAt(4) === 47
      ? table.apiBucket
      : table.prefixBuckets.get(firstSegment(pathname));

  if (bucket) {
    for (let i = 0; i < bucket.length; i++) {
      const compiled = bucket[i];
      if (pathname.startsWith(compiled.entry.pattern)) {
        return isRead ? compiled.readResult : compiled.writeResult;
      }
    }
  }

  return isRead ? table.fallback.readResult : table.fallback.writeResult;
}
