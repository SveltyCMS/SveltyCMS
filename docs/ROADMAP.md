# SveltyCMS Strategic Roadmap

This document outlines the multi-phase plan to refactor SveltyCMS into a high-performance, secure, and maintainable monorepo architecture, and to roll out enterprise-level features.

---

## ✅ Completed: Role System Migration (Database-Only Architecture)

**Goal:** Migrate from filesystem-based role configuration to a pure database-only architecture.

**Status:** ✅ **Completed**.

**What Was Done:**

1. **Removed `config/roles.ts`:** Deleted the filesystem-based role configuration file completely.
2. **Created Shared Module:** `src/databases/auth/defaultRoles.ts` provides default roles for setup wizard seeding only.
3. **Updated Authorization:** `handleAuthorization.ts` now redirects to `/setup` if no database roles exist (no fallback mechanisms).
4. **Cleaned Database Layer:** Removed 54 lines of deprecated role methods from `Auth` class:
   - Removed: `getRoles()`, `getRoleById()`, `addRole()`, `updateRole()`, `deleteRole()`
   - Removed: `hasPermission()`, `hasPermissionByAction()`, `isAdmin()`, `hasRole()`
   - Removed: `private roles` field and related exports
5. **Updated ConfigService:** Removed role sync from enterprise config management (roles are database-only).
6. **Updated All Routes:** 20+ API routes and 5 server pages now use `locals.roles` from database.
7. **Updated Documentation:** 7 documentation files updated to reflect database-only architecture.

**Key Results:**

- **Database-First:** CMS requires functional database with roles, no fallback to config files
- **Multi-Tenant Ready:** Full tenant-specific role isolation via `tenantId`
- **Dynamic Management:** Roles editable via `/config/accessManagement` and `/api/permission/update`
- **Clean Architecture:** No deprecated code, clear separation of concerns
- **Default Seeding:** Three default roles (admin, developer, editor) seeded during setup wizard
- **Immediate Effect:** Role changes take effect instantly via cache invalidation

**Benefits for NX Migration:**

- ✅ Eliminates shared config file dependencies
- ✅ Enables clean package separation
- ✅ Database-first architecture aligns with monorepo best practices

---

## Phase 0: Monorepo Migration & Build Optimization

**Goal:** Migrate the monolithic codebase to a flat NX monorepo to solve build-time performance and bundle size issues.

**Conflict:** The current monolith bundles all database drivers, the setup wizard, and the login app into a single, massive production build (~603KB gzipped).

**Action:** Execute the "NX Monorepo Migration" Plan.

**Prerequisites Completed:**

- ✅ Role system migrated to database-only (eliminates config file dependencies)
- ✅ No more shared config files blocking clean package separation

**Key Steps:**

1.  **Structure:** Create a flat NX monorepo structure (`apps/cms`, `apps/setup-wizard`, `apps/login`, `libs/db-driver-mongo`, etc.).
2.  **Database Driver Aliasing:** Implement `tsconfig.base.json` path aliases (`@sveltycms/database`) to ensure only the correct database driver is bundled for production. This is a critical step for bundle size reduction.
3.  **Setup Wizard Extraction:** Move the setup wizard into its own `apps/setup-wizard` application.
4.  **Decouple Logic:** Extract reusable logic into libraries (`libs/api-logic`, `libs/graphql-logic`, `libs/shared-utils`).
5.  **UI Framework Upgrade:**

- Migrate to **Tailwind CSS v4** with tree-shaking for optimal CSS bundle size
- Upgrade to **Skeleton UI v4.2** with tree-shaking support
- Implement aggressive CSS purging and dead code elimination

6.  **Bundle Optimization:**

- Configure NX build targets with aggressive tree-shaking
- Implement code splitting for database drivers
- Extract shared dependencies into optimized libs

**Expected Result:**

- **Bundle Size Reduction:** ~603KB → ~230KB (~62% reduction) or better with Tailwind v4 tree-shaking
- **Architecture:** A decoupled, maintainable monorepo
- **Performance:** Faster builds and development server startup
- **Modern Stack:** Latest Tailwind v4 and Skeleton UI v4.2 with optimal tree-shaking

**Next Immediate Steps:**

1. Initialize NX workspace: `npx create-nx-workspace@latest sveltycms --preset=empty`
2. Create base monorepo structure with apps and libs folders
3. Configure `tsconfig.base.json` with path mappings
4. Set up Tailwind CSS v4 with tree-shaking configuration
5. Configure Skeleton UI v4.2 with component-level imports
6. Migrate core CMS to `apps/cms` with optimized build config
7. Extract database adapters to `libs/db-*` packages
8. Move setup wizard to `apps/setup-wizard`
9. Configure NX build orchestration and caching

**⚠️ Security Note:**

- **Setup API Endpoints:** Currently `/api/setup/*` endpoints remain accessible after setup completion for troubleshooting purposes (e.g., testing database connections after DB failure). This is intentional but NOT 100% secure.
- **TODO for Phase 0:** When moving setup wizard to standalone `apps/setup-wizard` app, these endpoints will be completely separated from the main CMS, eliminating this security concern.
- **Current Mitigation:** Setup page UI is blocked after completion, only API endpoints remain accessible (requires knowledge of exact endpoints to misuse).

---

## Phase 1: Runtime Performance (The "SvelteKit Way")

**Goal:** Fix the "God Component" anti-pattern in `EntryList.svelte` and `Fields.svelte` to enable full Server-Side Rendering (SSR) for the CMS backend UI, making it fast and robust.

**Status:** ✅ **Completed**.

**Action:** All data fetching logic was moved from the components to the `+page.server.ts` `load` function. Components now receive data as props and are "dumb."

**Key Results:**

- Eliminated client-side data fetching, caching, and state management from components.
- Replaced manual cache with server-side Redis caching and SvelteKit's built-in `load` caching.
- UI state changes (pagination, sorting, filtering) are now handled by updating URL search parameters, which triggers a server-side data reload.
- Mutations use `invalidateAll()` to refresh data, ensuring consistency.

---

## Phase 2: Application Decoupling (The Final Blocker)

**Goal:** Break the final circular dependency where backend logic (`modifyRequest.ts`) imports from a frontend Svelte store (`widgetStore.svelte.ts`).

**Conflict:** Core API logic should not depend on frontend-specific code. This prevents the API from being used in other contexts (e.g., a separate Content Delivery API).

**Action:** Create a UI-agnostic "widget registry" bridge.

**Key Steps:**

1.  **Create `libs/core-widgets`:** This new library will export a simple `Map` called `widgetRegistry`.
2.  **Register Widgets:** Individual widgets (e.g., `Input`, `Textarea`) will import `registerWidget` from `@sveltycms/core-widgets` and register themselves into the `widgetRegistry`.
3.  **Refactor Backend:** Backend logic (e.g., `modifyRequest.ts` in `libs/api-logic`) will import the `widgetRegistry` from `@sveltycms/core-widgets` to get widget functions, removing any dependency on Svelte stores.
4.  **Refactor Frontend:** The Svelte `widgetStore` will read its initial state from the `widgetRegistry`, becoming a consumer of the registry rather than the source of truth.

---

## Phase 3: API & Security Hardening

**Goal:** Fix a critical GraphQL security flaw and optimize data delivery for consuming websites.

**Key Steps:**

1.  **Fix GraphQL Multi-Tenancy Security Bug:**
    - **Conflict:** The current GraphQL server (`/api/graphql`) caches a single `yogaAppPromise` globally, meaning Tenant A could potentially be served Tenant B's schema.
    - **Action:** In `apps/cms/src/routes/api/graphql/+server.ts`, replace the single promise with a `Map` to cache a Yoga app instance _per tenant_. The `getYogaApp(tenantId)` function will get or set an instance from this map, ensuring strict tenant isolation.

2.  **Implement "Pinpoint" Frontend Data (Dataloader):**
    - **Goal:** Solve the "N+1 query" problem for high-performance data delivery to public websites.
    - **Action:** Introduce `Dataloader` into the GraphQL resolver context (in `libs/graphql-logic`). When a query asks for 20 posts and their authors, the `Post.author` resolver will call `authorLoader.load(authorId)`. Dataloader will automatically batch these 20 calls into a single database query (`db.users.find({ _id: { $in: [...] } })`), transforming 21 database queries into 2.

---

## Phase 4: The "Sandboxed" DIL Engine (Robustness & Speed)

**Goal:** Make the core "Developer-in-the-Loop" (DIL) model (the `vite.config.ts` watcher) safer and faster by decoupling the "compiler" from the "server."

**Conflict:** A typo in a `config/collections/*.ts` file can crash the entire production server because the Vite watcher recompiles the running application.

**Action:** Sandbox the compiler. The `ContentManager` will only read a single, safe `compiled-schema.json` file.

**Key Steps:**

1.  **Vite Watcher Becomes a "Compiler":** The Vite watcher will now run a separate script when `config/collections/` changes. This script will:
    - Import all `config/collections/*.ts` files.
    - Validate them against a schema.
    - If valid, compile them into a single `compiled-schema.json`.
    - If invalid, log an error and **do not** update the JSON. The server continues running with the last known good configuration.
2.  **`ContentManager` Reads JSON:** The `ContentManager` (in `libs/core-api`) will be simplified to only read `compiled-schema.json` on startup. It will use `fs.watch` to hot-reload its in-memory state if the JSON file changes.

**Benefits:**

- **Robustness:** A typo in a config file can no longer crash the production server.
- **Speed:** Hot-reloading a single JSON file is significantly faster than recompiling the entire server.

---

## Phase 5: A True "Plugin" Architecture

**Goal:** Create a formal architecture for adding new functionality (e.g., Stripe, Newsletter), not just new content fields.

**Action:** Define a "Plugin" as a standard NX library (`libs/plugin-*`) that exports a specific interface.

**Example Plugin Interface (`libs/plugin-newsletter/src/index.ts`):**

```typescript
export default {
	apiRoutes: [
		/* ... */
	], // To add new API endpoints
	adminRoutes: [
		/* ... */
	], // To add new pages to the Admin UI
	widgets: [
		/* ... */
	], // To add new widgets
	serverHooks: [
		/* ... */
	] // To hook into server events (e.g., onUserCreate)
};
```

The main `apps/cms` application will import these plugin configurations and automatically register all the routes, widgets, and hooks, making the CMS truly extensible.

---

## Phase 6: "Affected" CI/CD & E2E Testing

**Goal:** Fully leverage the monorepo for intelligent, high-speed testing and deployment.

**Action:** Use `nx affected` commands in the CI/CD pipeline.

**Key Commands:**

- `bun x nx affected:test`: Only runs tests for projects that were changed in a pull request.
- `bun x nx affected:build`: Only builds applications that were affected by a change.

**E2E Testing:**

- Create a new `apps/tests-e2e` app using Playwright to test critical user flows across the entire system (setup, login, content creation, API delivery).
