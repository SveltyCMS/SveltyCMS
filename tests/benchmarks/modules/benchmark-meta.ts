/**
 * @file tests/benchmarks/modules/benchmark-meta.ts
 * @description Educational metadata registry for all benchmark tests (Optimized).
 *
 * Uses a single frozen registry structure + registerBulkTestMeta call
 * instead of 50+ individual registerTestMeta() calls, reducing module
 * evaluation overhead and enabling V8 JIT optimization.
 *
 * Covers all benchmark tests across 9 dimensions.
 */
import { registerBulkTestMeta } from "./benchmark-reporting";

const BENCHMARK_META_REGISTRY = Object.freeze({
  "tests/benchmarks/cache-hit-ratio.test.ts": Object.freeze({
    proves: "Redis cache hit/miss ratio and invalidation performance",
    codePaths: Object.freeze([
      "src/databases/cache/redis-adapter.ts",
      "src/databases/cache/cache-service.ts",
    ]),
    impact:
      "Cache efficiency directly impacts response latency. Misses trigger expensive DB round-trips.",
  }),
  "tests/benchmarks/media-upload-stress.test.ts": Object.freeze({
    proves: "Large file upload throughput and streaming efficiency",
    codePaths: Object.freeze(["src/services/MediaService.ts", "src/databases/media/"]),
    impact: "Media upload speed affects content editor productivity and DAM experience.",
  }),

  // ── BASELINE ─────────────────────────────────────────────────────────────
  "tests/benchmarks/api-latency.test.ts": Object.freeze({
    proves: "Base network and HTTP overhead for simple API calls",
    codePaths: Object.freeze(["src/routes/api/[...path]/+server.ts", "src/hooks.server.ts"]),
    impact: "Foundation for all API performance. Degradation here affects every endpoint.",
  }),
  "tests/benchmarks/cold-start-phased.test.ts": Object.freeze({
    proves: "Time to READY state vs WARMED state during system startup",
    codePaths: Object.freeze(["src/hooks/handle-system-state.ts", "src/hooks.server.ts"]),
    impact:
      "Directly impacts deployment speed and self-healing recovery time. Critical for edge/serverless.",
  }),
  "tests/benchmarks/truth-latency.test.ts": Object.freeze({
    proves: "SDK vs Dispatcher vs Real HTTP latency comparison",
    codePaths: Object.freeze([
      "src/services/sdk/local-cms.ts",
      "src/routes/api/[...path]/+server.ts",
    ]),
    impact:
      "Reveals HTTP middleware overhead vs direct SDK calls. Guides optimization of hot paths.",
  }),
  "tests/benchmarks/build-analysis.test.ts": Object.freeze({
    proves: "Production bundle size, chunk count, and build performance",
    codePaths: Object.freeze(["vite.config.ts", "svelte.config.js"]),
    impact: "Large bundles degrade FCP/LCP. Affects CDN costs and user experience.",
  }),
  "tests/benchmarks/dev-dependency-load.test.ts": Object.freeze({
    proves: "Build, sync, and lint toolchain overhead",
    codePaths: Object.freeze(["scripts/quality-gate.ts", "vite.config.ts"]),
    impact: "Slow tooling kills developer productivity. Every second matters in CI/CD.",
  }),

  // ── ADAPTER ──────────────────────────────────────────────────────────────
  "tests/benchmarks/database-performance.test.ts": Object.freeze({
    proves: "Raw database adapter CRUD performance",
    codePaths: Object.freeze([
      "src/databases/<db>/crud-methods.ts",
      "src/databases/<db>/adapter-core.ts",
    ]),
    impact:
      "Adapter bottlenecks cascade to all data operations. Check indexes, connection pools, and query plans.",
  }),
  "tests/benchmarks/transaction-acid.test.ts": Object.freeze({
    proves: "ACID transaction overhead and consistency guarantees",
    codePaths: Object.freeze(["src/databases/<db>/crud-methods.ts"]),
    impact: "Transaction speed affects write-heavy workloads and data integrity.",
  }),

  // ── INTERNALS ────────────────────────────────────────────────────────────
  "tests/benchmarks/content-scan.test.ts": Object.freeze({
    proves: "Self-healing cache scanner performance across compiled collections",
    codePaths: Object.freeze([
      "src/content/collectionScanner.ts",
      "src/databases/cache/cache-service.ts",
    ]),
    impact: "Collection scan runs on every startup. Slow scans delay time-to-ready.",
  }),
  "tests/benchmarks/hooks-performance.test.ts": Object.freeze({
    proves: "Micro-benchmark of individual middleware layers",
    codePaths: Object.freeze(["src/hooks.server.ts", "src/hooks/handle-turbo-pipeline.server.ts"]),
    impact: "Middleware runs on every request. A 1ms regression compounds across all traffic.",
  }),
  "tests/benchmarks/edge-sync.test.ts": Object.freeze({
    proves: "Distributed L1/L2 cache invalidation latency",
    codePaths: Object.freeze(["src/databases/cache/cache-service.ts"]),
    impact: "Multi-region deployments depend on fast cache synchronization.",
  }),
  "tests/benchmarks/telemetry-performance.test.ts": Object.freeze({
    proves: "Telemetry data collection and cryptographic signing overhead",
    codePaths: Object.freeze(["src/services/TelemetryService.ts"]),
    impact: "Telemetry should be invisible. High overhead means lost observability or degraded UX.",
  }),
  "tests/benchmarks/state-machine-transition.test.ts": Object.freeze({
    proves: "System state machine transition latency",
    codePaths: Object.freeze(["src/stores/system/state.ts", "src/hooks/handle-system-state.ts"]),
    impact: "State transitions gate all system readiness. Stuck states block the entire CMS.",
  }),
  "tests/benchmarks/cache-performance.test.ts": Object.freeze({
    proves: "2-layer hybrid cache efficiency across system modules",
    codePaths: Object.freeze([
      "src/databases/cache/cache-service.ts",
      "src/databases/cache/l1-cache.ts",
    ]),
    impact:
      "Cache hit ratio directly determines response latency. Misses trigger expensive DB round-trips.",
  }),
  "tests/benchmarks/cache-service.test.ts": Object.freeze({
    proves: "CacheService L1 hit latency and pattern invalidation under noise",
    codePaths: Object.freeze(["src/databases/cache/cache-service.ts"]),
    impact:
      "L1 cache is the fastest retrieval path. Degradation here affects every cached operation.",
  }),
  "tests/benchmarks/local-api-performance.test.ts": Object.freeze({
    proves: "LocalCMS SDK overhead vs direct adapter calls",
    codePaths: Object.freeze(["src/services/sdk/local-cms.ts", "src/services/sdk/namespaces/*.ts"]),
    impact:
      "Zero-tax SDK is a core performance promise. Overhead here defeats the purpose of server-side calls.",
  }),
  "tests/benchmarks/setup-proxy.test.ts": Object.freeze({
    proves: "Setup proxy isolation and bootstrap security gating",
    codePaths: Object.freeze([
      "src/hooks/handle-system-state.ts",
      "src/routes/setup/+page.server.ts",
    ]),
    impact:
      "Setup security gates protect against re-initialization attacks. Must be fast AND secure.",
  }),

  // ── LOGIC ────────────────────────────────────────────────────────────────
  "tests/benchmarks/ai-performance.test.ts": Object.freeze({
    proves: "AI enrichment and layout generation overhead",
    codePaths: Object.freeze(["src/services/AIService.ts"]),
    impact: "AI features must not block the request pipeline. Async processing is critical.",
  }),
  "tests/benchmarks/temporal-integrity.test.ts": Object.freeze({
    proves: "Timezone normalization and deterministic UTC persistence",
    codePaths: Object.freeze(["src/utils/date-utils.ts", "src/databases/core/base-sql-adapter.ts"]),
    impact: "Date corruption causes data integrity issues across tenants and timezones.",
  }),
  "tests/benchmarks/widget-performance.test.ts": Object.freeze({
    proves: "Server-side processing cost of built-in widgets",
    codePaths: Object.freeze(["src/widgets/*/index.ts", "src/widgets/widget-factory.ts"]),
    impact: "Widgets compose the content editing experience. Heavy widgets slow every form render.",
  }),
  "tests/benchmarks/admin-ux-vitality.test.ts": Object.freeze({
    proves: "Svelte 5 logic overhead for complex multi-widget forms",
    codePaths: Object.freeze(["src/components/*.svelte", "src/routes/(app)/config/collections/"]),
    impact:
      "Admin UX is the primary user interface. Sluggish forms hurt content editor productivity.",
  }),
  "tests/benchmarks/media-performance.test.ts": Object.freeze({
    proves: "Image resizing, SHA-256 hashing, and metadata extraction",
    codePaths: Object.freeze(["src/services/MediaService.ts", "src/databases/media/"]),
    impact:
      "Media processing is CPU-intensive. Bottlenecks block uploads and degrade DAM experience.",
  }),
  "tests/benchmarks/relational-performance.test.ts": Object.freeze({
    proves: "JOINs, population strategies, and deeply nested relationships",
    codePaths: Object.freeze([
      "src/databases/<db>/relational-utils.ts",
      "src/content/relation-service.ts",
    ]),
    impact: "Relational queries are the most expensive DB operations. N+1 problems hide here.",
  }),

  // ── API ──────────────────────────────────────────────────────────────────
  "tests/benchmarks/openapi-performance.test.ts": Object.freeze({
    proves: "Dynamic OpenAPI 3.1.0 spec generation and caching",
    codePaths: Object.freeze(["src/services/OpenAPIService.ts"]),
    impact: "Slow spec generation blocks SDK generation and API documentation tooling.",
  }),
  "tests/benchmarks/auth-performance.test.ts": Object.freeze({
    proves: "JWT verification, session retrieval, and permission matrix resolution",
    codePaths: Object.freeze([
      "src/hooks/handle-authentication.ts",
      "src/databases/auth/session-service.ts",
      "src/services/sdk/namespaces/auth-namespace.ts",
    ]),
    impact:
      "Auth runs on every authenticated request. A 10ms degradation compounds across all API traffic.",
  }),
  "tests/benchmarks/security-audit.test.ts": Object.freeze({
    proves: "Fail-closed dispatcher, payload scanning, and SHA-256 audit chaining overhead",
    codePaths: Object.freeze([
      "src/routes/api/[...path]/+server.ts",
      "src/services/AuditLogService.ts",
    ]),
    impact: "Security must not come at the cost of performance. Balance hardening with speed.",
  }),
  "tests/benchmarks/rest-api-performance.test.ts": Object.freeze({
    proves: "End-to-end REST dispatcher throughput and latency",
    codePaths: Object.freeze(["src/routes/api/[...path]/+server.ts", "src/hooks.server.ts"]),
    impact:
      "REST is the primary API surface. Degradation affects all integrations and SDK consumers.",
  }),
  "tests/benchmarks/graphql-api-performance.test.ts": Object.freeze({
    proves: "GraphQL resolver execution time and throughput",
    codePaths: Object.freeze([
      "src/routes/api/graphql/+server.ts",
      "src/routes/api/graphql/resolvers/",
    ]),
    impact: "GraphQL resolvers can trigger cascading DB queries. N+1 patterns are common here.",
  }),
  "tests/benchmarks/seo-performance.test.ts": Object.freeze({
    proves: "Redirect middleware, 404 logging, and sitemap caching",
    codePaths: Object.freeze(["src/services/SEOService.ts", "src/hooks/handle-seo.ts"]),
    impact: "SEO features impact every page request. Slow redirects hurt Time-to-First-Byte.",
  }),
  "tests/benchmarks/websocket-broadcast.test.ts": Object.freeze({
    proves: "Network-layer broadcast latency (SSE vs WebSocket)",
    codePaths: Object.freeze(["src/services/RealtimeService.ts"]),
    impact:
      "Realtime features are latency-sensitive. Broadcast delays break collaborative editing.",
  }),
  "tests/benchmarks/realtime-performance.test.ts": Object.freeze({
    proves: "WebSocket connection and broadcast latency",
    codePaths: Object.freeze(["src/services/RealtimeService.ts", "src/hooks/handle-websocket.ts"]),
    impact:
      "WebSocket overhead affects all realtime features including live preview and collaboration.",
  }),

  // ── SCALE ────────────────────────────────────────────────────────────────
  "tests/benchmarks/negative-cache.test.ts": Object.freeze({
    proves: "404-miss response times and cache lookup speedup",
    codePaths: Object.freeze(["src/databases/cache/negative-cache.ts"]),
    impact:
      "Negative caching provides 2392x speedup for repeated misses. Degradation means unnecessary DB lookups.",
  }),
  "tests/benchmarks/revision-stress.test.ts": Object.freeze({
    proves: "Performance degradation as document history grows to 100+ versions",
    codePaths: Object.freeze(["src/services/RevisionService.ts"]),
    impact: "Revision growth can silently degrade write performance. Must scale linearly.",
  }),
  "tests/benchmarks/memory-stability.test.ts": Object.freeze({
    proves: "Long-running soak test for memory leaks and GC pressure",
    codePaths: Object.freeze(["src/databases/core/base-adapter.ts", "src/widgets/*/index.ts"]),
    impact:
      "Memory leaks cause OOM crashes in production. Native addon leaks (sharp, argon2) are common.",
  }),
  "tests/benchmarks/multi-tenant-performance.test.ts": Object.freeze({
    proves: "Cross-tenant isolation and security boundary latency",
    codePaths: Object.freeze([
      "src/databases/core/base-adapter.ts",
      "src/hooks/handle-authentication.ts",
    ]),
    impact:
      "Multi-tenancy is a core differentiator. Tenant isolation must not create performance cliffs.",
  }),
  "tests/benchmarks/mixed-workload.test.ts": Object.freeze({
    proves: "Production request mix: 60% Reads, 20% Writes, 15% GraphQL, 5% Media",
    codePaths: Object.freeze([
      "src/routes/api/[...path]/+server.ts",
      "src/databases/<db>/crud-methods.ts",
    ]),
    impact: "Real-world traffic patterns reveal bottlenecks invisible to isolated benchmarks.",
  }),
  "tests/benchmarks/graphql-stress.test.ts": Object.freeze({
    proves: "High-concurrency GraphQL query stress test",
    codePaths: Object.freeze([
      "src/routes/api/graphql/+server.ts",
      "src/routes/api/graphql/resolvers/",
    ]),
    impact: "GraphQL under load reveals resolver inefficiencies and connection pool exhaustion.",
  }),
  "tests/benchmarks/migration-scale.test.ts": Object.freeze({
    proves: "System ingestion limits with 10,000+ entries",
    codePaths: Object.freeze([
      "src/databases/<db>/migrations.ts",
      "src/content/migration-service.ts",
    ]),
    impact:
      "Bulk data operations are the most expensive. Pipeline efficiency determines migration feasibility.",
  }),
  "tests/benchmarks/index-pressure.test.ts": Object.freeze({
    proves: "Complex filtering and sorting on 100,000+ entry collections",
    codePaths: Object.freeze([
      "src/databases/<db>/crud-methods.ts",
      "src/databases/<db>/schema.ts",
    ]),
    impact: "Index pressure reveals query plan issues. Missing indexes cause full table scans.",
  }),
  "tests/benchmarks/content-scale-stress.test.ts": Object.freeze({
    proves: "Content scan performance on 1,000+ collections across 5 nested levels",
    codePaths: Object.freeze([
      "src/content/collectionScanner.ts",
      "src/databases/cache/cache-service.ts",
    ]),
    impact: "Collection count scales with tenant usage. Scanning must remain sub-linear at scale.",
  }),
  "tests/benchmarks/client-journey.test.ts": Object.freeze({
    proves: "Login → List → View → Edit → Save → Realtime cumulative latency",
    codePaths: Object.freeze([
      "src/hooks/handle-authentication.ts",
      "src/routes/api/[...path]/+server.ts",
    ]),
    impact:
      "End-to-end journey latency is what users actually feel. Individual benchmarks don't capture this.",
  }),
  "tests/benchmarks/concurrency-race.test.ts": Object.freeze({
    proves: "Atomic consistency and lost-update protection under concurrency",
    codePaths: Object.freeze(["src/databases/<db>/crud-methods.ts"]),
    impact: "Race conditions cause data corruption. Concurrency control must be fast AND correct.",
  }),
  "tests/benchmarks/failure-propagation.test.ts": Object.freeze({
    proves: "System overhead when downstream dependencies fail or timeout",
    codePaths: Object.freeze(["src/hooks.server.ts", "src/services/circuit-breaker.ts"]),
    impact: "Failure propagation speed determines system resilience. Fast-fail prevents cascade.",
  }),
  "tests/benchmarks/chaos-resilience.test.ts": Object.freeze({
    proves: "CMS availability during simulated database brownouts",
    codePaths: Object.freeze(["src/hooks.server.ts", "src/databases/<db>/adapter-core.ts"]),
    impact:
      "Infrastructure failures are inevitable. The system must degrade gracefully, not crash.",
  }),
  "tests/benchmarks/production-day.test.ts": Object.freeze({
    proves: "24-hour production simulation with mixed workload",
    codePaths: Object.freeze([
      "src/routes/api/[...path]/+server.ts",
      "src/databases/<db>/crud-methods.ts",
      "src/databases/cache/cache-service.ts",
    ]),
    impact: "The ultimate test. Reveals slow memory leaks, cache churn, and connection pool drift.",
  }),

  // ── RESILIENCE ───────────────────────────────────────────────────────────
  "tests/benchmarks/circuit-breaker-failover.test.ts": Object.freeze({
    proves: "Graceful degradation when external services fail",
    codePaths: Object.freeze(["src/services/circuit-breaker.ts", "src/hooks.server.ts"]),
    impact: "Circuit breakers prevent cascading failures. Must trip fast and recover cleanly.",
  }),

  // ── SECURITY ─────────────────────────────────────────────────────────────
  "tests/benchmarks/throttling-backoff-stress.test.ts": Object.freeze({
    proves: "Rate-limiting consistency under 10x design load",
    codePaths: Object.freeze(["src/hooks/handle-rate-limit.ts", "src/hooks.server.ts"]),
    impact: "Rate limiting protects against DoS. Must be consistent even under extreme load.",
  }),
  "tests/benchmarks/data-residency-failover.test.ts": Object.freeze({
    proves: "PII blocking and data sovereignty enforcement with cross-region failover",
    codePaths: Object.freeze([
      "src/services/DataResidencyService.ts",
      "src/hooks/handle-authentication.ts",
    ]),
    impact:
      "GDPR/CCPA compliance depends on fast data residency checks. Slow checks delay every request.",
  }),

  // ── GOVERNANCE ───────────────────────────────────────────────────────────
  "tests/benchmarks/right-to-be-forgotten-audit.test.ts": Object.freeze({
    proves: "Deep-deletion performance across all linked tables",
    codePaths: Object.freeze(["src/services/GDPRService.ts", "src/databases/<db>/crud-methods.ts"]),
    impact: "Right-to-be-forgotten is legally mandated. Slow deletions risk compliance deadlines.",
  }),
});

// Pass compiled map to reporting core in a single batch operation — replaces 50+ individual calls
registerBulkTestMeta(BENCHMARK_META_REGISTRY);
