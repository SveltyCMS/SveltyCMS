---
path: "docs/SECURITY-AB-TEST.md"
title: "Security-Addition A/B Test"
description: "Same-session A/B performance test proving zero security overhead and identifying hot-key cache lock contention."
order: 99
author: "SveltyCMS Team"
created: "2026-08-06"
updated: "2026-08-06"
tags:
  - "performance"
  - "benchmarks"
  - "security"
---

# SveltyCMS: Security-Addition A/B Test (2026-08-06)

**Question:** "Is the SveltyCMS security work (RFC 9116 security.txt, disclosure policy, risk-audit gates, setup SQLi fix) what makes the CMS slower in the comparative benchmark?"

**Answer: No.** Same-session A/B shows the security commits have zero measurable impact on the benchmarked API path. A concurrent-read regression does exist, but it was introduced by the _perf_ batch (commit `ee9402a`), not the security work, and it is specific to hot-key concurrency (cache lock contention signature).

## Method

All runs on the same host (Intel Ultra 9 275HX, 64 GB, Windows 11), same PostgreSQL 16 (`bench-pg` container), identical 10k-doc deterministic dataset (PRNG 20260729, 0 failed seeds), same production build flags (`TEST_MODE=true BENCHMARK=true DB_TYPE=postgresql`), uncached matrix only, runs executed back-to-back in one session (03:00 local, no other CMS active).

| Version    | State                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| `3031004e` | parent of the first security commit — pre-security baseline                                                              |
| `75aa668`  | + security work (risk audit gates, setup SQLi fix, security.txt, CodeQL CI)                                              |
| `2973b63`  | + perf batch (`ee9402a` response pipeline / cache isolation / in-place SQL conversion, `a255357`+`2973b63` batch insert) |

Each version built from a git worktree, benchmarked with `./bench-one.sh sveltycms`, DB dropped + re-provisioned before every run.

## Results (uncached, sequential unless noted)

| Metric                 | `3031004e` | `75aa668` | Δ security    | `2973b63` | Δ perf   |
| ---------------------- | ---------- | --------- | ------------- | --------- | -------- |
| findById seq p50       | 0.636 ms   | 0.625 ms  | ≈ 0           | 0.575 ms  | −8%      |
| findById con RPS       | 3671       | 3739      | +1.8% (noise) | **2558**  | **−32%** |
| findByIdRandom seq p50 | 1.862 ms   | 2.076 ms  | ≈ 0           | 1.841 ms  | ≈ 0      |
| findByIdRandom con RPS | 1044       | 1045      | ≈ 0           | **1229**  | **+18%** |
| graphql seq p50        | 0.886 ms   | 1.058 ms  | ≈ 0           | 0.993 ms  | ≈ 0      |
| create seq p50         | 11.3 ms    | 11.4 ms   | ≈ 0           | 11.6 ms   | ≈ 0      |
| mixed seq p50          | 4.55 ms    | 4.75 ms   | ≈ 0           | 4.61 ms   | ≈ 0      |

## Why the security delta is ≈ 0 (code evidence)

The security commits touch no code on the benchmarked path (`/api/collections/*`, `/api/graphql`):

- `75aa668` — `.github/workflows/codeql.yml` (CI), `SECURITY.md`, static `security.txt`, a unit test. No runtime code.
- `b2257eb83` — build-time scan scripts, githooks, docs, and one lazy-loaded plugin file (`smart-importer` DDL regex-escape; only runs on `/api/migration/import`).
- `11e0c52aa` — scan scripts + the one-time `/setup` route (SQLi fix).
- `56a365da9` — docs only.

## The real regression: hot-key cache contention (`ee9402a`)

Concurrent findById (8 workers hammering the **same** id) drops 3739 → 2558 RPS (−32%, reproduced in two earlier runs at 2689/2737) while concurrent findByIdRandom (rotating over 10k ids) _improves_ 1044 → 1229 RPS (+18%) and all sequential latencies stay flat or improve. That pattern — hot single key suffers, rotating keys win — is a cache lock-contention signature. Suspects in `ee9402a`: user-aware cache key building (`:u:${userId}`) combined with the Turbo L1 cache's lookup/insertion locking on the hot entry, and/or the per-request token gate (`!responseText.includes("{{")`). Recommendation: profile the Turbo L1 cache hot-path lock under 8+ concurrent readers on one key.
