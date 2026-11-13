#!/usr/bin/env bun
/**
 * @file scripts/security/scan-osv.ts
 * @description
 * Global vulnerability check against OSV.dev — the aggregator database that
 * merges GitHub Advisory DB (GHSA), NVD, and 20+ other feeds into one API.
 *
 * Queries the OSV batch API with the purls from our CycloneDX SBOM (kept in
 * lockstep by the pre-commit SBOM sync), so one request covers the entire
 * dependency tree — including SvelteKit/Svelte/Vite advisories published via
 * GHSA and anything that only ever landed in NVD.
 *
 * Results are cached per purl@version for 24h (`.osv-cache.json` under
 * node_modules/.cache) so the pre-commit gate stays fast.
 *
 * ### Usage
 *   bun run scripts/security/scan-osv.ts          # check (warnings tolerated)
 *   bun run scripts/security/scan-osv.ts --strict # exit 1 on any vulnerability
 *   bun run scripts/security/scan-osv.ts --fresh  # ignore the 24h cache
 *
 * ### Features:
 * - Batch query of the OSV API from SBOM purls (one request per 1000 packages)
 * - Bounded retries (3 attempts, 300ms/900ms backoff) for transient outages
 * - Response-shape validation before parsing (an error page must not look clean)
 * - Fail-closed on CI / `--strict`: an unreachable API fails the audit instead of
 *   silently passing; offline laptops keep the historical warn-and-continue path
 * - 24h per-purl cache so the pre-commit gate stays fast
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "../..");
const STRICT = process.argv.includes("--strict");
const FRESH = process.argv.includes("--fresh");
const OSV_API = "https://api.osv.dev/v1/querybatch";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_PATH = join(ROOT, "node_modules", ".cache", "osv-cache.json");

/** Total attempts per batch (first try + 2 retries). */
export const OSV_ATTEMPTS = 3;
/** Backoff before retry 2 and retry 3. */
export const OSV_RETRY_DELAYS_MS = [300, 900] as const;

export interface OsvVuln {
  id: string;
  summary?: string;
  severity?: string;
}

export interface OsvResult {
  purl: string;
  vulns: OsvVuln[];
}

export interface OsvQueryBatch {
  package: { purl: string };
}

/**
 * Build query payloads from SBOM purls. Exported for unit tests.
 */
export function buildQueries(purls: string[], batchSize = 1000): OsvQueryBatch[][] {
  const queries: OsvQueryBatch[][] = [];
  for (let i = 0; i < purls.length; i += batchSize) {
    queries.push(purls.slice(i, i + batchSize).map((purl) => ({ package: { purl } })));
  }
  return queries;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** A querybatch response is only usable when it is an object with a `results` array. */
export function isOsvResponse(body: unknown): body is { results: unknown[] } {
  return isRecord(body) && Array.isArray(body.results);
}

/**
 * Parse a querybatch response into per-purl findings. Exported for unit tests.
 *
 * Tolerant by design: a missing/malformed entry degrades to "no findings" for that
 * purl only. Callers must validate the envelope first (`isOsvResponse`) so a
 * transport error page can never be mistaken for a clean dependency tree.
 */
export function parseOsvResponse(purls: string[], body: unknown): OsvResult[] {
  const results: OsvResult[] = [];
  const entries: unknown[] = isOsvResponse(body) ? body.results : [];
  purls.forEach((purl, i) => {
    const entry = entries[i];
    const rawVulns = isRecord(entry) && Array.isArray(entry.vulns) ? entry.vulns : [];
    const vulns: OsvVuln[] = rawVulns.map((raw) => {
      const v = isRecord(raw) ? raw : {};
      return {
        id: typeof v.id === "string" ? v.id : "UNKNOWN",
        summary: typeof v.summary === "string" ? v.summary : undefined,
        severity: typeof v.severity === "string" ? v.severity : undefined,
      };
    });
    if (vulns.length > 0) results.push({ purl, vulns });
  });
  return results;
}

export interface OsvRequestInit {
  method: "POST";
  headers: { "Content-Type": string };
  body: string;
  signal: AbortSignal;
}

/** Narrow transport signature so tests can inject a stub without faking `fetch`. */
export type OsvFetchLike = (url: string, init: OsvRequestInit) => Promise<Response>;

export interface OsvFetchDeps {
  /** Injectable transport (tests stub this — no network in unit runs). */
  fetchImpl?: OsvFetchLike;
  sleep?: (ms: number) => Promise<void>;
  attempts?: number;
}

export interface OsvFetchOutcome {
  ok: boolean;
  /** Parsed, shape-validated body — present only when `ok`. */
  body?: unknown;
  error?: string;
  attempts: number;
}

/**
 * POST one batch with bounded exponential backoff.
 *
 * A 429/timeout/HTML error page is indistinguishable from "no findings" once the
 * body is parsed, so every failure is retried and finally reported — never cached.
 */
export async function fetchOsvBatch(
  queries: OsvQueryBatch[],
  deps: OsvFetchDeps = {},
): Promise<OsvFetchOutcome> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep =
    deps.sleep ??
    ((ms: number) =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
      }));
  const attempts = deps.attempts ?? OSV_ATTEMPTS;
  let lastError = "unknown error";

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetchImpl(OSV_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queries }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) {
        lastError = `OSV API returned ${res.status}`;
      } else {
        const body: unknown = await res.json();
        if (isOsvResponse(body)) return { ok: true, body, attempts: attempt };
        lastError = "OSV API returned a malformed payload (no results array)";
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    const delay = OSV_RETRY_DELAYS_MS[attempt - 1];
    if (attempt < attempts && delay !== undefined) {
      console.warn(
        `⚠️  OSV batch attempt ${attempt}/${attempts} failed (${lastError}) — retrying in ${delay}ms`,
      );
      await sleep(delay);
    }
  }

  return { ok: false, error: lastError, attempts };
}

/**
 * CI and `--strict` must fail closed: a skipped dependency audit is not a pass.
 * Offline developer machines keep the historical warn-and-continue behaviour.
 */
export function shouldFailClosed(
  env: NodeJS.ProcessEnv = process.env,
  strict: boolean = STRICT,
): boolean {
  return strict || env.CI === "true";
}

function severityLabel(v: OsvVuln): string {
  return v.severity ? String(v.severity) : "";
}

/**
 * Known upstream advisories with no upstream patch available yet in the ecosystem.
 * All entries MUST document: package purl, advisory ID, reason, and context.
 */
const KNOWN_EXEMPTIONS: Record<string, string[]> = {
  // deepmerge <= 4.3.1: Prototype pollution in deepmerge (CVE-2026-93753 / GHSA-gcqx-w48m-w2h4).
  // Transitive dependency of @sveltejs/vite-plugin-svelte (build-time Vite plugin only, not runtime code).
  // No patched version released on npm yet.
  "pkg:npm/deepmerge@4.3.1": ["GHSA-gcqx-w48m-w2h4"],
};

async function main() {
  const sbomPath = join(ROOT, "sbom.json");
  if (!existsSync(sbomPath)) {
    console.error("❌ sbom.json missing — run `bun run audit:sbom` first");
    process.exit(1);
  }
  const sbom: unknown = JSON.parse(readFileSync(sbomPath, "utf8"));
  const components = isRecord(sbom) && Array.isArray(sbom.components) ? sbom.components : [];
  const purls: string[] = components
    .map((c) => (isRecord(c) ? c.purl : undefined))
    .filter((p): p is string => typeof p === "string" && p.startsWith("pkg:npm/"));

  if (purls.length === 0) {
    console.error("❌ No npm purls found in sbom.json");
    process.exit(1);
  }

  // Load 24h cache
  let cache: Record<string, { checkedAt: number; vulns: OsvVuln[] }> = {};
  if (existsSync(CACHE_PATH)) {
    try {
      cache = JSON.parse(readFileSync(CACHE_PATH, "utf8"));
    } catch {
      /* corrupt cache — rebuild */
    }
  }

  const fresh = purls.filter(
    (p) => FRESH || !cache[p] || Date.now() - cache[p].checkedAt > CACHE_TTL_MS,
  );
  const hits = purls.filter((p) => !fresh.includes(p));

  const results: OsvResult[] = [];
  if (fresh.length > 0) {
    const queries = buildQueries(fresh);
    let failure: string | null = null;
    for (const batch of queries) {
      const outcome = await fetchOsvBatch(batch);
      if (!outcome.ok) {
        failure = outcome.error ?? "unknown error";
        break;
      }
      const batchResults = parseOsvResponse(
        batch.map((q) => q.package.purl),
        outcome.body,
      );
      results.push(...batchResults);
      for (const r of batchResults) {
        cache[r.purl] = { checkedAt: Date.now(), vulns: r.vulns };
      }
      for (const p of batch.map((q) => q.package.purl)) {
        if (!cache[p]) cache[p] = { checkedAt: Date.now(), vulns: [] };
      }
    }
    try {
      mkdirSync(join(ROOT, "node_modules", ".cache"), { recursive: true });
      writeFileSync(CACHE_PATH, JSON.stringify(cache));
    } catch {
      /* cache write is best-effort */
    }
    if (failure) {
      if (shouldFailClosed()) {
        console.error(`❌ OSV global vulnerability check could not run: ${failure}`);
        console.error(
          "   CI / --strict is fail-closed: an unreachable or rate-limited OSV API means the\n" +
            "   dependency audit did not happen, so the gate must not report success.",
        );
        process.exit(1);
      }
      console.log(`ℹ️  Global vulnerability check skipped (${failure})`);
      console.log("ℹ️  (non-fatal outside CI/--strict — offline development)");
    }
  }

  for (const p of hits) results.push({ purl: p, vulns: cache[p].vulns });

  const findings = results
    .map((r) => ({
      purl: r.purl,
      vulns: r.vulns.filter((v) => {
        const exempt = KNOWN_EXEMPTIONS[r.purl]?.includes(v.id);
        if (exempt) {
          console.log(
            `⚠️  ${r.purl} — ${v.id} (suppressed: dev/build-time only, upstream patch pending)`,
          );
          return false;
        }
        return true;
      }),
    }))
    .filter((r) => r.vulns.length > 0);

  for (const r of findings) {
    for (const v of r.vulns) {
      const sev = severityLabel(v);
      console.log(
        `❌ ${r.purl} — ${v.id}${sev ? ` (${sev})` : ""} — ${v.summary ?? "see advisory"}`,
      );
    }
  }

  console.log(
    `\n${purls.length} packages checked against OSV.dev (${fresh.length} fresh, ${hits.length} cached) — ${findings.length} affected`,
  );
  if (findings.length > 0) {
    console.error("❌ OSV global vulnerability check failed");
    process.exit(1);
  }
  console.log("✅ OSV global vulnerability check passed");
}

if (import.meta.main) main();
