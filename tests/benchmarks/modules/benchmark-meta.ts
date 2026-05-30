/**
 * @file tests/benchmark./modules/benchmark-meta.ts
 * @description Educational metadata registry for all benchmark tests.
 *
 * Each entry maps a test file to:
 * - proves: What this benchmark specifically measures/proves
 * - codePaths: Source files most likely to contain the bottleneck
 * - impact: Why this metric matters to operations
 *
 * This data feeds into MDX reports to help users understand
 * WHAT is being tested, WHY it matters, and WHERE to look.
 */
import { registerTestMeta } from "./benchmark-reporting";

registerTestMeta(
  "tests/benchmarks/cache-hit-ratio.test.ts",
  "Redis cache hit/miss ratio and invalidation performance",
  ["src/databases/cache/redis-adapter.ts", "src/databases/cache/cache-service.ts"],
  "Cache efficiency directly impacts response latency. Misses trigger expensive DB round-trips.",
);

registerTestMeta(
  "tests/benchmarks/media-upload-stress.test.ts",
  "Large file upload throughput and streaming efficiency",
  ["src/services/MediaService.ts", "src/databases/media/"],
  "Media upload speed affects content editor productivity and DAM experience.",
);

// ─────────────────────────────────────────────────────────────
// BASELINE — Core system readiness
// ─────────────────────────────────────────────────────────────

registerTestMeta(
  "tests/benchmarks/api-latency.test.ts",
  "Base network and HTTP overhead for simple API calls",
  ["src/routes/api/[...path]/+server.ts", "src/hooks.server.ts"],
  "Foundation for all API performance. Degradation here affects every endpoint.",
);

registerTestMeta(
  "tests/benchmarks/cold-start-phased.test.ts",
  "Time to READY state vs WARMED state during system startup",
  ["src/hooks/handle-system-state.ts", "src/hooks.server.ts"],
  "Directly impacts deployment speed and self-healing recovery time. Critical for edge/serverless.",
);

registerTestMeta(
  "tests/benchmarks/truth-latency.test.ts",
  "SDK vs Dispatcher vs Real HTTP latency comparison",
  ["src/services/sdk/local-cms.ts", "src/routes/api/[...path]/+server.ts"],
  "Reveals HTTP middleware overhead vs direct SDK calls. Guides optimization of hot paths.",
);

registerTestMeta(
  "tests/benchmarks/modules/build-analysis.test.ts",
  "Production bundle size, chunk count, and build performance",
  ["vite.config.ts", "svelte.config.js"],
  "Large bundles degrade FCP/LCP. Affects CDN costs and user experience.",
);

registerTestMeta(
  "tests/benchmarks/dev-dependency-load.test.ts",
  "Build, sync, and lint toolchain overhead",
  ["scripts/quality-gate.ts", "vite.config.ts"],
  "Slow tooling kills developer productivity. Every second matters in CI/CD.",
);

// ─────────────────────────────────────────────────────────────
// ADAPTER — Database CRUD & transactions
// ─────────────────────────────────────────────────────────────

registerTestMeta(
  "tests/benchmarks/database-performance.test.ts",
  "Raw database adapter CRUD performance",
  ["src/databases/<db>/crud-methods.ts", "src/databases/<db>/adapter-core.ts"],
  "Adapter bottlenecks cascade to all data operations. Check indexes, connection pools, and query plans.",
);

registerTestMeta(
  "tests/benchmarks/transaction-acid.test.ts",
  "ACID transaction overhead and consistency guarantees",
  ["src/databases/<db>/crud-methods.ts"],
  "Transaction speed affects write-heavy workloads and data integrity.",
);

// ─────────────────────────────────────────────────────────────
// INTERNALS — Caching, middleware, scanning
// ─────────────────────────────────────────────────────────────

registerTestMeta(
  "tests/benchmarks/content-scan.test.ts",
  "Self-healing cache scanner performance across compiled collections",
  ["src/content/collectionScanner.ts", "src/databases/cache/cache-service.ts"],
  "Collection scan runs on every startup. Slow scans delay time-to-ready.",
);

registerTestMeta(
  "tests/benchmarks/hooks-performance.test.ts",
  "Micro-benchmark of individual middleware layers",
  ["src/hooks.server.ts", "src/hooks/handle-turbo-pipeline.server.ts"],
  "Middleware runs on every request. A 1ms regression compounds across all traffic.",
);

registerTestMeta(
  "tests/benchmarks/edge-sync.test.ts",
  "Distributed L1/L2 cache invalidation latency",
  ["src/databases/cache/cache-service.ts"],
  "Multi-region deployments depend on fast cache synchronization.",
);

registerTestMeta(
  "tests/benchmarks/telemetry-performance.test.ts",
  "Telemetry data collection and cryptographic signing overhead",
  ["src/services/TelemetryService.ts"],
  "Telemetry should be invisible. High overhead means lost observability or degraded UX.",
);

registerTestMeta(
  "tests/benchmarks/state-machine-transition.test.ts",
  "System state machine transition latency",
  ["src/stores/system/state.ts", "src/hooks/handle-system-state.ts"],
  "State transitions gate all system readiness. Stuck states block the entire CMS.",
);

registerTestMeta(
  "tests/benchmarks/cache-performance.test.ts",
  "2-layer hybrid cache efficiency across system modules",
  ["src/databases/cache/cache-service.ts", "src/databases/cache/l1-cache.ts"],
  "Cache hit ratio directly determines response latency. Misses trigger expensive DB round-trips.",
);

registerTestMeta(
  "tests/benchmarks/cache-service.test.ts",
  "CacheService L1 hit latency and pattern invalidation under noise",
  ["src/databases/cache/cache-service.ts"],
  "L1 cache is the fastest retrieval path. Degradation here affects every cached operation.",
);

registerTestMeta(
  "tests/benchmarks/local-api-performance.test.ts",
  "LocalCMS SDK overhead vs direct adapter calls",
  ["src/services/sdk/local-cms.ts", "src/services/sdk/namespaces/*.ts"],
  "Zero-tax SDK is a core performance promise. Overhead here defeats the purpose of server-side calls.",
);

registerTestMeta(
  "tests/benchmarks/setup-proxy.test.ts",
  "Setup proxy isolation and bootstrap security gating",
  ["src/hooks/handle-system-state.ts", "src/routes/setup/+page.server.ts"],
  "Setup security gates protect against re-initialization attacks. Must be fast AND secure.",
);

// ─────────────────────────────────────────────────────────────
// LOGIC — Server-side processing
// ─────────────────────────────────────────────────────────────

registerTestMeta(
  "tests/benchmarks/ai-performance.test.ts",
  "AI enrichment and layout generation overhead",
  ["src/services/AIService.ts"],
  "AI features must not block the request pipeline. Async processing is critical.",
);

registerTestMeta(
  "tests/benchmarks/temporal-integrity.test.ts",
  "Timezone normalization and deterministic UTC persistence",
  ["src/utils/date-utils.ts", "src/databases/core/base-sql-adapter.ts"],
  "Date corruption causes data integrity issues across tenants and timezones.",
);

registerTestMeta(
  "tests/benchmarks/widget-performance.test.ts",
  "Server-side processing cost of built-in widgets",
  ["src/widgets/*/index.ts", "src/widgets/widget-factory.ts"],
  "Widgets compose the content editing experience. Heavy widgets slow every form render.",
);

registerTestMeta(
  "tests/benchmarks/admin-ux-vitality.test.ts",
  "Svelte 5 logic overhead for complex multi-widget forms",
  ["src/components/*.svelte", "src/routes/(app)/config/collections/"],
  "Admin UX is the primary user interface. Sluggish forms hurt content editor productivity.",
);

registerTestMeta(
  "tests/benchmarks/media-performance.test.ts",
  "Image resizing, SHA-256 hashing, and metadata extraction",
  ["src/services/MediaService.ts", "src/databases/media/"],
  "Media processing is CPU-intensive. Bottlenecks block uploads and degrade DAM experience.",
);

registerTestMeta(
  "tests/benchmarks/relational-performance.test.ts",
  "JOINs, population strategies, and deeply nested relationships",
  ["src/databases/<db>/relational-utils.ts", "src/content/relation-service.ts"],
  "Relational queries are the most expensive DB operations. N+1 problems hide here.",
);

// ─────────────────────────────────────────────────────────────
// API — REST, GraphQL, security
// ─────────────────────────────────────────────────────────────

registerTestMeta(
  "tests/benchmarks/openapi-performance.test.ts",
  "Dynamic OpenAPI 3.1.0 spec generation and caching",
  ["src/services/OpenAPIService.ts"],
  "Slow spec generation blocks SDK generation and API documentation tooling.",
);

registerTestMeta(
  "tests/benchmarks/auth-performance.test.ts",
  "JWT verification, session retrieval, and permission matrix resolution",
  [
    "src/hooks/handle-authentication.ts",
    "src/databases/auth/session-service.ts",
    "src/services/sdk/namespaces/auth-namespace.ts",
  ],
  "Auth runs on every authenticated request. A 10ms degradation compounds across all API traffic.",
);

registerTestMeta(
  "tests/benchmarks/security-audit.test.ts",
  "Fail-closed dispatcher, payload scanning, and SHA-256 audit chaining overhead",
  ["src/routes/api/[...path]/+server.ts", "src/services/AuditLogService.ts"],
  "Security must not come at the cost of performance. Balance hardening with speed.",
);

registerTestMeta(
  "tests/benchmarks/rest-api-performance.test.ts",
  "End-to-end REST dispatcher throughput and latency",
  ["src/routes/api/[...path]/+server.ts", "src/hooks.server.ts"],
  "REST is the primary API surface. Degradation affects all integrations and SDK consumers.",
);

registerTestMeta(
  "tests/benchmarks/graphql-api-performance.test.ts",
  "GraphQL resolver execution time and throughput",
  ["src/routes/api/graphql/+server.ts", "src/routes/api/graphql/resolvers/"],
  "GraphQL resolvers can trigger cascading DB queries. N+1 patterns are common here.",
);

registerTestMeta(
  "tests/benchmarks/seo-performance.test.ts",
  "Redirect middleware, 404 logging, and sitemap caching",
  ["src/services/SEOService.ts", "src/hooks/handle-seo.ts"],
  "SEO features impact every page request. Slow redirects hurt Time-to-First-Byte.",
);

registerTestMeta(
  "tests/benchmarks/websocket-broadcast.test.ts",
  "Network-layer broadcast latency (SSE vs WebSocket)",
  ["src/services/RealtimeService.ts"],
  "Realtime features are latency-sensitive. Broadcast delays break collaborative editing.",
);

registerTestMeta(
  "tests/benchmarks/realtime-performance.test.ts",
  "WebSocket connection and broadcast latency",
  ["src/services/RealtimeService.ts", "src/hooks/handle-websocket.ts"],
  "WebSocket overhead affects all realtime features including live preview and collaboration.",
);

// ─────────────────────────────────────────────────────────────
// SCALE — Multi-tenancy & workload stability
// ─────────────────────────────────────────────────────────────

registerTestMeta(
  "tests/benchmarks/negative-cache.test.ts",
  "404-miss response times and cache lookup speedup",
  ["src/databases/cache/negative-cache.ts"],
  "Negative caching provides 2392x speedup for repeated misses. Degradation means unnecessary DB lookups.",
);

registerTestMeta(
  "tests/benchmarks/revision-stress.test.ts",
  "Performance degradation as document history grows to 100+ versions",
  ["src/services/RevisionService.ts"],
  "Revision growth can silently degrade write performance. Must scale linearly.",
);

registerTestMeta(
  "tests/benchmarks/memory-stability.test.ts",
  "Long-running soak test for memory leaks and GC pressure",
  ["src/databases/core/base-adapter.ts", "src/widgets/*/index.ts"],
  "Memory leaks cause OOM crashes in production. Native addon leaks (sharp, better-sqlite3) are common.",
);

registerTestMeta(
  "tests/benchmarks/multi-tenant-performance.test.ts",
  "Cross-tenant isolation and security boundary latency",
  ["src/databases/core/base-adapter.ts", "src/hooks/handle-authentication.ts"],
  "Multi-tenancy is a core differentiator. Tenant isolation must not create performance cliffs.",
);

registerTestMeta(
  "tests/benchmarks/mixed-workload.test.ts",
  "Production request mix: 60% Reads, 20% Writes, 15% GraphQL, 5% Media",
  ["src/routes/api/[...path]/+server.ts", "src/databases/<db>/crud-methods.ts"],
  "Real-world traffic patterns reveal bottlenecks invisible to isolated benchmarks.",
);

registerTestMeta(
  "tests/benchmarks/graphql-stress.test.ts",
  "High-concurrency GraphQL query stress test",
  ["src/routes/api/graphql/+server.ts", "src/routes/api/graphql/resolvers/"],
  "GraphQL under load reveals resolver inefficiencies and connection pool exhaustion.",
);

registerTestMeta(
  "tests/benchmarks/migration-scale.test.ts",
  "System ingestion limits with 10,000+ entries",
  ["src/databases/<db>/migrations.ts", "src/content/migration-service.ts"],
  "Bulk data operations are the most expensive. Pipeline efficiency determines migration feasibility.",
);

registerTestMeta(
  "tests/benchmarks/index-pressure.test.ts",
  "Complex filtering and sorting on 100,000+ entry collections",
  ["src/databases/<db>/crud-methods.ts", "src/databases/<db>/schema.ts"],
  "Index pressure reveals query plan issues. Missing indexes cause full table scans.",
);

registerTestMeta(
  "tests/benchmarks/content-scale-stress.test.ts",
  "Content scan performance on 1,000+ collections across 5 nested levels",
  ["src/content/collectionScanner.ts", "src/databases/cache/cache-service.ts"],
  "Collection count scales with tenant usage. Scanning must remain sub-linear at scale.",
);

registerTestMeta(
  "tests/benchmarks/client-journey.test.ts",
  "Login → List → View → Edit → Save → Realtime cumulative latency",
  ["src/hooks/handle-authentication.ts", "src/routes/api/[...path]/+server.ts"],
  "End-to-end journey latency is what users actually feel. Individual benchmarks don't capture this.",
);

registerTestMeta(
  "tests/benchmarks/concurrency-race.test.ts",
  "Atomic consistency and lost-update protection under concurrency",
  ["src/databases/<db>/crud-methods.ts"],
  "Race conditions cause data corruption. Concurrency control must be fast AND correct.",
);

registerTestMeta(
  "tests/benchmarks/failure-propagation.test.ts",
  "System overhead when downstream dependencies fail or timeout",
  ["src/hooks.server.ts", "src/services/circuit-breaker.ts"],
  "Failure propagation speed determines system resilience. Fast-fail prevents cascade.",
);

registerTestMeta(
  "tests/benchmarks/chaos-resilience.test.ts",
  "CMS availability during simulated database brownouts",
  ["src/hooks.server.ts", "src/databases/<db>/adapter-core.ts"],
  "Infrastructure failures are inevitable. The system must degrade gracefully, not crash.",
);

registerTestMeta(
  "tests/benchmarks/production-day.test.ts",
  "24-hour production simulation with mixed workload",
  [
    "src/routes/api/[...path]/+server.ts",
    "src/databases/<db>/crud-methods.ts",
    "src/databases/cache/cache-service.ts",
  ],
  "The ultimate test. Reveals slow memory leaks, cache churn, and connection pool drift.",
);

// ─────────────────────────────────────────────────────────────
// RESILIENCE — Chaos engineering & failover
// ─────────────────────────────────────────────────────────────

registerTestMeta(
  "tests/benchmarks/circuit-breaker-failover.test.ts",
  "Graceful degradation when external services fail",
  ["src/services/circuit-breaker.ts", "src/hooks.server.ts"],
  "Circuit breakers prevent cascading failures. Must trip fast and recover cleanly.",
);

// ─────────────────────────────────────────────────────────────
// SECURITY — Data protection
// ─────────────────────────────────────────────────────────────

registerTestMeta(
  "tests/benchmarks/throttling-backoff-stress.test.ts",
  "Rate-limiting consistency under 10x design load",
  ["src/hooks/handle-rate-limit.ts", "src/hooks.server.ts"],
  "Rate limiting protects against DoS. Must be consistent even under extreme load.",
);

registerTestMeta(
  "tests/benchmarks/data-residency-failover.test.ts",
  "PII blocking and data sovereignty enforcement with cross-region failover",
  ["src/services/DataResidencyService.ts", "src/hooks/handle-authentication.ts"],
  "GDPR/CCPA compliance depends on fast data residency checks. Slow checks delay every request.",
);

// ─────────────────────────────────────────────────────────────
// GOVERNANCE — Regulatory compliance
// ─────────────────────────────────────────────────────────────

registerTestMeta(
  "tests/benchmarks/right-to-be-forgotten-audit.test.ts",
  "Deep-deletion performance across all linked tables",
  ["src/services/GDPRService.ts", "src/databases/<db>/crud-methods.ts"],
  "Right-to-be-forgotten is legally mandated. Slow deletions risk compliance deadlines.",
);
