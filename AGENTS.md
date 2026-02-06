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

SveltyCMS is a powerful headless CMS built with SvelteKit 2, Svelte 5, TypeScript, Tailwind CSS v4, and Skeleton.dev v4. It features a database-agnostic architecture (MongoDB, MariaDB/MySQL production-ready; PostgreSQL beta), GraphQL/REST APIs, multi-language support via Paraglide JS (compile-time, zero-runtime), and a modular widget-based content modeling system. Designed for edge compatibility, zero-runtime overhead, and enterprise readiness.

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

- **Modern Stack**: Latest TypeScript (^5.9.3), Node.js (>=24), Svelte 5 (^5.46.4), Vite 7 (^7.3.1), Bun (3-4x faster runtime), Nx Monorepo (^22.3.3) for caching.
- **Code Quality**: Verify with `bun run format && bun run check` before commits.

| Category     | Convention           | Examples                                                   |
| ------------ | -------------------- | ---------------------------------------------------------- |
| Naming       | camelCase            | `dbAdapter`, `loadSettings`                                |
|              | PascalCase           | `Auth`, `MediaService`, `Input.svelte`                     |
|              | SCREAMING_SNAKE_CASE | `DB_TYPE`, `DEFAULT_THEME`                                 |
| File Headers | Mandatory format     | `/** @file [path] @description [desc] features: [list] */` |

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

### Mandatory Documentation Updates

> [!CAUTION]
> **When implementing ANY new feature, you MUST update documentation.** Incomplete documentation is a blocking issue.

**For ALL new features, always update:**

- [ ] `docs/project/roadmap-2026.mdx` - Mark progress, add new items
- [ ] `AGENTS.md` roadmap checklist (if feature is listed)
- [ ] Create/update relevant MDX doc in appropriate `docs/` subdirectory

**Feature-Specific Documentation:**

| Feature Type                      | Primary MDX Location                                     | Also Update                                    |
| --------------------------------- | -------------------------------------------------------- | ---------------------------------------------- |
| Database adapters                 | `docs/database/` (e.g., `PostgreSQL_Implementation.mdx`) | `technical-evaluation-2026.mdx` feature matrix |
| Auth/Security (SAML, OAuth, SCIM) | `docs/database/Authentication_System.mdx`                | `technical-evaluation-2026.mdx`                |
| UI/UX features                    | `docs/guides/` or `docs/architecture/`                   | Widget docs if applicable                      |
| Content/Preview features          | `docs/guides/` (e.g., `Live_Preview_Architecture.mdx`)   | Integration docs                               |
| Widgets                           | `docs/widgets/` (per-widget `.mdx`)                      | `widget-system-overview.mdx`                   |
| API endpoints                     | `docs/api/`                                              | Relevant service docs                          |
| Performance/Infra                 | `docs/database/Performance_Architecture.mdx`             | `technical-evaluation-2026.mdx`                |

**Key Documentation Files:**

- `docs/database/` - Database adapters, auth, cache, performance
- `docs/guides/` - Feature guides (Live Preview, Error Handling, etc.)
- `docs/widgets/` - Per-widget documentation
- `docs/project/roadmap-2026.mdx` - Roadmap and gap analysis
- `docs/project/technical-evaluation-2026.mdx` - Competitive comparison

## Roadmap (Missing Features)

From the 2026 roadmap (v0.0.6, target A+ grade), prioritize these for parity/leadership (some beta/implemented; harden for production):

- [/] **PostgreSQL Support (Beta)**: Adapter scaffolding complete; stub methods implemented; needs full CRUD/Auth module implementation. Timeline: Q1 2026.
- [ ] **SQLite Support**: Lightweight adapter via Drizzle ORM for local/embedded deployments. Timeline: Q1 2026.
- [x] **SCIM 2.0 (Beta)**: Native endpoints (/scim/v2/Users, Groups, Bulk); support filters (eq, co), PATCH ops; integrate with Okta/Azure; timeline: Q1 polish (3-4 weeks).
- [ ] **SAML 2.0 / Enterprise SSO**: Add via @boxyhq/saml-jackson; support IdPs (Okta, Azure); config interface for assertions; timeline: Q1 (4-6 weeks).
- [x] **Crypto-Chained Audit Logs (Implemented)**: SHA-256 tamper-evident; schema with before/after changes; harden for SOC 2/GDPR.
- [x] **Self-Healing State Machines**: Custom Svelte store-based state machine with auto-recovery lifecycle (IDLE → READY <1s).
- [x] **Live Preview (Iframe + Plugin)**: Enterprise handshake protocol with secure tokens; iframe + editable.website integration; see `docs/guides/Live_Preview_Architecture.mdx`.
- [ ] **Plugin System**: Isomorphic hook-based architecture for extensibility.
- [ ] **Real-Time Collaboration**: WebSocket-based collaborative editing with live cursors.
- [ ] **BuzzForm Collection Builder**: Visual drag-and-drop form/collection builder (like [form.buildnbuzz.com](https://form.buildnbuzz.com/builder)); improved UX for non-technical users. Timeline: Q1 2026.
- [ ] **MCP AI Knowledgebase Server**: Model Context Protocol server exposing CMS docs, schemas, and APIs as AI-accessible knowledge; enables AI coding assistants to understand SveltyCMS ecosystem. Timeline: Q1 2026.
- [/] **Image Editor Enhancement**: Current implementation buggy; needs stabilization and feature improvements.
- [/] **Collection Builder Enhancement**: Current implementation buggy; needs UX improvements and bug fixes.
- [!] **GitHub Actions CI Fix**: Integration tests failing; needs investigation and fixes to restore green CI. **HIGH PRIORITY**
- [ ] **Config Sync/Export Testing**: Full E2E testing of configuration sync and export functionality.
- [ ] **Widget System Testing**: Comprehensive testing of all widgets for regressions.
- [ ] **Collection Revisions Testing**: Full testing of revision history, rollback, and diff functionality.
- Other Q1-Q4: ASR threat detection, full WCAG audit, Edge deployment guides.

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
|               | `bun run lint`             | Lint (Prettier + ESLint)       |
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

Svelte 5 runes: `$state()` for state, `$derived()` for computations, `$effect()` for effects. Stores: `widgetStore.svelte.ts` (singleton), `stores/system/state.ts` (custom auto-recovery state machine).

## Important Patterns & Conventions

1. **Security**: No secrets in client; use `.server.ts`.
2. **Async Init**: Await `dbInitPromise`.
3. **Type Safety & Validation**: Valibot schemas.
4. **Error Handling & Logging**: Try-catch with structured logger.
5. **Permissions**: `hasPermissionWithRoles()`.
6. **i18n**: Paraglide messages.
7. **API Responses**: Consistent `{ data, message }` or `{ error, code }`.

## Common Pitfalls

1.  **Circular Dependencies**: Use dynamic imports for service initialization.
2.  **HMR Reloads**: Expected for collections/widgets. Full page reload is normal.
3.  **Setup Wizard**: Let it generate `config/private.ts`. Do NOT create manually.
4.  **DB Seeding**: Safety checks prevent accidental production seeding.
5.  **TS Errors**: Run `bunx svelte-kit sync` to regenerate types.
6.  **Competitor Parity**: Use runes for lighter UIs vs. React hydration.

## Key Files Reference

| Category      | Key Files                                                                    |
| :------------ | :--------------------------------------------------------------------------- |
| **DB & Auth** | db.ts`, `dbInterface.ts`, database adapters like mongo, drizzle, etc.        |
| **Content**   | `types.ts`, `collectionScanner.ts`, `config/collections/`                    |
| **Widgets**   | `widgetFactory.ts`, `widgetStore.svelte.ts`                                  |
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

\_Last Updated: 2026-02-06\_
