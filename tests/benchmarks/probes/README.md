# Benchmark probes

Manual diagnostics — **not** part of CI, the benchmark matrix, or any gate.
They answer one measurement question each, print a table, and exit.

## Why they are not in the matrix

The matrix auto-discovers `tests/benchmarks/*.test.ts` **non-recursively**
(`scripts/benchmark-matrix/index.ts`), so nothing under `probes/` is ever
scheduled. Several probes would also be meaningless or destructive in a shared
run: they seed hundreds of thousands of rows, need `SVELTY_SRV_SPLIT=1` /
`SVELTY_SRV_DUR=1` on the server, or expect a dedicated production-mode server.
The top-level `SKIP_IN_MATRIX` set covers the in-tree equivalents by name.

None of these files call `exportResult()` / `writeHistoryArchive()`, so a probe
run never writes `history.sqlite` rows or MDX ledger numbers.

## Running one

```bash
DB_TYPE=sqlite bun test tests/benchmarks/probes/<file>.test.ts --timeout 600000
```

Prerequisites:

- Standalone mode (`setupBenchmarkServer`) spawns the compiled adapter server
  (`node index.cjs`), so a `COMPILE_ALL_ADAPTERS=true bun run build` must already
  exist. Set `API_BASE_URL` to reuse an already-running benchmark server instead
  (the shared-server path documented in `probe-list-compression-ab`).
- A seeded `config/test-database/<DB_NAME>.sqlite` (`DB_NAME` defaults to
  `benchmark_shared` for SQLite). The `x-srv-split` probes additionally need
  `SVELTY_SRV_SPLIT=1 SVELTY_SRV_DUR=1`; they set it on `process.env` themselves
  where they can.
- Server-scale probes (`probe-relationship-scale`, `probe-scale-limits`) expect
  the large bench-db Postgres; `DB_TYPE=sqlite` is only meaningful for the
  splits/attribution probes.

## What each probe answers

| Probe                               | Question it answers                                                                                                                                                             | Model / knobs                                                                                                                                                                                                                     |
| :---------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `probe-cache-tiers.test.ts`         | How much does each cache tier (point-read FIFO, list tier, L1 `cacheService`, GraphQL response/schema) actually hold and hit, measured over HTTP instead of inferred from code? | Standalone production-mode server; `PROBE_SEED`, `PROBE_POINT`, `PROBE_LIST`, `PROBE_L1`, `PROBE_GQL`; reads `/api/dashboard/cache-metrics`, `/api/system/health?verbose=true`, `/api/dashboard/metrics?detailed=true`, `X-Cache` |
| `probe-list-compression-ab.test.ts` | How much of a ~310 KB collection-list MISS is compression, separated from the row build? `Accept-Encoding: zstd` vs `identity` at c=1/2/4/8.                                    | `x-srv-split` marks on a true MISS per request (unique `probe=` key); `SVELTY_SRV_SPLIT=1`, `SVELTY_SRV_DUR=1`                                                                                                                    |
| `probe-list-wire-ab.test.ts`        | Is engine-side JSON aggregation (`jsonb_agg` on Postgres / `json_group_array` on SQLite) faster than `crud.findMany` + JS hydration + `JSON.stringify`?                         | 500 rows, 3 alternating pairs, 20 warm-up + 100 iterations, page size 50, control lanes for host drift                                                                                                                            |
| `probe-point-read-split.test.ts`    | Where does a cold point read spend its time — cache lookup, `findById`, body build, response-cache write, or serve?                                                             | Hot (cached) vs cold (unique id → guaranteed MISS); phases from `x-srv-split`; `PROBE_N`, `PROBE_SEED`                                                                                                                            |
| `probe-query-builder-ab.test.ts`    | Does the shared query builder's `compile()` + `executeCompiled()` path beat rebuilding a Drizzle dynamic AST per call?                                                          | Three lane groups (equality/order/limit, operators, controls); PK `findOne` + `crud.update` controls cancel host drift                                                                                                            |
| `probe-relationship-scale.test.ts`  | What do populated lists and filter+sort cost at 500k related docs / 1.1M sortable rows?                                                                                         | Seeds 2k authors + 500k posts on Postgres; forced-MISS via varying offset; `SCALE_POSTS`, `SCALE_AUTHORS`, `SCALE_ITERS`, `SCALE_SKIP_SORT`                                                                                       |
| `probe-scale-limits.test.ts`        | What is the real ceiling at 1M+ rows with stock indexes — which workload classes still hold their documented budget?                                                            | bench-db Postgres (1.5M posts, 1.12M `BenchmarkStable`), no DB tweaks; fails loud when a lane exceeds its expectation                                                                                                             |
| `probe-write-attrib.test.ts`        | Is an update's cost client-side/transport or server-side? Same payload three ways: in-process `crud.update` at c=1/c=8 vs HTTP PATCH.                                           | Reports client wall, `x-srv-dur`, and the lane's `dbwrite` phase; `SVELTY_FAST_LANE_WRITE=1` A/B; `ATTRIB_ITERS`                                                                                                                  |
| `probe-write-split.test.ts`         | Where does a write go — security, parse, schema, prep, encrypt, dbwrite, postwrite, persist, serve — and what does a cold session (first request after login) cost?             | Phases from `x-srv-split` + `x-srv-dur` at 8c; `SPLIT_ITERS`                                                                                                                                                                      |

## Reading the output

Probes print their verdict as a table; there is no pass/fail contract except in
`probe-scale-limits`, which fails when a measured lane exceeds the expectation
documented in its header. Treat a probe result as evidence for a decision, not
as a regression signal — copy the finding into the relevant ledger or
`docs/project/achievements-2026.mdx` when it changes the published numbers.
