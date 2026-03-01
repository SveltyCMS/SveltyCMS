# AGENTS.md

This file provides comprehensive guidance to **AI Coding Assistants (Agents)** (such as Antigravity, Warp, Cursor, etc.) when working with the SveltyCMS codebase.

> [!IMPORTANT]
> **AI Agents: You MUST read this file in its entirety before performing any code modifications or architectural changes.** This document ensures you adhere to the project's strict standards for security, performance, and accessibility. For Svelte 5 rune best practices, reference [svelte.dev/llms-full.txt](https://svelte.dev/llms-full.txt), emphasizing fine-grained reactivity, deep state mutations, and avoiding legacy stores.

## Table of Contents

- [Project Overview](#project-overview)
- [Core Philosophy & Focus](#core-philosophy--focus)
- [Competitive Awareness](#competitive-awareness)
- [Technical Standards](#technical-standards)
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

SveltyCMS is a powerful headless CMS built with SvelteKit 2, Svelte 5, TypeScript, Tailwind CSS v4, and Skeleton.dev v4. It features a database-agnostic architecture (MongoDB, MariaDB/MySQL, PostgreSQL, SQLite — all production-ready), GraphQL/REST APIs, multi-language support via Paraglide JS (compile-time, zero-runtime), and a modular widget-based content modeling system. Designed for edge compatibility, zero-runtime overhead, and enterprise readiness.

## Core Philosophy & Focus

- **Data Security & Ownership**: Security is paramount—users always own their data. Implement strict protocols (e.g., no direct DB access outside adapters, secure headers).
- **Performance & Optimization**: Target sub-millisecond latency with tree-shaking, SSR-first architecture, SvelteKit 5 Server Functions, Valibot, Vite optimizations, and <1s cold starts via progressive initialization.
- **Universal Accessibility**: WCAG 2.2 AA and ATAG 2.0 compliant (full keyboard support, ARIA-live regions).
- **Premium Design**: Modern UX with Skeleton.dev v4 for white-labeling and deep theming.
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
| **Audit Logs**    | Crypto-chained (SHA-256 tamper-evident)   | Compliance-ready vs. basic/manual in competitors.        |
| **Accessibility** | WCAG 2.2 AA / ATAG 2.0                    | Full support vs. partial in Payload/Strapi.              |

To stay ahead: Implement cleaner features (e.g., isomorphic plugins > Payload's rebuilds), benchmark Core Web Vitals, and promote "Agency OS" for low TCO.

## Technical Standards

- **Modern Stack**: Latest TypeScript (^5.9.3), Node.js (>=24), Svelte 5 (^5.46.4), Vite 7 (^7.3.1), Bun (3-4x faster runtime)
- **Code Quality**: Verify with `bun run lint && bun run check` before commits. Use the hybrid Biome/ESLint setup (orchestrated by Ultracite) for sub-second formatting and comprehensive linting.

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
5. **Accessibility**: Ensure keyboard-navigable, ARIA-compliant components with live regions.
6. **Database Agnosticism**: Confine logic to adapters; scope by `tenantId`.
7. **File Headers**: Always include as defined.
8. **Roadmap Alignment**: Prioritize gaps like full SAML/SCIM hardening; optimize for enterprise (e.g., lighter SAML deps).
9. **MCP Knowledge Base (CRITICAL)**: Always query the hosted MCP server at `https://mcp.sveltycms.com/mcp` when in doubt about SveltyCMS architecture, schema conventions, or widget syntax, as it holds the verified source of truth. Utilize MCP connections for dynamic generation flows.

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

From the 2026 roadmap (v0.0.6, target A+ grade), prioritize these for parity/leadership (some beta/implemented; harden for production):

- [x] **MCP AI Knowledgebase Server (v1.0 Plan)**: Native Model Context Protocol server exposing CMS docs, schemas, and APIs. Uses LanceDB for vector storage and FastEmbed for in-process embeddings. Enables agentic workflows.
- [ ] **n8n Automation Integration**: Native and secure integration with n8n for low-code workflows and competitive automation features.
- [ ] **SAML 2.0 / Enterprise SSO**: Add via BoxyHQ or native @node-saml; support IdPs (Okta, Azure); timeline: Q1-Q2 (4-6 weeks).
- [x] **Crypto-Chained Audit Logs (v1.1)**: SHA-256 tamper-evident logs with real-time security dashboard.
- [x] **Self-Healing State Machines**: Custom Svelte store-based state machine with auto-recovery lifecycle (IDLE → READY <1s).
- [x] **Live Preview (v2.0)**: Enterprise handshake protocol with secure tokens; iframe + editable.website integration.
- [x] **Automation System (v1.0)**: GUI-based workflow engine for event-triggered actions.
- [ ] **Edge Computing & Multi-Region**: Multi-region deployment guides and edge-optimized data fetching.
- [x] **Real-Time Collaboration (SSE v1.0)**: Lightweight activity stream, AI assistant, and peer collaboration.
- [ ] **BuzzForm Visual Builder (v1.5)**: Visual drag-and-drop form/collection builder with real-time preview hardening.
- [/] **Image Editor Enhancement**: Current implementation stabilized; adding cropping, filters, and focal point management.
- [/] **Collection Builder Enhancement**: UX improvements and ergonomic field management in progress.
- [x] **CI Pipeline Restoration**: Playwright E2E suite stabilized across MongoDB, MariaDB, and PostgreSQL.
- [ ] **Svelte 5 / Skeleton v4 Migration**: Ongoing hardening of UI components using the latest runes and design tokens.

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

## Project Structure

- **CMS (`/src`)**: Core logic, adapters, services, widgets (each with `.mdx` docs).
- **Documentation (`/docs`)**: Guides, roadmap, evaluations.
- **Tests (`/tests`)**: Unit (Bun), integration, E2E (Playwright).

## Development Commands

| Category      | Command                    | Description                    |
| ------------- | -------------------------- | ------------------------------ |
| Daily Dev     | `bun run dev`              | Dev server (auto-setup wizard) |
|               | `bun run build`            | Production build               |
|               | `bun run preview`          | Preview on localhost:4173      |
| Code Quality  | `bun run check`            | Type checking                  |
|               | `bun run lint`             | Hybrid Lint (Biome + ESLint)   |
|               | `bun run format`           | Fast Format (Biome)            |
| Testing       | `bun run test:unit`        | Unit tests                     |
|               | `bun run test:integration` | Integration (DB required)      |
|               | `bun run test:e2e`         | E2E (Playwright)               |
| DB Operations | `bun run db:push`          | Push schema changes (Drizzle)  |
| i18n          | `bun run paraglide`        | Compile messages               |
| Diagnostics   | `bun run check:mongodb`    | Test MongoDB connection        |

## Architecture Overview

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
import { createWidget } from '@widgets/widgetFactory';
import * as v from 'valibot';

export default createWidget<{ maxLength?: number }>({
	Name: 'myWidget',
	validationSchema: (field) => v.string([v.maxLength(field.maxLength ?? 100)]),
	GuiSchema: { maxLength: { widget: 'number', label: 'Max Length' } }
});
```

### Content & Collection System

Hybrid code/GUI with TS → JS → DB sync.

### Middleware Pipeline (hooks.server.ts)

Order: Compression → Caching → System State (self-healing) → Rate Limit → Firewall → Setup → Locale → Theme → Auth → Authorization → API Logic → Token Resolution → Security Headers.

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
4. **Type Safety & Validation**: Valibot schemas.
5. **Error Handling & Logging**: Try-catch with structured logger.
6. **Permissions**: `hasPermissionWithRoles()`.
7. **i18n**: Paraglide messages.
8. **API Responses**: Consistent `{ data, message }` or `{ error, code }`.

## Common Pitfalls

1.  **Circular Dependencies**: Use dynamic imports for service initialization.
2.  **HMR Reloads**: Expected for collections/widgets. Full page reload is normal.
3.  **Setup Wizard**: Let it generate `config/private.ts`. Do NOT create manually.
4.  **Black-Box Testing (CI/CD)**: In E2E and integration test workflows, DO NOT manually create or bypass the configuration logic with fake `private.test.ts` files. Always orchestrate the tests to hit the Setup Wizard natively using Playwright, thereby letting the CMS naturally generate `config/private.ts` just like a real user.
5.  **DB Seeding**: Safety checks prevent accidental production seeding.
6.  **TS Errors**: Run `bunx svelte-kit sync` to regenerate types.
7.  **Competitor Parity**: Use runes for lighter UIs vs. React hydration.

## Key Files Reference

| Category      | Key Files                                                                    |
| :------------ | :--------------------------------------------------------------------------- |
| **DB & Auth** | db.ts`, `dbInterface.ts`, database adapters like mongo, drizzle, etc.        |
| **Content**   | `types.ts`, `collectionScanner.ts`, `config/collections/`                    |
| **Widgets**   | `widget-factory.ts`, `widget-store.svelte.ts`                                |
| **API**       | `routes/api/`, `hooks.server.ts`                                             |
| **Services**  | `settingsService.ts`, `scheduler/`, `AuditLogService.ts`,`MetricsService.ts` |
| **Build**     | `vite.config.ts`, `svelte.config.js`, `tailwind.config.js`                   |

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
- Commits: Conventional (`feat:`, `fix:`, `docs:`); include `Co-Authored-By: <agent>`.
- Pre-commit: `bun run lint && bun run check`.

---

_Last Updated: 2026-02-24_
