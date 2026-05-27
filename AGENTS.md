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
- **Performance & Optimization**: Target sub-millisecond latency with tree-shaking, SSR-first architecture, SvelteKit 5 Server Functions, Valibot, Vite optimizations, and <1s cold starts via progressive initialization. **We continuously monitor benchmarks (see `docs/project/benchmarks.mdx`) to ensure we remain the fastest Java-enterprise-ready CMS, aiming for sub-10ms persistence and outperforming traditional enterprise platforms.**

- **Universal Accessibility**: WCAG 2.2 AA and ATAG 2.0 compliant (full keyboard support, ARIA-live regions); **built for WCAG 3.0 Functional Performance standards with native Svelte 5 components.**
- **Premium Design**: Modern UX with native Svelte 5 components and Tailwind v4 for white-labeling and deep theming.
- **Maximum Flexibility**: Hybrid code/GUI schemas with bi-directional sync.
- **Developer First**: Support contributors with clear docs, tools, and Svelte 5 runes for efficient reactivity.

## Competitive Awareness (Smarter, Faster, Better)

SveltyCMS alwaysoutperforms competitors like Payload CMS (React/Next.js-based), Strapi (GUI-first, heavier), Directus, Sanity, WordPress, and Drupal by leveraging Svelte 5's no-runtime compilation and unique features. From the 2026 technical evaluation:

| Feature           | SveltyCMS Approach                        | Why Better than Competitors                              |
| ----------------- | ----------------------------------------- | -------------------------------------------------------- |
| **Core Tech**     | SvelteKit/Svelte 5 (Runes)                | No VDOM/hydration tax vs. React-based (Payload, Strapi). |
| **Cold Start**    | <1s (Progressive, self-healing)           | Faster than 3s+ in Payload/Strapi; edge-ready.           |
| **i18n**          | Paraglide (Compiled, zero-runtime)        | Type-safe, no runtime lookups vs. i18next in rivals.     |
| **Schemas**       | Hybrid (Code + GUI, bi-directional)       | Flexible vs. code-only (Payload) or GUI-only (Strapi).   |
| **Multi-Tenancy** | Native (tenantId isolation)               | Core/free vs. enterprise-gated in Strapi/Contentful.     |
| **SCIM 2.0**      | Native endpoints (RFC 7644, filters/bulk) | Automated provisioning vs. manual/enterprise in others.  |
| **OpenAPI 3.1.0** | Dynamic Export & SDK Ready                | Generate clients for any language automatically.         |
| **Audit Logs**    | Crypto-chained (SHA-256 tamper-evident)   | Compliance-ready vs. basic/manual in competitors.        |
| **Accessibility** | WCAG 2.2 AA / ATAG 2.0                    | Full support vs. partial in Payload/Strapi.              |

To stay ahead: Implement cleaner features (e.g., isomorphic plugins > Payload's rebuilds), benchmark Core Web Vitals, and promote "Agency OS" for low TCO.

## Technical Standards

- **Modern Stack**: Latest TypeScript (^5.9.3), Node.js (>=24), Svelte 5 (^5.46.4), Vite 7 (^7.3.1), Bun (3-4x faster runtime)
- **Code Quality**: Ensure 100% CI parity by running `bun run format && bun run lint && bun run check && bun run test:unit && bun run test:unit:bun` before every push. This performs comprehensive formatting (oxfmt), linting (oxlint), type checking (svelte-check), and executes all 741+ unit tests in both Vitest (exhaustive jsdom) and Bun (fast native).

| Category          | Convention           | Examples                                                 |
| :---------------- | :------------------- | :------------------------------------------------------- |
| **Naming**        | `camelCase`          | `dbAdapter`, `loadSettings` (logic, variables, props)    |
|                   | `PascalCase`         | `Auth`, `MediaService` (types, interfaces, classes)      |
|                   | `kebab-case`         | `user-avatar.svelte`, `auth-service.ts` (files, folders) |
|                   | `UPPER_SNAKE_CASE`   | `DB_TYPE`, `DEFAULT_THEME` (global constants)            |
| **Documentation** | **Mandatory Header** | `@file`, `@description`, `Features:`                     |

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

### 2. SSO & SAML Security

- **No Hard-coded Secrets**: All SSO/SAML secrets (Jackson verifiers, JWT signing keys) MUST be stored in `config/private.ts` and validated via `privateConfigSchema`.
- **Uniqueness**: Each deployment must have its own unique, high-entropy secrets.

### 3. API Authorization (Granular Gatekeeping)

- **POST-Authentication Check**: Authentication (knowing _who_ someone is) is necessary but not sufficient.
- **Enforcement**: All API requests in `src/routes/api/[...path]/+server.ts` must pass through `checkEndpointPermission` using the `ENDPOINT_PERMISSIONS` mapping.
- **RBAC**: Use `hasPermissionWithRoles` to validate specific actions (e.g., `manage:user`, `manage:collection`).

### 4. Account Protection & Lockout

- **Password Strength**: Minimum 8 characters (default, configurable via `PASSWORD_MIN_LENGTH` in `src/databases/schemas.ts`), including uppercase, lowercase, numbers, and special characters. Enforced via `Auth.validatePasswordStrength`.
- **Brute-Force Prevention**: Accounts are automatically locked for 15 minutes after 5 consecutive failed attempts.
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
3. **Leverage Modern SvelteKit Patterns**:
   - **SSR-First**: Prioritize Server-Side Rendering for critical paths (e.g., Setup, Collection Loading) to ensure fast FCP.
   - **Server Functions (Remote Functions)**: Prefer SvelteKit 5 Server Functions in `+page.server.ts` over standalone API routes for type safety and reduced network complexity.
   - **Middleware Security**: Respect the sequential middleware pipeline in `hooks.server.ts`. All requests are gated by `handleSystemState` for self-healing and security.
   - **Self-Healing State**: Use the `@stores/system` state machine (`IDLE` → `READY`) for resilient startup. reference `docs/architecture/state-management.mdx`.
4. **Strict Type Safety**: No `any`; use discriminated unions and Valibot for E2E validation.
5. **Accessibility**: Ensure keyboard-navigable, ARIA-compliant components with live regions. Reference `docs/tests/accessibility-audit.mdx` for WCAG 3.0 & ATAG 2.0 compliance testing. All interactive elements MUST have accessible names (`aria-label`, `aria-labelledby`, or matching `id`+`label`). Use Tailwind v4 logical properties (`ps-4`, `pe-2`) instead of directional ones (`pl-4`, `pr-2`) for RTL compatibility.
6. **Database Agnosticism**: Confine logic to adapters; scope by `tenantId`.
7. **File Headers**: Always include as defined.
8. **Roadmap Alignment**: Prioritize gaps like full SAML/SCIM hardening; optimize for enterprise (e.g., lighter SAML deps).
9. **MCP Knowledge Base (CRITICAL)**: Always query the hosted MCP server at `https://mcp.sveltycms.com/mcp` when in doubt about SveltyCMS architecture, schema conventions, or widget syntax, as it holds the verified source of truth. Utilize MCP connections for dynamic generation flows.
10. **Performance Awareness**: Every change must consider the "sub-10ms persistence" goal. Avoid heavy runtime dependencies and prioritize Svelte 5 runes for fine-grained reactivity.
11. **Empirical Performance Verification**: When implementing logic enhancements or optimizations:
    - **Baseline**: Run the relevant benchmark (e.g., `bun run scripts/benchmark-matrix/index.ts --only=REST`) BEFORE applying changes.
    - **Verification**: Run the same benchmark AFTER implementation.
    - **Commit Messages**: Do NOT add `Co-Authored-By` or AI tags.
12. **Security Regression Test (CRITICAL)**: Before committing any change touching `src/hooks/`, `src/routes/api/`, or `src/routes/(app)/`, run the fast security regression suite:
    ```bash
    bun test tests/unit/hooks/defense-in-depth.test.ts tests/unit/hooks/authentication.test.ts tests/unit/hooks/authorization.test.ts tests/unit/role-permission-access.test.ts
    ```
    This validates all 4 security layers (Middleware → Dispatcher → Handler → Page Action) in under 1 second.

### Mandatory Documentation Updates

> [!CAUTION]
> **When implementing ANY new feature, you MUST update documentation.** Incomplete documentation is a blocking issue.

**For ALL new features, always update:**

- [ ] `docs/project/roadmap-2026.mdx` - Mark progress, add new items
- [ ] `AGENTS.md` roadmap checklist (if feature is listed)
- [ ] Create/update relevant MDX doc in appropriate `docs/` subdirectory

**Feature-Specific Documentation:**

### Documentation Matrix

| Feature Type        | Primary MDX Location                         | Also Update                     |
| :------------------ | :------------------------------------------- | :------------------------------ |
| **Database**        | `docs/database/`                             | `technical-evaluation-2026.mdx` |
| **Auth/Security**   | `docs/database/Authentication_System.mdx`    | `technical-evaluation-2026.mdx` |
| **UI/UX**           | `docs/guides/`                               | Widget docs if applicable       |
| **Content/Preview** | `docs/guides/Live_Preview_Architecture.mdx`  | Integration docs                |
| **Widgets**         | `docs/widgets/`                              | `widget-system-overview.mdx`    |
| **API**             | `docs/api/`                                  | Relevant service docs           |
| **Performance**     | `docs/database/Performance_Architecture.mdx` | `technical-evaluation-2026.mdx` |

**Key Documentation Files:**

- `docs/database/` - Database adapters, auth, cache, performance
- `docs/guides/` - Feature guides (Live Preview, Error Handling, etc.)
- `docs/widgets/` - Per-widget documentation
- `docs/project/roadmap-2026.mdx` - Roadmap and gap analysis
- `docs/project/technical-evaluation-2026.mdx` - Competitive comparison

## Roadmap (Missing Features)

From the 2026 roadmap (target A++ grade), prioritize these for parity/leadership (some beta/implemented; harden for production):

- [x] **PostgreSQL Support**: Full adapter implementation with Drizzle ORM migrations and native tenant management.
- [x] **SQLite Support**: Lightweight adapter via Bun native driver for edge and local deployments.
- [x] **SCIM 2.0 (v1.1)**: Native endpoints (/scim/v2/Users, Groups, Bulk); support filters (eq, co), PATCH ops; integration ready for Okta/Azure.
- [x] **SAML 2.0 / Enterprise SSO**: Full integration via BoxyHQ (@boxyhq/saml-jackson) for enterprise identity providers (Okta, Azure).
- [x] **Edge Computing & Multi-Region**: Native support for edge-optimized data fetching and multi-region replication.
- [x] **BuzzForm Visual Builder (v1.5)**: Production-ready drag-and-drop form/collection builder with real-time preview.
- [x] **Secure Media Engine (v1.2)**: Native SSRF protection, command injection prevention (spawn-based), and hardened directory traversal.
- [x] **OpenAPI 3.1.0**: Dynamic specification export for automated SDK generation and documentation.
- [x] **99.9% Self-Healing Cache**: Incremental file scanning (mtime-hashing) and smart structural reconciliation.
- [x] **High-Performance Local API**: Zero-latency server-side CRUD bridge with full widget logic parity. **Achieved <0.05ms average latency for core operations.**
- [x] **Enterprise Performance Auditing**: 20+ standardized benchmarks with high-fidelity ASCII telemetry. **Includes 1,000-collection stress audits.**
- [x] **4-Layer Defense-in-Depth Security**: Cookie prefix hardening, setup completion gating, handler-level admin verification, media permission checks, centralized permission guards, and timing-safe test secret comparison. **849 unit tests, 51 new security tests, 0 regressions.**
- [x] **Hardened Relation Token Engine**: Resolved field property access bugs and implemented high-performance Bearer token validation with multi-tenant isolation.
- [x] **Sub-Millisecond Content Scanner**: Implemented Persistent Mtime Tree (Dirty Bits), Batch Cache Retrieval (`getMany`), and Worker Thread Pooling.
- [x] **Image Editor Enhancement**: Current implementation stabilized; adding cropping, filters, and focal point management.
- [x] **Collection Builder Enhancement**: UX improvements and ergonomic field management in progress.
- [x] **CI Pipeline Restoration**: Playwright E2E suite stabilized across MongoDB, MariaDB, and PostgreSQL.
- [x] **Native Svelte 5 Component Library**: 37 native UI components replacing all third-party dependencies with Tailwind v4 theming.
- [x] **Automated Upgrade CLI**: Integrated `scripts/upgrade.ts` for safe, automated core updates.
- [x] **Enterprise SEO Suite**: High-performance multi-tenant Redirect Manager and Dynamic Sitemap.xml with i18n/hreflang support.
- [x] **Negative Caching Engine**: Implemented Bloom-filter style missing-key cache achieving a verified **2392x speedup** for repeated misses.
- [x] **Zero-Tax SDK Dispatcher**: Refactored `LocalCMS` with Hot-Swap self-overwriting getters, achieving **0% middleware overhead**.
- [x] **Universal Accessibility Auditing**: Implemented automated Axe-Core E2E test suites, RTL directionality layout mirroring audits, build-time Widget Accessibility Static Analysis Validator, and documented State-Bound Focus Restoration.

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

- `better-sqlite3` can't compile without Python/build tools, halting the entire install
- Bun may corrupt transitive dependencies (e.g., missing `drizzle-orm/sql/`, empty `@zag-js/` directories)

**Symptoms**:

- `bun install` dies with `gyp ERR! find Python` at `better-sqlite3`
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

## Project Structure

- **CMS (`/src`)**: Core logic, adapters, services, widgets (each with `.mdx` docs).
- **Documentation (`/docs`)**: Guides, roadmap, evaluations.
- **Tests (`/tests`)**: Unit (Bun), integration, E2E (Playwright).

## Development Commands

| Category      | Command                                                                                                                             | Description                                                |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Daily Dev     | `bun run dev`                                                                                                                       | Dev server (auto-setup wizard)                             |
|               | `bun run build`                                                                                                                     | Production build                                           |
|               | `bun run preview`                                                                                                                   | Preview on 127.0.0.1:4173                                  |
| Code Quality  | `bun run check`                                                                                                                     | Type checking                                              |
|               | `bun run lint`                                                                                                                      | Fast Lint (oxlint)                                         |
|               | `bun run format`                                                                                                                    | Fast Format (oxfmt)                                        |
| Testing       | `bun run test:unit`                                                                                                                 | Unit tests (Vitest/jsdom) — 854 tests                      |
|               | `bun run test:unit:bun`                                                                                                             | Unit tests (Bun Native)                                    |
|               | `bun run test:integration`                                                                                                          | Integration (DB required)                                  |
|               | `bun run test:e2e`                                                                                                                  | E2E (Playwright)                                           |
| **Security**  | `bun test tests/unit/hooks/defense-in-depth.test.ts tests/unit/hooks/authentication.test.ts tests/unit/hooks/authorization.test.ts` | Fast security regression check (69 tests)                  |
| DB Operations | `bun run db:push`                                                                                                                   | Push schema changes (Drizzle)                              |
| i18n          | `bun run paraglide`                                                                                                                 | Compile messages                                           |
| Diagnostics   | `bun run check:mongodb`                                                                                                             | Test MongoDB connection                                    |
| **CI Parity** | `bun run format && bun run lint && bun run check && bun run test:unit && bun run test:unit:bun`                                     | **Mandatory before commit** (performs full local CI check) |

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
6. **Error Handling & Logging**: Try-catch with structured logger.
7. **Permissions**: `hasPermissionWithRoles()`.
8. **i18n**: Paraglide messages.
9. **API Responses**: Consistent `{ data, message }` or `{ error, code }`.

## Common Pitfalls

1.  **Circular Dependencies**: Use dynamic imports for service initialization.
2.  **HMR Reloads**: Expected for collections/widgets. Full page reload is normal.
3.  **Setup Wizard**: Let it generate `config/private.ts`. Do NOT create manually.
4.  **Black-Box Testing (CI/CD)**: In E2E and integration test workflows, DO NOT manually create or bypass the configuration logic with fake `private.test.ts` files. Always orchestrate the tests to hit the Setup Wizard natively using Playwright, thereby letting the CMS naturally generate `config/private.ts` just like a real user. This ensures the entire system lifecycle is validated.
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

| Test File                                   | Documentation                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------ |
| `tests/unit/hooks/defense-in-depth.test.ts` | `docs/architecture/security/index.mdx`, `docs/tests/security-testing.mdx`            |
| `tests/unit/hooks/authentication.test.ts`   | `docs/architecture/security/login-security.mdx`, `docs/tests/hook-test-coverage.mdx` |
| `tests/unit/hooks/authorization.test.ts`    | `docs/tests/rbac-testing.mdx`, `docs/architecture/security/index.mdx`                |
| `tests/unit/hooks/system-state.test.ts`     | `docs/tests/hook-test-coverage.mdx`, `docs/architecture/state-management.mdx`        |
| `tests/unit/hooks/setup.test.ts`            | `docs/tests/hook-test-coverage.mdx`, `docs/guides/configuration/setup-wizard.mdx`    |
| `tests/unit/hooks/security-headers.test.ts` | `docs/tests/hook-test-coverage.mdx`, `docs/architecture/security/index.mdx`          |
| `tests/unit/role-permission-access.test.ts` | `docs/tests/rbac-testing.mdx`                                                        |
| `tests/unit/api/media-security.test.ts`     | `docs/architecture/security/widget-security.mdx`                                     |
| `tests/benchmarks/security-audit.test.ts`   | `docs/architecture/security/quantum-security.mdx`, `docs/project/benchmarks.mdx`     |
| `tests/e2e/accessibility.spec.ts`           | `docs/tests/accessibility-audit.mdx`                                                 |
| `tests/unit/widgets/core/*.test.ts`         | `docs/tests/widget-test-coverage.mdx`                                                |

## Key Files Reference

| Category      | Key Files                                                                                               |
| :------------ | :------------------------------------------------------------------------------------------------------ |
| **DB & Auth** | `db.ts`, `dbInterface.ts`, database adapters like mongo, drizzle, etc.                                  |
| **Security**  | `+server.ts`, `handle-authentication.ts`, `handle-system-state.ts`, `system.ts`, `media.ts`, `setup.ts` |
| **Content**   | `types.ts`, `collectionScanner.ts`, `config/collections/`                                               |
| **Widgets**   | `widget-factory.ts`, `widget-store.svelte.ts`                                                           |
| **API**       | `routes/api/`, `hooks.server.ts`                                                                        |
| **Services**  | `settingsService.ts`, `scheduler/`, `AuditLogService.ts`,`MetricsService.ts`                            |
| **Build**     | `vite.config.ts`, `svelte.config.js`, `tailwind.config.js`                                              |

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
- **Commit Attribution**: **NEVER** include `Co-Authored-By` or any AI-attribution lines in commit messages unless explicitly requested by the USER for a specific commit. All work should appear as the USER's own work for seamless integration into enterprise workflows.
- Commits: Conventional (`feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`, `security:`, `perf:`).
- Pre-commit: `bun run format && bun run lint && bun run check && bun run test:unit && bun run test:unit:bun` (100% CI parity).
- **Roadmap Checklist**: Add Universal Accessibility Auditing to CI/CD pipeline.

---

_Last Updated: 2026-05-24_
