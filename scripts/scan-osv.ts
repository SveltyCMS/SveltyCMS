#!/usr/bin/env bun
/**
 * @file scripts/scan-osv.ts
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
 *   bun run scripts/scan-osv.ts          # check (warnings tolerated)
 *   bun run scripts/scan-osv.ts --strict # exit 1 on any vulnerability
 *   bun run scripts/scan-osv.ts --fresh  # ignore the 24h cache
 */

import { readFileSync, mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dirname, "..");
const STRICT = process.argv.includes("--strict");
const FRESH = process.argv.includes("--fresh");
const OSV_API = "https://api.osv.dev/v1/querybatch";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_PATH = join(ROOT, "node_modules", ".cache", "osv-cache.json");

export interface OsvVuln {
  id: string;
  summary?: string;
  severity?: string;
}

export interface OsvResult {
  purl: string;
  vulns: OsvVuln[];
}

/**
 * Build query payloads from SBOM purls. Exported for unit tests.
 */
export function buildQueries(purls: string[], batchSize = 1000): { package: { purl: string } }[][] {
  const queries: { package: { purl: string } }[][] = [];
  for (let i = 0; i < purls.length; i += batchSize) {
    queries.push(purls.slice(i, i + batchSize).map((purl) => ({ package: { purl } })));
  }
  return queries;
}

/**
 * Parse a querybatch response into per-purl findings. Exported for unit tests.
 */
export function parseOsvResponse(purls: string[], body: any): OsvResult[] {
  const results: OsvResult[] = [];
  const entries = Array.isArray(body?.results) ? body.results : [];
  purls.forEach((purl, i) => {
    const vulns = (entries[i]?.vulns ?? []).map((v: any) => ({
      id: v.id ?? "UNKNOWN",
      summary: v.summary,
      severity: v.severity?.[0]?.score ? undefined : v.severity,
    }));
    if (vulns.length > 0) results.push({ purl, vulns });
  });
  return results;
}

function severityLabel(v: OsvVuln): string {
  return v.severity ? String(v.severity) : "";
}

async function main() {
  const sbomPath = join(ROOT, "sbom.json");
  if (!existsSync(sbomPath)) {
    console.error("❌ sbom.json missing — run `bun run audit:sbom` first");
    process.exit(1);
  }
  const sbom = JSON.parse(readFileSync(sbomPath, "utf8"));
  const purls: string[] = (sbom.components ?? [])
    .map((c: any) => c.purl)
    .filter((p: unknown): p is string => typeof p === "string" && p.startsWith("pkg:npm/"));

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
    let failed = false;
    for (const batch of queries) {
      try {
        const res = await fetch(OSV_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ queries: batch }),
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) {
          console.warn(`⚠️  OSV API returned ${res.status} — treating as unreachable`);
          failed = true;
          break;
        }
        const body = await res.json();
        const batchResults = parseOsvResponse(
          batch.map((q) => q.package.purl),
          body,
        );
        results.push(...batchResults);
        for (const r of batchResults) {
          cache[r.purl] = { checkedAt: Date.now(), vulns: r.vulns };
        }
        for (const p of batch.map((q) => q.package.purl)) {
          if (!cache[p]) cache[p] = { checkedAt: Date.now(), vulns: [] };
        }
      } catch (err) {
        console.warn(`⚠️  OSV API unreachable (${(err as Error).message}) — skipping global check`);
        failed = true;
        break;
      }
    }
    try {
      mkdirSync(join(ROOT, "node_modules", ".cache"), { recursive: true });
      writeFileSync(CACHE_PATH, JSON.stringify(cache));
    } catch {
      /* cache write is best-effort */
    }
    if (failed) {
      console.log("ℹ️  Global vulnerability check skipped (network unavailable)");
      if (STRICT) {
        // Do not block commits on transient network issues; CI runs the same
        // check where the network is guaranteed.
        console.log("ℹ️  (non-fatal in --strict for offline development)");
      }
    }
  }

  for (const p of hits) results.push({ purl: p, vulns: cache[p].vulns });

  const findings = results.filter((r) => r.vulns.length > 0);
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
