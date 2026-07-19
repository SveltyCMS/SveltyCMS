# AGENTS.md

This file provides comprehensive guidance to **AI Coding Assistants (Agents)** (such as Antigravity, Warp, Cursor, etc.) when working with the SveltyCMS codebase.

> [!IMPORTANT]
> **AI Agents: You MUST read this file in its entirety before performing any code modifications or architectural changes.** This document ensures you adhere to the project's strict standards for security, performance, and accessibility. For Svelte 5 rune best practices, reference [svelte.dev/llms-full.txt](https://svelte.dev/llms-full.txt), emphasizing fine-grained reactivity, deep state mutations, and avoiding legacy stores.

## Table of Contents

- [Project Overview](#project-overview)
- [Core Philosophy & Focus](#core-philosophy--focus)
- [Competitive Awareness](#competitive-awareness)
- [Technical Standards](#technical-standards)
- [Security Policy](#security-policy)
- [Security Hardening (Audit Remediation)](#security-hardening-audit-remediation)
- [AI Agent Best Practices](#ai-agent-best-practices)
- [E2E & Control-Map Testing Policy](#e2e--control-map-testing-policy)
- [Roadmap (Missing Features)](#roadmap-missing-features)
- [Project Structure](#project-structure)
- [Development Commands](#development-commands)
- [Architecture Overview](#architecture-overview)
- [Important Patterns & Conventions](#important-patterns--conventions)
- [Common Pitfalls](#common-pitfalls)
- [Key Files Reference](#key-files-reference)
- [Path Aliases](#path-aliases)
- [Getting Help](#getting-help)
- [Version Control](#version-control)

## Project Overview

SveltyCMS is a powerful headless CMS built with SvelteKit 2, Svelte 5, TypeScript, Tailwind CSS v4. It features a database-agnostic architecture (MongoDB, MariaDB/MySQL, PostgreSQL, and SQLite — all production-ready), GraphQL/REST APIs, multi-language support via Paraglide JS (compile-time, zero-runtime), and a modular widget-based content modeling system. Designed for edge compatibility, zero-runtime overhead, and enterprise readiness.

## Core Philosophy & Focus

- **Data Security & Ownership**: Security is paramount—users always own their data. Implement strict protocols (e.g., no direct DB access outside adapters, secure headers).
- **Performance & Optimization**: Target sub-millisecond latency with tree-shaking, SSR-first architecture, SvelteKit 5 Server Functions, Valibot, Vite optimizations, and <1s cold starts via progressive initialization. **We continuously monitor benchmarks (see `docs/project/benchmarks/index.mdx`) to ensure we remain the fastest Java-enterprise-ready CMS, aiming for sub-10ms persistence and outperforming traditional enterprise platforms.**

- **Universal Accessibility**: WCAG 2.2 AA and ATAG 2.0 compliant (full keyboard support, ARIA-live regions); **built for WCAG 3.0 Functional Performance standards with native Svelte 5 components.**
- **Premium Design**: Modern UX with native Svelte 5 components and Tailwind v4 for white-labeling and deep theming.
- **Maximum Flexibility**: Hybrid code/GUI schemas with bi-directional sync.
- **Developer First**: Support contributors with clear docs, tools, and Svelte 5 runes for efficient reactivity.

## Competitive Awareness (Smarter, Faster, Better)

SveltyCMS leverages Svelte 5's no-runtime compilation — a technical advantage over React-based CMS platforms that incur VDOM reconciliation and hydration overhead. Based on publicly available documentation as of June 2026:

| Feature           | SveltyCMS Approach                        | Architectural Difference                            |
| ----------------- | ----------------------------------------- | --------------------------------------------------- |
| **Core Tech**     | SvelteKit/Svelte 5 (Runes)                | No VDOM/hydration tax vs. React-based platforms     |
| **Cold Start**    | <1s (Progressive, self-healing)           | Measured on Intel i7-13700H, Bun 1.3.14             |
| **i18n**          | Paraglide (Compiled, zero-runtime)        | Compiled translations vs. runtime lookups           |
| **Schemas**       | Hybrid (Code + GUI, bi-directional)       | Compare: Payload (code-first), Strapi (GUI-first)   |
| **Multi-Tenancy** | Native (tenantId isolation)               | Core feature vs. enterprise-tier in some platforms  |
| **SCIM 2.0**      | Native endpoints (RFC 7644, filters/bulk) | Automated provisioning vs. manual configuration     |
| **OpenAPI 3.1.0** | Dynamic Export & SDK Ready                | Generate clients for any language automatically     |
| **Audit Logs**    | Crypto-chained (SHA-256 tamper-evident)   | Verifiable chain integrity vs. basic log storage    |
| **Accessibility** | WCAG 2.2 AA / ATAG 2.0                    | Documented compliance; compare with competitor docs |

To stay ahead: benchmark Core Web Vitals, maintain EU-compliant competitive docs, and prioritize features that deliver measurable user value.

## 🇪🇺 EU & German Comparative Advertising Compliance

> [!IMPORTANT]
> **All public-facing documentation, marketing, and competitive comparisons MUST comply with EU Directive 2006/114/EC (Comparative Advertising) and German UWG §6 (Unfair Competition Act).** These laws are stricter than US/UK standards and carry significant penalties for violations.

### Requirements for ALL Competitive Claims

1. **Verifiable Sources Only**: Every competitor comparison must cite publicly verifiable data (CVE databases, GitHub Advisory DB, published benchmarks, competitor's own documentation).
2. **Date-Stamped Methodology**: All performance claims must include measurement date, hardware specs, and reproduction commands.
3. **No Discrediting Language (German UWG §6)**: Never use language that disparages, denigrates, or discredits competitors' products, trademarks, or commercial activities. Use neutral architectural descriptions.
4. **No Unverifiable Absolutes**: Claims like "only", "first", "best", "industry-leading" must be qualified with "to our knowledge", "based on publicly available documentation", or "as of [date]".
5. **Comparison of Like-for-Like**: Only compare goods meeting the same needs. Note differences (SaaS vs self-hosted, free vs enterprise).
6. **No Confusion**: Never imply affiliation with a competitor. Use clear brand attribution.

### Before committing to competitive docs, verify:

- [ ] All competitor claims have verifiable public sources or date-stamped qualifiers
- [ ] No discrediting language ("suffers from", "cannot", "fails to", "broken")
- [ ] Performance numbers include methodology and reproduction commands
- [ ] Absolutes are qualified
- [ ] Feature tables compare objectively verifiable capabilities
- [ ] **Self-assessments are labeled as such** — never present internal scores as external audits

## Technical Standards

- **Modern Stack**: Latest TypeScript (^5.9.3), Node.js (>=24), Svelte 5 (^5.46.4), Vite 7 (^7.3.1), Bun (3-4x faster runtime)
- **Code Quality**: SveltyCMS uses a **tiered validation pipeline**. Developers do NOT need to manually run the full chain — git hooks handle it automatically:
  - **Pre-commit** (`git commit`): format, lint-staged, **security regression once** (`scripts/security-regression.ts`) (~2-3s). Never re-runs on push.
  - **Pre-push** (`git push`): `verify:push` → `scripts/precheck.ts` (push tier) — static analysis, **unit tests excluding security files**, production build (~1-3min). Security suite is **skipped** on push (pre-commit already ran it). Heavy DB integration + benchmarks are CI-only; opt in with `--include-db-tasks`.
  - **CI** (GitHub PR): Production build (gated on main/PR only), DB matrix (4 adapters), E2E Playwright (4 projects, 6 shards), benchmarks
  - Manual: `bun run gate:fast` (lint-staged), `bun run scripts/security-regression.ts`, `bun run verify:push`, `bun run scripts/precheck.ts --plan` (dry-run). DB matrix is CI-only unless `bun run scripts/precheck.ts --tier=push --include-db-tasks`.
  - **No double-run rule**: the same test suite must not run on both pre-commit and pre-push for one commit→push cycle.
  - **Private config policy**: Local precheck / unit / integration / E2E must use **`config/private.test.ts` only** and must **never create, overwrite, or delete `config/private.ts`**. CI (`ci.yml`) may write an ephemeral `private.ts` on the runner (never pushed). See `src/utils/private-config-policy.ts`.

| Category          | Convention           | Examples                                                                         |
| :---------------- | :------------------- | :------------------------------------------------------------------------------- |
| **Naming**        | `camelCase`          | `dbAdapter`, `loadSettings` (logic, variables, props)                            |
|                   | `PascalCase`         | `Auth`, `MediaService` (types, interfaces, classes)                              |
|                   | **`kebab-case`**     | `user-avatar.svelte`, `auth-service.ts` (**all** files, folders — no exceptions) |
|                   | `UPPER_SNAKE_CASE`   | `DB_TYPE`, `DEFAULT_THEME` (global constants)                                    |
| **Documentation** | **Mandatory Header** | `@file`, `@description`, `Features:`                                             |

> [!CAUTION]
> **All files and folders MUST use kebab-case.** PascalCase filenames (e.g. `ConfigTile.svelte`) will fail on Linux CI runners because the filesystem is case-sensitive. Windows may mask this issue, but CI will reject it. Run `bun run slop` to scan for violations.
>
> **Exception**: Benchmark reports in `docs/project/benchmarks/` use underscore naming (`benchmark_sqlite.mdx`, `benchmark_postgresql_redis.mdx`). These files are auto-generated by `scripts/benchmark-matrix/generate-benchmark-reports.ts` — the naming is pipeline-driven and intentional. Do not rename them.

> [!IMPORTANT]
> **Comprehensive Headers**: Headers MUST be readable and provide full context. Avoid single-line compression for complex modules. If the header need to be informative about the code file, use the standard format.
>
> - **Typescript (.ts)**: Use `/** ... */` block comments.
> - **Svelte (.svelte)**: Use `<!-- ... -->` HTML comments at the very top.
>
> **Standard Format Example (TS)**:
>
> ```typescript
> /**
>  * @file src/databases/db.ts
>  * @description
>  * Core initialization module for database and authentication.
>  *
>  * Responsibilities include:
>  * - Dynamically loading adapters based on DB_TYPE.
>  * - Managing connection resilience and retries.
>  * - Initializing system models (auth, media, collections).
>  *
>  * ### Features:
>  * - dynamic adapter loading
>  * - connection resilience
>  * - model auto-initialization
>  */
> ```
>
> **Standard Format Example (Svelte)**:
>
> ```html
> <!-- 
> @file src/components/avatar.svelte
> @component
> **Reusable user avatar component with fallback and status indicators**
> 
> ### Props
> - `src` (string): Image source URL.
> - `size` (number): Pixel size (default: 40).
> 
> ### Features:
> - lazy-loading images
> - fallback to initials
> - presence indicators
> -->
> ```

## Security Policy

### Supported Versions

Only the latest release on the `next` branch is supported.  
Always upgrade before reporting.

| Version         | Supported          |
| --------------- | ------------------ |
| `next` (latest) | :white_check_mark: |
| Older branches  | ❌                 |

### Reporting a Vulnerability

**Preferred method (private & recommended):**

1. Go to the [Security tab](https://github.com/SveltyCMS/SveltyCMS/security/advisories) → **Report a vulnerability**
2. Use the private form (GitHub will notify only maintainers)

**Alternative:**
Open a **private** issue or email security@sveltycms.com (PGP key available on request).

**What to include:**

- Description and steps to reproduce
- Affected version/branch (`next`)
- Impact (e.g. unauthenticated access, data leak, RCE)
- Any PoC or screenshot

We aim to reply within **48 hours** and fix critical issues within **7 days**.  
You will be credited in the release notes and SECURITY.md unless you prefer to stay anonymous.

Thank you for helping keep SveltyCMS safe! ❤️

## Security Hardening (Audit Remediation)

To maintain our **A++ Security Grade**, agents must adhere to these strictly enforced patterns:

### 1. Cryptographic Randomness (CSPRNG)

- **NEVER** use `Math.random()` for security-sensitive tokens (sessions, resets, API keys, UUIDs).
- **ALWAYS** use `globalThis.crypto.getRandomValues()` or `globalThis.crypto.randomUUID()`.
- **Location**: Use utilities in `@src/utils/native-utils.ts` (`generateSecureToken`, `generateUUID`) or `@src/databases/auth/constants.ts` (`generateRandomToken`).
- **Policy**: If `crypto` is unavailable, the system MUST throw an error rather than falling back to weak randomness.

### 2. Secrets Management

- **Location Matters**: Bootstrap secrets (DB creds, `JWT_SECRET_KEY`, `ENCRYPTION_KEY`) live in `config/private.ts`. All other secrets (SSO, SMTP, API keys, rate limit) are DB-driven and managed via System Settings UI — never hard-code them.
- **Reference**: See `docs/reference/security/secrets-inventory.mdx` for the full inventory of every secret and its storage tier.

### 3. API Authorization (Granular Gatekeeping)

- **POST-Authentication Check**: Authentication (knowing _who_ someone is) is necessary but not sufficient.
- **Enforcement**: All API requests in `src/routes/api/[...path]/+server.ts` must pass through `checkEndpointPermission` using the `ENDPOINT_PERMISSIONS` mapping.
- **RBAC**: Use `hasPermissionWithRoles` to validate specific actions (e.g., `manage:user`, `manage:collection`).

### 4. Account Protection & Lockout

- **Password Strength**: Minimum 8 characters (default, configurable via `PASSWORD_MIN_LENGTH` in `src/databases/schemas.ts`), including uppercase, lowercase, numbers, and special characters. Enforced via `Auth.validatePasswordStrength`.
- **Brute-Force Prevention**: Accounts are automatically locked for 15 minutes after 5 consecutive failed attempts. Enforced in both `Auth.authenticate()` (direct DB path) and `AuthNamespace.login()` (REST/GraphQL login path).
- **Tracking**: `failedAttempts` and `lockoutUntil` are tracked on the `User` object and reset upon successful authentication.

### 5. Secure Session Management

- **Cookies**: Use `httpOnly: true`, `sameSite: "strict"`, and `secure: true` (in production).
- **Prefixes**: Use `__Host-` or `__Secure-` prefixes for session cookies. In production/secure mode, ONLY accept `__Host-` prefixed cookies. Never fall back to prefixed cookies on insecure connections.
- **Subdomain Isolation**: The `__Host-` prefix prevents cookie leakage to subdomains per RFC 6265bis.

### 6. Setup & Bootstrap Security

- **Setup Completion Gating**: After setup completes, ALL `/api/setup` requests MUST be rejected with 403. The `handleSetupRoutes` handler in `src/routes/api/[...path]/handlers/setup.ts` performs an immediate `isSetupComplete()` check at entry.
- **Bootstrap Route Protection**: The `handleSystemState` hook MUST redirect `/setup` page requests to `/login` and block `/api/setup` with 403 when setup is already complete.
- **Reinitialization Guard**: The `seed-db` and `complete` endpoints in the setup handler MUST verify the system is in setup state before executing.

### 7. Handler-Level Defense-in-Depth

- **System Handlers**: `handleSettingsRoutes`, `handleSystemMgmtRoutes`, and `handleAutomationRoutes` in `src/routes/api/[...path]/handlers/system.ts` MUST verify `locals.user.isAdmin` or `user.role === "admin"` for all mutating operations (POST/PATCH/PUT/DELETE).
- **Media Handlers**: `handleMediaUpload` MUST verify `media:write` permission. `handleMediaPostDelete` MUST verify `media:delete` permission. These are defense-in-depth checks on top of the dispatcher-level `ENDPOINT_PERMISSIONS`.
- **Page Actions**: All `.server.ts` actions MUST either use centralized permission guards (e.g., `requireCollectionBuilderPermission`) or inline `hasPermissionWithRoles` checks before executing state-changing operations.

### 8. API Dispatcher Fail-Closed Authorization

- **ENDPOINT_PERMISSIONS Mapping**: Every namespace in `src/routes/api/[...path]/+server.ts` MUST have an entry in the `ENDPOINT_PERMISSIONS` mapping. Unmapped namespaces return `false` (403 Forbidden) by default.
- **checkEndpointPermission**: MUST validate admin fast-path, SCIM blocking, user self-service endpoints, and RBAC via `hasPermissionWithRoles`. No namespace should be allowed without explicit permission mapping.
- **Defense-in-Depth**: Handler-level checks (sections 6-7) act as a secondary verification layer beneath the dispatcher, ensuring security even if the dispatcher mapping is misconfigured.

## AI Agent Best Practices

When generating/modifying code:

1. **Prioritize Tree-shaking**: Use named exports; avoid side-effect imports.
2. **Use Svelte 5 Runes** (per [svelte.dev/llms-full.txt](https://svelte.dev/llms-full.txt)):
   - `$state()` for deep reactivity: `let obj = $state({ nested: { value: 1 } }); obj.nested.value = 2;` (granular updates).
   - `$derived()` for computed: `let doubled = $derived(count * 2);`.
   - `$effect()` for side effects: `$effect(() => console.log(count));` (avoid state updates inside to prevent loops).
   - In classes: `class Todo { done = $state(false); constructor(text) { this.text = $state(text); } }`.
   - Use `$state.raw` for non-mutable data; `$state.snapshot` for static copies; `$state.eager` for immediate feedback.
   - Avoid legacy stores or reactive declarations; declare at top-level for components.
3. **Tailwind CSS v4 Behaviors**:
   - **Configuration**: We use Tailwind v4 with CSS-based config (`@import "tailwindcss"` in CSS, **NO** `tailwind.config.js`). Do not create or modify `tailwind.config.js` or `tailwind.config.ts`.
   - **@apply directive**: Never use `@apply` except for base layer component abstractions. Always write utility classes inline.
   - **Arbitrary Values**: Prefer v4 CSS custom property syntax for design tokens over arbitrary values (e.g. `[... ]` syntax) when appropriate.
4. **Leverage Modern SvelteKit Patterns**:
   - **SSR-First**: Prioritize Server-Side Rendering for critical paths (e.g., Setup, Collection Loading) to ensure fast FCP.
   - **Server Functions (Remote Functions)**: Prefer SvelteKit 5 Server Functions in `+page.server.ts` over standalone API routes for type safety and reduced network complexity.
   - **Middleware Security**: Respect the sequential middleware pipeline in `hooks.server.ts`. All requests are gated by `handleSystemState` for self-healing and security.
   - **Self-Healing State**: Use the `@stores/system` state machine (`IDLE` → `READY`) for resilient startup. reference `docs/reference/architecture/state-management.mdx`.
5. **Strict Type Safety**: No `any`; use discriminated unions and Valibot for E2E validation.
6. **Accessibility**: Ensure keyboard-navigable, ARIA-compliant components with live regions. Reference `docs/tests/accessibility-audit.mdx` for WCAG 3.0 & ATAG 2.0 compliance testing. All interactive elements MUST have accessible names (`aria-label`, `aria-labelledby`, or matching `id`+`label`). Use Tailwind v4 logical properties (`ps-4`, `pe-2`) instead of directional ones (`pl-4`, `pr-2`) for RTL compatibility.
7. **Database Agnosticism**: Confine logic to adapters; scope by `tenantId`.
8. **File Headers**: Always include as defined.
9. **Roadmap Alignment**: Prioritize gaps like full SAML/SCIM hardening; optimize for enterprise (e.g., lighter SAML deps).
10. **MCP Knowledge Base (CRITICAL)**: Always query the hosted MCP server at `https://mcp.sveltycms.com/mcp` when in doubt about SveltyCMS architecture, schema conventions, or widget syntax, as it holds the verified source of truth. Utilize MCP connections for dynamic generation flows.
11. **Admin Theme & Native UI Compliance**:
    - **AdminPageShell**: Every `(app)` `+page.svelte` MUST use `<AdminPageShell>`. Do NOT create hand-rolled `absolute inset-0` page shells or inline `<h1>` headers.
    - **AdminCard**: Wrap content blocks in `<AdminCard>`, never bare `<div class="card">` with inline `var(--admin-radius-card)`.
    - **Native Components**: Always prefer `<Button>`, `<Badge>`, `<Input>`, `<Select>`, `<Textarea>` over raw `<button class="btn">`, `<span class="badge">`, or `<input class="input">`. Raw utility classes are deprecated.
      - **Mixing component CSS classes is forbidden**: Never use `class="badge"` on a `<Button>` or `class="btn"` on a `<Badge>`. Each component owns its base class.
    - **Svelte Attribute Placement (CRITICAL)**: HTML attributes (`aria-label`, `role`, `type`, etc.) MUST be on the **opening tag** of the element. Placing an attribute string between child elements causes Svelte to render it as **visible text content**, not as an HTML attribute.
      - ✅ `<button aria-label="Save" onclick={...}> <icon/> Save </button>`
      - ❌ `<button onclick={...}> <icon/> aria-label="Save" Save </button>` — renders the text "aria-label=\"Save\""
12. **Performance Awareness**: Every change must consider the "sub-10ms persistence" goal. Avoid heavy runtime dependencies and prioritize Svelte 5 runes for fine-grained reactivity.
13. **Empirical Performance Verification**: When implementing logic enhancements or optimizations:
    - **Baseline**: Run the relevant benchmark with recording: `BENCHMARK_RECORD=1 bun test tests/benchmarks/<test>.test.ts`
    - **Verification**: Run same benchmark after changes; compare trend labels in `docs/project/benchmarks/benchmark_<db>.mdx`
    - **Full Matrix**: For cross-test correlation, run `bun run scripts/benchmark-matrix/index.ts --sql`
    - **Reports**: Check MDX reports for trend labels (`🔴 avg +35%`), root cause insights, and code path recommendations
    - **Commit Messages**: Do NOT add `Co-Authored-By` or AI tags.
14. **Security Regression Test (CRITICAL)**: Owned by **pre-commit only** (`bun run scripts/security-regression.ts`). Pre-push excludes these files from Full Unit Tests — do not re-add them to the push tier. Before committing changes under `src/hooks/`, `src/routes/api/`, `src/routes/files/`, or `src/routes/(app)/`, that suite runs automatically; manual: `bun run scripts/security-regression.ts`.
15. **Predictive Preloading (Anchor-First)**:
    - **Anchor-First Mandate**: All primary navigation MUST use `<a>` tags with `data-preload` attributes. Never use `goto()` for primary navigation — it bypasses ALL speculative preloading.
    - **Strategy Selection**:
      - Table rows / collection entries → `data-preload="smart"` (physics cone + behavioral priority)
      - Dashboard widget links → `data-preload="predict"` (cursor trajectory prediction)
      - Sidebar / config nav → `data-preload="hover"` (150ms intent detection)
      - Media gallery thumbnails → `data-preload="viewport"` (IntersectionObserver)
    - **Implementation**: `src/utils/predictive-preload.ts` — MutationObserver-based, initialized once in `+layout.svelte`.
    - **goto() escape hatch**: Only use `goto()` for non-navigation URL updates (filters, sorting, pagination).
    - **Reference**: `docs/reference/architecture/hover-preloading.mdx`
16. **Behavioral Learning Integration**:
    - Every `+layout.server.ts` MUST call `recordCollectionAccess()` and `recordNavigation()` (already wired — do not remove).
    - Collection detail `+page.server.ts` SHOULD call `recordEntryAccess()`.
    - Query `getHotCollections()` before cache-warming decisions.
    - Use `predictNextPath()` for prefetch hints.
    - **Reference**: `docs/reference/architecture/behavioral-learning.mdx`
17. **Reactive Search Params**:
    - Use `useReactiveSearchParams()` from `src/utils/reactive-search-params.svelte.ts` for client-side table filtering/sorting/pagination without SSR round-trips.
    - Wraps Svelte 5 SvelteURLSearchParams — reactive, type-safe, URL-synced.
18. **Link Validation (Build-Time)**:
    - Run `bun run scripts/validate-links.ts` before shipping to catch broken internal links.
    - Flags missing `data-preload` attributes on collection entry links.
    - **Reference**: `src/utils/link-validator.ts`
19. **Always Fix Pre-Existing Issues Found During Work**: When working on a task and you encounter pre-existing bugs, lint warnings, type errors, or test failures that are not directly related to your changes, fix them anyway. Do not leave the codebase in a worse state than you found it. If you see an opportunity to further optimize or enhance code you are already modifying, do so. Leaving pre-existing issues unfixed creates technical debt and can mask regressions. The only exception is if the fix would take significantly longer than the original task — in that case, document the issue and move on.
    - **Common patterns to watch for**:
      - **`bun:test` imports** → Always use `vi.fn()` from `vitest`, never `mock` from `bun:test`. Vitest is the canonical test runner.
      - **`vi.mock` module-scope leakage** → `vi.mock` calls in one test file pollute subsequent files. When adding a `vi.mock`, add a matching one in affected test files to restore the real module.
      - **`response.clone()`** → When recreating a Response with modified headers, clone the body first to avoid `ReadableStream already used` errors from upstream hooks.
      - **Dead code in middleware** → Check for duplicate handler sections in the pipeline that became unreachable after refactoring.
      - **`cacheService` mock gaps** → When adding a new public method to the real `CacheService` class (e.g., `invalidateCollection`), add a matching mock entry to `tests/unit/setup.ts` `cacheMock`. Tests that exercise mutation paths (create/update/delete) will call it and fail with `is not a function`.
      - **MongoDB `$setOnInsert` missing `tenantId`** → `bulkUpdateNodes` in `src/databases/mongodb/content-methods.ts` constructs `$setOnInsert` without `tenantId`. Documents created via upsert land without tenant isolation, causing `safeQuery` tenant-scoped lookups to miss them. Always include `tenantId` in `$setOnInsert` when `options.tenantId` is present.
      - **CI `db-tests` missing `TEST_API_SECRET`** → The `db-tests` job in `.github/workflows/ci.yml` passes env vars to `run-integration-tests.ts`, which calls `loadHardenedConfig()`. Without `TEST_API_SECRET` in CI, it throws `"CRITICAL: TEST_API_SECRET is missing in CI environment"` at startup. Always add `TEST_API_SECRET: ${{ secrets.TEST_API_SECRET }}` alongside `JWT_SECRET_KEY` and `ENCRYPTION_KEY`.
      - **`config/collections/` directory missing in e2e-prep** → The collection builder save action calls `fs.writeFileSync(collectionPath, content)` which throws if the parent directory doesn't exist (Node.js `writeFileSync` does NOT auto-create parents). The e2e-prep job must `mkdir -p config/collections` and include it in the E2E environment archive.
      - **E2E soft-skips for empty lists** → Never `test.skip` because a control-map route has no data. Seed via `/api/testing` (`tests/e2e/helpers/seed.ts`) so happy paths always run.
20. **E2E Control-Map Policy (CRITICAL)**: See [E2E & Control-Map Testing Policy](#e2e--control-map-testing-policy). Soft-skips on control rows are banned; seed fixtures instead.

## E2E & Control-Map Testing Policy

> [!IMPORTANT]
> **Soft-skip is banned for control-map rows.** Conditional `test.skip(true, "no items yet")` (or empty-install skip) hides regressions and makes CI look green while real UX is broken. Prefer **seed-first** happy paths.

### Rules

1. **Control map = must run**: If a route/control is documented in `docs/tests/routes/*.mdx` (or `docs/tests/test-status.mdx` hot areas), its E2E **must not soft-skip** for empty install state, missing list rows, or “no sample data.”
2. **Seed via Testing API**: Use `POST /api/testing` with `TEST_API_HEADERS` from `tests/e2e/helpers/test-api.ts`. Prefer helpers in `tests/e2e/helpers/seed.ts`:
   - `seedWebhook` / `deleteWebhook`
   - `seedAutomation` / `deleteAutomation`
   - `enablePlugin` (core plugins expected in CI)
   - Existing: `seedTestUsers`, `prepareTestUser`, `setTestSetting`, `seedInviteToken`, …
   - Handler actions live in `src/routes/api/[...path]/handlers/testing.ts` (`seed-webhook`, `seed-automation`, `enable-plugin`, …). Add new seed actions there when a control map needs deterministic state.
3. **Outcome assertions over shell-only**: Prefer create → reload → assert persistence → cleanup over “button is visible.” Shell testids are fine as **guards**, not as the only coverage for mutating controls.
4. **No fixed sleeps for readiness**: Avoid `page.waitForTimeout` for load completion. Wait on testids (`webhooks-loading` count 0) or network/URL outcomes.
5. **Hard fail vs optional infrastructure**:
   - **Empty product state** (no webhooks, no automations) → **seed**, never skip.
   - **External fixtures** (Docker Postgres for Unified Data Hub, real IdP) → may fail with a clear error or return `503` + code from testing API; document as optional in the control map. Do **not** soft-skip core admin CRUD for the same reason.
   - **Optional plugins in control map** (e.g. Smart Importer): call `enablePlugin`, then **hard-fail** if the wizard UI never mounts (`ensureSmartImporterReady`). Soft-skip is still forbidden.
6. **Pyramid guidance**: Unit pure helpers + page.server gates; integration for API/DB; few deep E2E journeys per domain. Do not grow brittle “every testid exists” rows without a seed-backed happy path for mutations.
7. **Cleanup**: Seeded entities should be deleted in `finally` (or after assert) so serial suites stay isolated.

### Anti-patterns

```typescript
// ❌ Soft-skip hides regressions when list is empty
if (!(await list.isVisible())) {
  test.skip(true, "No items — empty install");
  return;
}

// ✅ Seed so the control always has state
const seeded = await seedAutomation(page, { name: `E2E ${Date.now()}` });
try {
  await page.goto("/config/automations");
  await expect(page.getByText(seeded.name)).toBeVisible();
} finally {
  await deleteAutomation(page, seeded.id);
}
```

### Docs to update when adding control-map E2E

- Route control map under `docs/tests/routes/`
- `docs/tests/test-status.mdx` hot-area row
- This policy section if you introduce a new seed action category

### Architecture (product + tests)

Full decision record: **[docs/tests/adr-testing-2026.mdx](docs/tests/adr-testing-2026.mdx)**.

### Testing API security (fail-closed — no production backdoors)

`/api/testing` seed/reset actions (`seed-webhook`, `seed-automation`, `enable-plugin`, …) are **not** production features.

| Requirement         | Enforcement                                                                                                   |
| ------------------- | ------------------------------------------------------------------------------------------------------------- |
| Never in production | `NODE_ENV=production` → **403** (`assertTestingApiAllowed`)                                                   |
| Explicit env flag   | `TEST_MODE` / `PLAYWRIGHT_TEST` / `BENCHMARK` / `SVELTY_BENCHMARK_SUITE` only — **not** bare `NODE_ENV=test`  |
| Shared secret       | `x-test-secret` must match `TEST_API_SECRET` (timing-safe)                                                    |
| Build strip         | `testBackdoorStripperPlugin` + `scripts/verify-prod-build-backdoor.ts` remove handler from production bundles |

**Do not** add alternate entry points that skip this gate. Prefer UI golden journeys + seeds only behind `/api/testing`. Never hardcode production-usable secrets. Unit proof: `tests/unit/utils/testing-api-gate.test.ts`, `tests/unit/hooks/route-access-audit.test.ts`.

Reference implementation to copy for new admin routes:

| Layer       | Webhooks files                                                               |
| ----------- | ---------------------------------------------------------------------------- |
| Gate        | `webhooks/+page.server.ts`                                                   |
| Pure utils  | `webhooks/webhooks-utils.ts`                                                 |
| Browser API | `webhooks/webhooks-api.ts` → `fetchApi` (CSRF on mutations)                  |
| UI          | `webhooks/+page.svelte` (no raw `fetch` / manual CSRF)                       |
| Golden E2E  | `tests/e2e/routes/config/webhooks.spec.ts` — create → list → reload → delete |

**Do not** grow brittle “every testid exists” E2E rows unless they map to a control-map risk. Prefer one golden journey per domain.

### Mandatory Documentation Updates

> [!CAUTION]
> **When implementing ANY new feature, you MUST update documentation.** Incomplete documentation is a blocking issue.

**For ALL new features, always update:**

- [ ] `docs/project/roadmap-2026.mdx` - Mark progress, add new items
- [ ] `AGENTS.md` roadmap checklist (if feature is listed)
- [ ] Create/update relevant MDX doc in appropriate `docs/` subdirectory

**Feature-Specific Documentation:**

### Documentation Matrix

| Feature Type          | Primary MDX Location                                        | Also Update                                           |
| :-------------------- | :---------------------------------------------------------- | :---------------------------------------------------- |
| **Database**          | `docs/reference/database/`                                  | `technical-evaluation-2026.mdx`                       |
| **Auth/Security**     | `docs/reference/security/authentication-system.mdx`         | `technical-evaluation-2026.mdx`                       |
| **Admin Theme / UI**  | `docs/contributing/style-guide-gui.mdx`                     |                                                       |
| **Content/Preview**   | `docs/reference/architecture/live-preview-architecture.mdx` | Integration docs                                      |
| **Widgets**           | (inline in widget package)                                  | `widget-system-overview.mdx`                          |
| **API**               | `docs/reference/api/`                                       | Relevant service docs                                 |
| **Performance**       | `docs/reference/database/performance-architecture.mdx`      | `technical-evaluation-2026.mdx`                       |
| **Benchmarks**        | `docs/tests/benchmark-matrix.mdx`                           | `docs/project/benchmarks/index.mdx`                   |
| **Testing Scripts**   | `docs/tests/testing-scripts.mdx`                            | `docs/tests/index.mdx`                                |
| **Intelligence / AI** | `docs/reference/architecture/behavioral-learning.mdx`       | `ai-integration.mdx`, `technical-evaluation-2026.mdx` |
| **Preloading**        | `docs/reference/architecture/hover-preloading.mdx`          | `behavioral-learning.mdx`, `cache-system.mdx`         |
| **Marketplace**       | `docs/reference/architecture/marketplace.mdx`               | `ai-integration.mdx`                                  |
| **Packages / SDK**    | `docs/development/package-model.mdx`                        | `docs/development/local-vs-http-api.mdx`              |

**Key Documentation Files:**

- `docs/reference/database/` - Database adapters, auth, cache, performance
- `docs/guides/` - Configuration, content, deployment & legal guides
- `docs/development/` - Development guides (AI integration, error handling, widgets, plugins, etc.)
- `docs/reference/` - API reference, architecture, security, database & components
- `docs/reference/architecture/` - Architecture docs (live preview, behavioral learning, etc.)
- `docs/project/roadmap-2026.mdx` - Roadmap and gap analysis
- `docs/project/technical-evaluation-2026.mdx` - Competitive comparison

## Roadmap (Missing Features)

See [Roadmap 2026](docs/project/roadmap-2026.mdx) for in-progress and planned work.
See [Technical Evaluation 2026](docs/project/technical-evaluation-2026.mdx) for completed achievements.

Key areas to prioritize:

- Features marked as "Planned" in the roadmap
- Marketplace Phase 2 (in-app catalog/browse UI)
- Published DB adapters as separate npm packages
- Enterprise infrastructure scaling (Docker, Terraform)

## Upgrading SveltyCMS

SveltyCMS provides an automated script to fetch updates from the upstream repository, merge changes, and refresh dependencies.

### How to Upgrade

1. **Ensure your working directory is clean** (commit or stash changes).
2. **Run the upgrade script**:
   ```bash
   bun run scripts/upgrade.ts
   ```
3. **Resolve conflicts if any**: The script will pause if there are merge conflicts. Resolve them in your IDE, then run `bun install` again.

> [!TIP]
> Always run `bun run check && bun run test:unit` after an upgrade to ensure system integrity.

## Common Development Issues

### 1. Vite Cache Synchronization (504 Outdated Optimize Dep)

If you encounter `504 (Outdated Optimize Dep)` errors in the browser console after a restart or configuration change, Vite's dependency optimization cache is out of sync.
**Fix:**

```bash
rm -rf node_modules/.vite
bun run dev
```

### 2. SQLite "value.getTime is not a function"

This occurs if an `ISODateString` is passed to a Drizzle SQLite column configured with `mode: 'timestamp_ms'`.
**Fix:** Ensure standard fields like `createdAt` and `updatedAt` are passed as JS `Date` objects in the SQLite adapter modules.

### 3. Windows `bun install` Corruption (Upstream Bun Bug)

**The Problem**: `bun install` v1.3.11+ on Windows may corrupt `node_modules` — writing null bytes into package.json files and leaving package directories empty. This is an upstream bun bug.

**Symptoms**:

- `bun install` fails with `ParserError` for `@sveltejs/kit` or `esbuild`
- After install, `bun run dev` fails with `Error: Invalid package config`
- 155 of 1143 `package.json` files contain only null bytes
- 37 package directories created but completely empty

**Workaround**: Use `npm install` instead of `bun install`:

```bash
npm install    # Works cleanly on Windows
bun run dev    # bun's runner works fine after npm install
```

All `bun run` commands (dev, check, test, etc.) work normally after `npm install` since they just invoke vite/svelte-kit.

**Note**: This only affects the Bun installer on Windows; Bun's runtime remains fully functional.

### 4. Deleting `node_modules` + `bun.lock` Together on Windows

**The Problem**: Deleting both `node_modules` and `bun.lock` forces a fresh resolution. On Windows, this fails because:

- Native addons (e.g., `argon2`, `sharp`) may fail to compile without Python/build tools, halting the entire install
- Bun may corrupt transitive dependencies (e.g., missing `drizzle-orm/sql/`, empty `@zag-js/` directories)

**Symptoms**:

- `bun install` dies with `gyp ERR! find Python` at native addons
- After recovery, `bun install` says "no changes" but packages are missing
- `bun run check` fails with "Module has no exported member" from `drizzle-orm`

**Fix — NEVER do this**:

```bash
# ❌ DON'T
rm -rf node_modules bun.lock && bun install

# ✅ DO — incremental install
bun install
```

**If already corrupted**: Restore `bun.lock` from git and run incremental install:

```bash
git checkout HEAD -- bun.lock
bun install
```

**If a single package is corrupted** (e.g., drizzle-orm missing `sql/`):

```bash
bun remove drizzle-orm && bun add drizzle-orm
```

**Note**: The `repair:drizzle` script automates this for drizzle-orm specifically.

### 5. `bun:test` Imports Fail Under Quality Gate (Vitest Runner)

**The Problem**: The pre-commit quality gate runs `vp test run` (Vitest), not `bun test`. Test files that import from `"bun:test"` fail with "Cannot find package 'bun:test'".

**Symptoms**:

- `bun test tests/unit/foo.test.ts` passes
- `bun run test:unit` (or pre-commit gate) fails with `Cannot find package 'bun:test'`

**Fix — ALWAYS use `"vitest"` imports**:

```typescript
// ❌ WRONG — fails under Vitest runner
import { describe, expect, it } from "bun:test";

// ✅ CORRECT — works under both bun test and vitest
import { describe, expect, it } from "vitest";
```

**For Bun-only APIs (`bun:sqlite`, etc.)**: Guard with `typeof Bun !== "undefined"` and skip the test when Bun is unavailable.

```typescript
const isBun = typeof Bun !== "undefined";

it("uses bun:sqlite", async () => {
  if (!isBun) return; // Skip under Vitest/Node
  const { Database } = await import("bun:sqlite");
  // ...
});
```

**Note**: The `tests/unit/bun-preload.ts` provides a `vi` shim for Bun's test runner, making vitest-compatible code work under `bun test`. Always write tests for vitest.

## Project Structure

- **CMS (`/src`)**: Core logic, adapters, services, widgets (each with `.mdx` docs).
- **Documentation (`/docs`)**: Guides, roadmap, evaluations.
- **Tests (`/tests`)**: Unit (Bun), integration, E2E (Playwright).

## Development Commands

| Category      | Command                                                                                                                                                                         | Description                                                       |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Daily Dev     | `bun run dev`                                                                                                                                                                   | Dev server (auto-setup wizard)                                    |
|               | `bun run build`                                                                                                                                                                 | Production build                                                  |
|               | `bun run preview`                                                                                                                                                               | Preview on 127.0.0.1:4173                                         |
| Code Quality  | `bun run check`                                                                                                                                                                 | Type checking                                                     |
|               | `bun run lint`                                                                                                                                                                  | Fast Lint (oxlint)                                                |
|               | `bun run format`                                                                                                                                                                | Fast Format (oxfmt)                                               |
| Testing       | `bun run test:unit`                                                                                                                                                             | Unit tests (Vitest/jsdom) — 1,516 tests                           |
|               | `bun run test:integration`                                                                                                                                                      | Integration (DB required)                                         |
|               | `bun run test:e2e`                                                                                                                                                              | E2E (Playwright)                                                  |
| **Git**       | `bun run git commit -m "msg"`                                                                                                                                                   | Hardened commit (blocks --no-verify)                              |
|               | `bun run git push`                                                                                                                                                              | Hardened push (blocks --no-verify)                                |
| **Security**  | `bun test tests/unit/hooks/defense-in-depth.test.ts tests/unit/hooks/authentication.test.ts tests/unit/hooks/authorization.test.ts tests/unit/hooks/file-server-tenant.test.ts` | Fast security regression check (95 tests)                         |
| DB Operations | `bun run db:push`                                                                                                                                                               | Push schema changes (Drizzle)                                     |
| i18n          | `bun run paraglide`                                                                                                                                                             | Compile messages                                                  |
| Diagnostics   | `bun run check`                                                                                                                                                                 | Type checking & validation (use `bun test` for isolated DB tests) |
| **CI Parity** | `bun run format && bun run lint && bun run check && bun run test:unit`                                                                                                          | **Mandatory before commit** (performs full local CI check)        |

## Architecture Overview

### High-Performance Local API (CRITICAL)

SveltyCMS provides a zero-latency internal SDK bridge (`LocalCMS`) for server-to-server communication.

- **Always use `LocalCMS` in `.server.ts`**: In all server-side files (hooks, actions, load functions), instantiate `new LocalCMS(adapter)`.
- **Bypass HTTP Middleware**: Local calls are internal and **must bypass** HTTP-only layers like **Firewalls**, **Rate Limiting**, and **JSON serialization**.
- **Full Parity**: The Local API uses the exact same `modifyRequest` pipeline as the REST/GraphQL layers, ensuring consistency while performing 10-50x faster.

✅ **Correct (Server-side)**:

```typescript
const cms = new LocalCMS(adapter);
const entries = await cms.collections.find("posts", { tenantId });
```

❌ **Wrong (Server-side)**:

```typescript
const res = await fetch("/api/collections/posts"); // Unnecessary HTTP/Network overhead
```

### Database Adapter Pattern (CRITICAL)

Use `dbAdapter` for agnosticism:

✅ Correct: `const items = await dbAdapter.crud.findMany('collection_name', filter);`

❌ Wrong: Direct `mongoose.model('Collection').find();`

**Key adapter interfaces:** `crud.*`, `auth.user.*`, `auth.session.*`, `auth.token.*`, `collection.*`, `media.*`, `settings.*`, `widget.*`.

### Widget System Architecture (3-Pillar)

1. **Definition** (`index.ts`): `createWidget()` with Valibot schema.
2. **Input** (`Input.svelte`): Entry component.
3. **Display** (`Display.svelte`): Render component.

Example (condensed):

```typescript
import { createWidget } from "@widgets/widgetFactory";
import * as v from "valibot";

export default createWidget<{ maxLength?: number }>({
  Name: "myWidget",
  validationSchema: (field) => v.string([v.maxLength(field.maxLength ?? 100)]),
  GuiSchema: { maxLength: { widget: "number", label: "Max Length" } },
});
```

### Content & Collection System

Hybrid code/GUI with TS → JS → DB sync.

### Middleware Pipeline (hooks.server.ts)

Order: Compression → Caching → System State (self-healing) → Security (Firewall + Rate Limit) → Setup → Locale → Theme → Auth → Authorization → API Logic → Token Resolution → Security Headers.

### Multi-Tenant Architecture

Native; enabled in `config/private.ts`; Enforces isolation via `tenantId`.

### State Management

Svelte 5 runes: `$state()` for state, `$derived()` for computations, `$effect()` for effects. Stores: `widget-store.svelte.ts` (singleton), `stores/system/state.ts` (custom auto-recovery state machine).

## Important Patterns & Conventions

1. **Security**: No secrets in client; use `.server.ts`.
2. **Async Init**: Await `dbInitPromise`.
3. **Date Handling & ISO Strings**:
   - **Type Safety**: Use `ISODateString` from `@src/content/types` for all dates in entities.
   - **Utility**: Use `@src/utils/date-utils.ts` for ALL date operations.
   - **Current Time**: Always use `nowISODateString()` instead of `new Date().toISOString()`.
   - **Drizzle Consistency**: When assigning to Drizzle `Date` columns (MariaDB/SQLite), wrap ISO strings in `isoDateStringToDate()`: `updatedAt: isoDateStringToDate(nowISODateString())`.
   - **Database Agnostic**: Use `toISOString(value)` when reading from any database to ensure a consistent `ISODateString`.
4. **Explicit Physical Selection (Enterprise Boundary)**:
   - **Hardening**: For core system tables (e.g., `content_nodes`, `audit_logs`), always use explicit literal selection in the DB adapter.
   - **Why**: Prevents "Ghost Column" bugs where minifiers mangle property names and ORM reflection fails in production chunks.
   - **Pattern**: `const columns = new Set(["_id", "path", "translations", ...])`.
5. **Type Safety & Validation**: Valibot schemas.
6. **Error Handling & Logging**:
   - **Unified throwing**: Always use `raise(status, message, code?)` from `@utils/error-handling`. Never use SvelteKit's raw `error()` or manual `throw new AppError()`.
   - **Catch blocks**: Start every catch block with `rethrow(err)` to let SvelteKit handle redirects/HTTP errors.
   - **Global logging**: The `handleError` hook in `hooks.server.ts` catches ALL unhandled errors with structured context (code, user, tenant, path).
   - **Observability**: Never silently swallow errors. At minimum, log with `logger.debug()`.
7. **Permissions**: `hasPermissionWithRoles()`.
8. **i18n**: Paraglide messages.
9. **API Responses**: Consistent `{ data, message }` or `{ error, code }`.

## Common Pitfalls

1.  **Circular Dependencies**: Use dynamic imports for service initialization.
2.  **HMR Reloads**: Expected for collections/widgets. Full page reload is normal.
3.  **Setup Wizard**: Let it generate `config/private.ts`. Do NOT create manually.
4.  **Black-Box Testing**: Local integration/E2E use **`config/private.test.ts` only** (generated by runners under `TEST_MODE`). **Never** mutate the developer's `config/private.ts`. CI may create ephemeral `private.ts` on the runner only (`ci.yml` / `isCiRunner()`). Wizard E2E may still exercise setup under `TEST_MODE` (writes `private.test.ts`). **Do not soft-skip control-map E2E** — seed via `/api/testing`.
5.  **White-Box Unit Testing**: Use purely in-memory mocks (configured in `tests/unit/bun-preload.ts`) for configuration and database adapters. Unit tests must remain decoupled from the physical filesystem and should not depend on a pre-existing `config/private.ts`.
6.  **Strict Case-Sensitivity (Linux/CI)**: ALL `.svelte` files and ALL widget folders MUST be strictly lowercase (kebab-case). Linux-based CI runners will fail with "Module not found" or "404" errors if imports or glob patterns do not match the exact casing on disk. Standardize all imports to lowercase.
7.  **Robust Path Aliases**: Always use standard path aliases (`@src`, `@widgets`, `@utils`, etc.) instead of fragile relative paths like `../../../src/...`. Ensure aliases are synchronized via `bun x svelte-kit sync` before running checks.
8.  **DB Seeding**: Safety checks prevent accidental production seeding.
9.  **TS Errors**: Run `bun x svelte-kit sync` to regenerate types.
10. **OS-Aware Commands (CRITICAL)**: Always check the operating system before issuing shell commands. On Windows (PowerShell), NEVER use `&&` for chaining commands. Use `;` instead, or issue commands separately.
    - ✅ Windows: `bun install; bun run dev`
    - ✅ Linux/macOS: `bun install && bun run dev`
    - ⚠️ **Windows `bun install` corruption**: If `bun install` fails on Windows, use `npm install` as a workaround (see Common Development Issues section 3).

## Test-to-Docs Cross-Reference

> [!TIP]
> Every test suite has corresponding documentation. When modifying tests, update the linked docs.

| Test File                                          | Documentation                                                                                       |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `tests/unit/hooks/defense-in-depth.test.ts`        | `docs/reference/security/index.mdx`, `docs/tests/security-testing.mdx`                              |
| `tests/unit/hooks/authentication.test.ts`          | `docs/reference/security/login-security.mdx`, `docs/tests/hook-test-coverage.mdx`                   |
| `tests/unit/hooks/authorization.test.ts`           | `docs/tests/rbac-testing.mdx`, `docs/reference/security/index.mdx`                                  |
| `tests/unit/hooks/system-state.test.ts`            | `docs/tests/hook-test-coverage.mdx`, `docs/reference/architecture/state-management.mdx`             |
| `tests/unit/hooks/setup.test.ts`                   | `docs/tests/hook-test-coverage.mdx`, `docs/guides/configuration/setup-wizard.mdx`                   |
| `tests/unit/hooks/security-headers.test.ts`        | `docs/tests/hook-test-coverage.mdx`, `docs/reference/security/index.mdx`                            |
| `tests/unit/auth/role-permission-access.test.ts`   | `docs/tests/rbac-testing.mdx`                                                                       |
| `tests/unit/api/media-security.test.ts`            | `docs/reference/security/widget-security.mdx`                                                       |
| `tests/unit/services/media-manipulation.test.ts`   | `docs/tests/utility-test-coverage.mdx`, `docs/reference/architecture/live-preview-architecture.mdx` |
| `tests/unit/services/media-service.test.ts`        | `docs/tests/utility-test-coverage.mdx`                                                              |
| `tests/benchmarks/security-audit.test.ts`          | `docs/reference/security/quantum-security.mdx`, `docs/project/benchmarks/index.mdx`                 |
| `tests/benchmarks/**/*.test.ts`                    | `docs/tests/benchmark-matrix.mdx`, `docs/project/benchmarks/index.mdx`                              |
| `tests/e2e/accessibility.spec.ts`                  | `docs/tests/accessibility-audit.mdx`                                                                |
| `tests/e2e/branding.spec.ts`                       | `docs/reference/architecture/multi-tenancy.mdx`                                                     |
| `tests/e2e/visual-regression.spec.ts`              | `docs/tests/accessibility-audit.mdx`                                                                |
| `tests/unit/security/token-secret-leakage.test.ts` | `docs/reference/security/secrets-inventory.mdx`                                                     |
| `tests/unit/scripts/scan-secret-misuse.test.ts`    | `docs/reference/security/secrets-inventory.mdx`                                                     |
| `tests/unit/widgets/core/*.test.ts`                | `docs/tests/widget-test-coverage.mdx`                                                               |

## Key Files Reference

| Category        | Key Files                                                                                                                                                                                                        |
| :-------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **DB & Auth**   | `db.ts`, `dbInterface.ts`, database adapters like mongo, drizzle, etc.                                                                                                                                           |
| **Security**    | `+server.ts`, `handle-authentication.ts`, `handle-system-state.ts`, `system.ts`, `media.ts`, `setup.ts`                                                                                                          |
| **Content**     | `types.ts`, `collectionScanner.ts`, `config/collections/`                                                                                                                                                        |
| **Widgets**     | `widget-factory.ts`, `widget-store.svelte.ts`                                                                                                                                                                    |
| **API**         | `routes/api/`, `hooks.server.ts`                                                                                                                                                                                 |
| **Admin Theme** | `admin-page-shell.svelte`, `admin-card.svelte`, `theme-context.svelte.ts`, `theme-merge.ts`                                                                                                                      |
| **Benchmarks**  | `benchmark-reporting.ts`, `benchmark-history.ts`, `benchmark-analysis.ts`, `benchmark-mdx.ts`, `benchmark-executive.ts`, `scripts/benchmark-matrix/` (16 files — regression-detector, reporting, runner, config) |
| **Build**       | `vite.config.ts`, `svelte.config.js`, `tailwind.config.js`                                                                                                                                                       |

## Path Aliases

```
@src → ./src          @components → ./src/components   @databases → ./src/databases
@config → ./config    @utils → ./src/utils             @stores → ./src/stores
@widgets → ./src/widgets  @services → ./src/services   $paraglide → ./src/paraglide
```

## Getting Help

- **Documentation:** `./docs/` (incl. roadmap, evaluation); widgets have `.mdx`.
- **GitHub:** https://github.com/SveltyCMS/SveltyCMS (Discussions, Issues).
- **Discord:** https://discord.gg/qKQRB6mP.
- **Website:** https://sveltycms.com (homepage), https://marketplace.sveltycms.com, https://docs.sveltycms.com, https://telemetry.sveltycms.com.
- **Security:** security@sveltycms.com.

## Version Control

- Branches: `next` (dev), `main` (stable).
- **Release flow**: All work happens on `next`. When stable, `next` is merged into `main`. The maintainer then manually tags the release:
  ```bash
  git tag v0.0.7
  git push --tags
  ```
  Pushing a `v*` tag triggers the auto-release workflow: npm publish + GitHub Release with auto-generated notes from commits since the last tag.
- **Commit Convention**: Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `security:`, `perf:`). Commit prefixes inform the auto-generated release notes but do NOT drive version bumps — the maintainer chooses the version.
- **Version source**: Git tags are the source of truth. The `package.json` version on `next` is for UI display only. NEVER manually bump `package.json` version — it gets set from the tag during release.
- **Commit Attribution**: NEVER include `Co-Authored-By` or any AI-attribution lines in commit messages unless explicitly requested by the USER for a specific commit. All work should appear as the USER's own work for seamless integration into enterprise workflows.
- **Pre-commit 100% enforcement (hardened)**: The `.githooks/pre-commit`, `.githooks/pre-push`, and `scripts/precheck.ts` have been made as strict as client-side Git hooks reasonably allow:
  - No convenient local `GIT_HOOK_SKIP` (only real CI envs bypass).
  - **Enhanced pre-push**: Progress dashboard with adaptive ETA, per-task timing, and error remediation hints (`→ Run: bun run check`). Dry-run with `--plan` to inspect task selection without executing.
  - **ciJob parity validation**: `validateCiParity()` scans `ci.yml` on every local run to ensure task `ciJob` fields match actual CI job names — prevents drift.
  - The gate **ends with a literal final re-execution** of the documented parity commands (including `lint:docs`).
  - Multiple fail-closed "tree must be clean" checks (after format + at the absolute end).
  - Both pre-commit (fast full gate) and pre-push (build + unit tests) are required. Production build always runs on push when any files changed.
  - **Import validation**: `scripts/validate-imports.ts` scans ALL imports in `src/` and `tests/` — catches stale paths from file moves without a full build. Runs in ~200ms as part of pre-push.

  - **Hardened Git Wrapper**: `scripts/git-safe.ts` blocks `--no-verify` on `commit` and `push`. Use it via `bun run git commit` / `bun run git push` or alias `git` to `bun run scripts/git-safe.ts`. Using raw `git --no-verify` requires explicitly invoking `/usr/bin/git` (or the full system path), making bypass a conscious and deliberate act rather than a muscle-memory flag. **If the gate fails, FIX the underlying issue — never bypass the gate.**

  **Realistic maximum**: Client-side hooks can always be bypassed (you control your own machine). The only true 100% guarantee is GitHub branch protection rules that require green status checks before merge to `next` or `main`. The hardened wrapper, local hooks, and final parity re-verification are defense-in-depth + team culture.

- **Roadmap Checklist**: Benchmark MDX reports show full truth tables matching single-test console output.
- [x] **Smart Benchmark Regression Detection**: Statistical slope analysis, flapping detection, cross-DB correlation, budget forecasting. See `docs/tests/benchmark-matrix.mdx`.
- [x] **Progress Dashboard on Pre-Push**: Enhanced git hooks with live progress bar, ETA, per-task timing, and error remediation hints.
- [x] **CI Build Hardening**: Production build job gated to main/PR only; depends on check + unit passing first.
- [x] **Plugin Capability Reconciliation**: Merged core + plugin catalog, owner auto-inheritance, boot reconcile, hasCapability(string & {}). See `src/services/security/capability-registry.ts`.
- [x] **Encrypted Plugin Settings**: AES-256-GCM secret fields, versioned envelope, server-only decryption, masked API responses, validation on save. See `src/plugins/settings-crypto.ts`.
- [x] **Schema Desugaring (Sugar Types)**: Shortcut field types expand to full objects while preserving access/validation/groups. Extensible registry. See `src/widgets/desugar-field.ts`.
- [x] **Plugin Part System (definePlugin)**: Discriminated union, mandatory requiredCapabilities on routes, part resolution at boot. See `src/plugins/define-plugin.ts`.
- [x] **AdminArea Shell Extensions**: Typed admin chrome extensions for plugins. See `src/plugins/admin-area.ts`.
- [x] **Visual Editing Bridge Fix**: preview-bridge.ts only cancels navigation clicks (not checkboxes/details). stegaClean + usePreview() rune.
- [ ] **Benchmark MDX reports show full truth tables (borders, titles, all data) matching single-test console output**

---

_Last Updated: 2026-07-18_
