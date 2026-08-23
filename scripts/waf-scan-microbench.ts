/**
 * @file scripts/waf-scan-microbench.ts
 * @description
 * Isolates scanner cost from Request.clone() / async harness frames.
 * Compares the previous regex fan-out to the linear inspect/clean-path.
 */

import {
  inspectRequest,
  isCleanRequestSurface,
  scanPayload,
} from "../src/services/security/threat-scan";

const PATH = "/api/collections/posts";
const QUERY = "limit=10";
const URL = `${PATH}?${QUERY}`;
const ITER = 200_000;

const PATH_TRAVERSAL_REGEX = /(?:(?:\.\.|%2e%2e)(?:\/|\\|%2f|%5c))|(?:(?:^|\/|\\)\.\.(?:$|\/|\\))/i;
const XSS_PATTERNS = [
  /<script\b[^>]*>/i,
  /javascript\s*:/i,
  /data\s*:\s*text\/html/i,
  /on(?:error|load|click|mouse|key|submit)\s*=/i,
  /<iframe\b/i,
  /<embed\b/i,
  /<object\b/i,
];
const SQLI_PATTERNS = [
  /\bunion\s+(?:all\s+)?select\b/i,
  /\bselect\b.+\bfrom\b.+\bwhere\b/i,
  /;\s*drop\s+table\b/i,
  /;\s*delete\s+from\b/i,
  /;\s*update\b.+\bset\b/i,
  /--\s*$/m,
];
const PROTO = [/__proto__/, /constructor\.prototype/, /prototype\.__proto__/];

function oldRegexInspect(url: string, query: string): boolean {
  let decodedUrl = url;
  let decodedQuery = query;
  try {
    decodedUrl = decodeURIComponent(url);
  } catch {
    /* keep */
  }
  try {
    decodedQuery = decodeURIComponent(query);
  } catch {
    /* keep */
  }
  const hay = [url, query, decodedUrl, decodedQuery];
  for (const h of hay) {
    if (PATH_TRAVERSAL_REGEX.test(h)) return true;
  }
  for (const p of PROTO) {
    for (const h of hay) if (p.test(h)) return true;
  }
  for (const p of XSS_PATTERNS) {
    for (const h of hay) if (p.test(h)) return true;
  }
  for (const p of SQLI_PATTERNS) {
    for (const h of hay) if (p.test(h)) return true;
  }
  return false;
}

function time(label: string, fn: () => void): { ns: number; rps: number } {
  fn();
  const t0 = performance.now();
  for (let i = 0; i < ITER; i++) fn();
  const ms = performance.now() - t0;
  const ns = (ms * 1e6) / ITER;
  const rps = (ITER / ms) * 1000;
  console.log(
    `${label.padEnd(36)} ${ns.toFixed(1)} ns/op   ${Math.round(rps).toLocaleString()} ops/s`,
  );
  return { ns, rps };
}

console.log(`iterations=${ITER}  surface=${URL}\n`);
const regex = time("old regex inspect (4× haystacks)", () => {
  oldRegexInspect(PATH, QUERY);
});
const linear = time("linear inspectRequest", () => {
  inspectRequest(PATH, QUERY, {});
});
const clean = time("isCleanRequestSurface path+query", () => {
  isCleanRequestSurface(PATH);
  isCleanRequestSurface(`?${QUERY}`);
});
const payload = time("scanPayload concat URL", () => {
  scanPayload(URL);
});

console.log(
  `\nlinear vs old regex:  ${(regex.ns / linear.ns).toFixed(2)}×  (${(((regex.ns - linear.ns) / regex.ns) * 100).toFixed(0)}% less work)`,
);
console.log(`clean vs old regex:   ${(regex.ns / clean.ns).toFixed(2)}×`);
console.log(`scanPayload vs regex: ${(regex.ns / payload.ns).toFixed(2)}×`);
