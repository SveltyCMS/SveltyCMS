# AGENTS.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## Project Overview

SveltyCMS is a headless CMS built with SvelteKit 2, Svelte 5, TypeScript, and Tailwind CSS v4. It provides database-agnostic architecture (MongoDB, MariaDB/MySQL, PostgreSQL planned), GraphQL/REST APIs, multi-language support via Paraglide JS, and a widget-based content modeling system.

## Development Commands

### Daily Development

```bash
# Development server (auto-launches setup wizard if needed)
bun run dev              # Preferred (fastest)
npm run dev              # Alternative
pnpm run dev            # Alternative

# Build for production
bun run build           # Standard build
bun run build:verbose   # With detailed output
bun run build:analyze   # With bundle size visualization

# Preview production build
bun run preview         # Runs on localhost:4173
```

### Code Quality

```bash
# Type checking
bun run check           # Run once
bun run check:watch     # Watch mode

# Linting and formatting
bun run lint            # Check code style (Prettier + ESLint)
bun run format          # Auto-fix formatting
```

### Testing

```bash
# Unit tests (fast, no server needed)
bun run test:unit       # Tests services, utils, stores, widgets

# Integration tests (requires MongoDB/MariaDB)
bun run test:integration  # Full lifecycle: build, start server, seed DB, test, cleanup

# E2E tests (Playwright)
bun run test:e2e        # Runs browser automation tests

# All tests
bun run test:all        # Runs all test suites sequentially
```

### Database Operations

```bash
# Drizzle ORM (MariaDB/MySQL/PostgreSQL)
bun run db:push         # Push schema changes
bun run db:migrate      # Run migrations
bun run db:studio       # Open Drizzle Studio GUI
```

### Internationalization

```bash
bun run paraglide       # Compile i18n messages
bun run translate       # Machine translate missing keys
```

### Diagnostics

```bash
bun run check:mongodb   # Test MongoDB connection
bun run build:stats     # Generate bundle size report
```

## Architecture Overview

### Database Adapter Pattern (CRITICAL)

SveltyCMS is **database-agnostic**. All database operations MUST use the adapter interface.

**✅ CORRECT - Use adapter pattern:**

```typescript
import { dbAdapter } from '$databases/db';

export async function GET({ locals }) {
	// Access via adapter interface
	const items = await dbAdapter.crud.findMany('collection_name', filter);
	const user = await dbAdapter.auth.user.findOne({ email });
	return json(items);
}
```

**❌ WRONG - Direct database access:**

```typescript
import mongoose from 'mongoose';
import { db } from 'drizzle-orm';

// Never do this - breaks database portability
const items = await mongoose.model('Collection').find();
const items = await db.select().from(table);
```

**Key adapter interfaces:**

- `dbAdapter.crud.*` - CRUD operations for collections
- `dbAdapter.auth.user.*` - User management
- `dbAdapter.auth.session.*` - Session management
- `dbAdapter.auth.token.*` - Token management
- `dbAdapter.auth.role.*` - Role/permission management
- `dbAdapter.collection.*` - Collection schema operations
- `dbAdapter.media.files.*` - Media file metadata
- `dbAdapter.media.folders.*` - Media folder organization
- `dbAdapter.settings.*` - System settings
- `dbAdapter.widget.*` - Widget configuration

### Widget System Architecture

Widgets follow a **3-pillar architecture**:

1. **Definition Pillar** (`index.ts`):
   - Created using `createWidget()` factory function
   - Exports a typed widget factory
   - Defines validation schema (Valibot)
   - Specifies GuiSchema for Collection Builder UI
   - Returns immutable `WidgetDefinition`

2. **Input Pillar** (`Input.svelte`):
   - Interactive component for data entry
   - Used in Collection Builder and content editing
   - Handles validation and user input
   - Props: `{ field, value, onValueChange, ... }`

3. **Display Pillar** (`Display.svelte`):
   - Read-only component for rendering values
   - Used in content lists and previews
   - Optimized for performance
   - Props: `{ field, value, ... }`

**Creating a widget:**

```typescript
// src/widgets/myWidget/index.ts
import { createWidget } from '@widgets/widgetFactory';
import * as v from 'valibot';

interface MyWidgetProps {
	maxLength?: number;
	placeholder?: string;
}

export default createWidget<MyWidgetProps>({
	Name: 'myWidget',
	Icon: 'mdi:widget-icon',
	Description: 'My custom widget',
	inputComponentPath: '/src/widgets/myWidget/Input.svelte',
	displayComponentPath: '/src/widgets/myWidget/Display.svelte',
	validationSchema: (field) => v.string([v.maxLength(field.maxLength ?? 100)]),
	defaults: { maxLength: 100, placeholder: 'Enter text...' },
	GuiSchema: {
		maxLength: { widget: 'number', label: 'Max Length' },
		placeholder: { widget: 'text', label: 'Placeholder' }
	}
});
```

**Widget storage:**

- Widget definitions: File system (`src/widgets/`)
- Widget configuration (enabled/disabled, tenant-specific): Database (`widgets` table)
- Widget state management: `widgetStore.svelte.ts` (Svelte 5 singleton)

### Content & Collection System

**Collections** are content types defined via:

- **Code**: TypeScript files in `config/collections/` (developer-friendly)
- **GUI**: Collection Builder interface (user-friendly)

**Collection compilation flow:**

1. User creates/edits collection in `config/collections/*.ts`
2. Vite watcher detects change
3. `compile()` processes TypeScript → JavaScript
4. Output goes to `compiledCollections/` directory
5. HMR triggers `scanCompiledCollections()` → registers models in database
6. Content structure types regenerated
7. Client receives full-reload signal

**Key files:**

- `src/content/collectionScanner.ts` - Scans compiled collections
- `src/content/types.ts` - TypeScript interfaces for Schema, FieldInstance, etc.
- `src/utils/compilation/compile.ts` - Collection compilation logic
- `vite.config.ts` - cmsWatcherPlugin handles HMR

### Middleware Pipeline (hooks.server.ts)

Request processing order:

1. **handleCompression** - GZIP/Brotli compression
2. **handleStaticAssetCaching** - Skip processing for static files
3. **handleSystemState** - Validate system health (gatekeeper)
4. **handleRateLimit** - Abuse prevention
5. **handleFirewall** - Threat detection
6. **handleSetup** - Enforce setup completion
7. **handleLocale** - i18n cookie sync
8. **handleTheme** - SSR dark mode
9. **handleAuthentication** - Session management
10. **handleAuthorization** - Permission checks
11. **handleApiRequests** - API-specific logic (RBAC, caching)
12. **handleTokenResolution** - Replace tokens in API responses
13. **addSecurityHeaders** - CSP, security headers

### Multi-Tenant Architecture

SveltyCMS supports optional multi-tenancy:

- Enabled via `MULTI_TENANT` in `config/private.ts`
- `tenantId` field added to collections, users, widgets, etc.
- Tenant isolation enforced at database query level
- API endpoints automatically scope queries by `locals.tenantId`

### State Management

**Svelte 5 Runes** are used throughout:

- `$state()` - Reactive state
- `$derived()` - Computed values
- `$effect()` - Side effects

**Key stores:**

- `widgetStore.svelte.ts` - Widget registry (singleton pattern)
- `stores/system/state.ts` - System state machine (IDLE → INITIALIZING → READY/DEGRADED/FAILED)
- `stores/system/async.ts` - Async utilities like `waitForServiceHealthy()`

### Configuration Files

**IMPORTANT - Never commit sensitive data:**

- `config/private.ts` - Database credentials, JWT secrets (gitignored)
- `config/private.test.ts` - Test database config (auto-generated, gitignored)
- `config/collections/` - User-defined collection schemas

**Public configuration:**

- `config/public.ts` - Public settings (safe to commit)
- `svelte.config.js` - SvelteKit configuration
- `vite.config.ts` - Build and dev server configuration
- `drizzle.config.ts` - Drizzle ORM configuration

### Testing Strategy

**Test isolation:**

- Production config: `config/private.ts` (never touched)
- Test config: `config/private.test.ts` (dynamically generated)
- `TEST_MODE=true` environment variable enables strict isolation
- Test database names must include "test" or end with "\_functional"

**Test structure:**

- Unit tests: `tests/bun/services`, `tests/bun/utils`, `tests/bun/stores`, `tests/bun/widgets`
- Integration tests: `tests/bun/api`, `tests/bun/databases`, `tests/bun/hooks`
- E2E tests: `tests/playwright`

**Running tests locally:**

```bash
# Unit tests only (fast)
bun run test:unit

# Integration (full lifecycle with MongoDB Memory Server)
bun run test:integration

# E2E with Playwright
bun run test:e2e
```

## Path Aliases

Defined in `svelte.config.js` and `vite.config.ts`:

```typescript
'@src'          → './src'
'@components'   → './src/components'
'@databases'    → './src/databases'
'@auth'         → './src/databases/auth'
'@config'       → './config'
'@collections'  → './config/collections'
'@utils'        → './src/utils'
'@stores'       → './src/stores'
'@widgets'      → './src/widgets'
'@content'      → './src/content'
'@services'     → './src/services'
'@types'        → './src/types'
'@themes'       → './src/themes'
'@static'       → './static'
'@root'         → '.'
'@api'          → './src/routes/api'
'@hooks'        → './src/hooks'
'$paraglide'    → './src/paraglide'
```

## Important Patterns & Conventions

### 1. Security - Never Expose Secrets

**❌ NEVER do this:**

```typescript
// Importing server-only files in client components
import { privateEnv } from '@config/private'; // BREAKS BUILD
import { getPrivateSettingSync } from '@utils/privateSettings.server'; // BREAKS BUILD
```

**✅ Use appropriate patterns:**

```typescript
// In +page.server.ts or +server.ts
import { privateEnv } from '@config/private'; // OK - server-only
export async function load() {
	return { publicData: transform(privateEnv) };
}
```

Files ending in `.server.ts` or `.server.js` are automatically stubbed in client builds.

### 2. Async Initialization

Database and authentication are initialized lazily on first request. Use:

```typescript
import { dbInitPromise } from '$databases/db';

// Wait for DB to be ready
await dbInitPromise;
```

### 3. Type Safety

- Use TypeScript for all new code
- Avoid `any` type - use `unknown` and type guards
- Leverage Valibot for runtime validation
- Widget props must extend `WidgetProps` base interface

### 4. Error Handling

**Preferred pattern:**

```typescript
import { logger } from '@utils/logger';

try {
  const result = await operation();
  return json(result);
} catch (error) {
  logger.error('Operation failed', { error, context: {...} });
  return json({ error: 'Operation failed' }, { status: 500 });
}
```

### 5. Logging

Use the structured logger:

```typescript
import { logger } from '@utils/logger';

logger.info('Message', { context: 'data' });
logger.warn('Warning', { userId: '123' });
logger.error('Error occurred', { error, stack: error.stack });
logger.debug('Debug info', { data }); // Only in dev mode
```

### 6. Permissions

Check permissions in API endpoints:

```typescript
import { hasPermissionWithRoles } from '@auth/utils';

export async function POST({ locals }) {
	const { user, roles } = locals;

	if (!hasPermissionWithRoles(user, 'api:collections:write', roles)) {
		return json({ error: 'Unauthorized' }, { status: 403 });
	}

	// Proceed with operation
}
```

### 7. Validation

Use Valibot for input validation:

```typescript
import * as v from 'valibot';

const schema = v.object({
	name: v.string([v.minLength(3)]),
	email: v.string([v.email()]),
	age: v.optional(v.number([v.minValue(0)]))
});

try {
	const data = v.parse(schema, input);
} catch (error) {
	// Handle validation error
}
```

### 8. Internationalization

Use Paraglide for i18n:

```svelte
<script>
	import * as m from '$paraglide/messages';
	import { languageTag } from '$paraglide/runtime';
</script>

<h1>{m.welcome()}</h1><p>{languageTag()}</p> <!-- Current language: 'en', 'de', etc. -->
```

### 9. API Response Format

Consistent API response structure:

```typescript
// Success
return json({ data: result, message: 'Operation successful' });

// Error
return json({
  error: 'Error message',
  code: 'ERROR_CODE',
  details: {...}
}, { status: 400 });

// Paginated
return json({
  data: items,
  pagination: {
    currentPage: 1,
    pageSize: 20,
    totalItems: 100,
    pagesCount: 5
  }
});
```

## Common Pitfalls

### 1. Circular Dependencies

The system uses dynamic imports to avoid circular dependencies in:

- `widgetStore.svelte.ts` → widgets
- `settingsService.ts` → database
- `db.ts` → various services

If adding new service dependencies, prefer dynamic imports for initialization:

```typescript
// ✅ Correct
async function initService() {
	const { someService } = await import('./someService');
	await someService.init();
}

// ❌ Wrong
import { someService } from './someService'; // May cause circular dependency
```

### 2. Hot Module Replacement (HMR)

Vite HMR is configured for:

- Collection changes: Auto-recompiles and registers models
- Widget changes: Reloads widget store and client
- Theme changes: Applies theme without full reload

When working with these, full page reload is expected behavior.

### 3. Setup Wizard

On first run (no `config/private.ts`):

- Setup wizard auto-opens at http://localhost:5173/setup
- Creates database credentials and admin user
- Generates `config/private.ts` with real credentials
- Do NOT manually create `config/private.ts` - let the wizard handle it

### 4. Database Seeding in Tests

Integration tests use:

1. `scripts/run-integration-tests.ts` orchestrator
2. MongoDB Memory Server (random port)
3. `config/private.test.ts` (auto-generated with test DB config)
4. `scripts/seed-test-db.ts` creates test data
5. Safety checks prevent accidental production DB seeding

### 5. TypeScript Errors During Build

If you see "Module not found" errors for `@src/widgets/proxy` or path aliases:

- Run `bunx svelte-kit sync` to regenerate types
- Check `tsconfig.json` paths match `svelte.config.js` aliases
- Ensure all imports use path aliases consistently

## Key Files Reference

**Database & Auth:**

- `src/databases/db.ts` - Database initialization and adapter
- `src/databases/dbInterface.ts` - Database adapter interface
- `src/databases/auth/` - Authentication system
- `src/databases/mongodb/` - MongoDB adapter
- `src/databases/mariadb/` - MariaDB adapter

**Content & Collections:**

- `src/content/types.ts` - Schema, FieldInstance, ContentNode types
- `src/content/collectionScanner.ts` - Collection discovery
- `src/content/index.ts` - ContentManager
- `config/collections/` - User collection schemas
- `compiledCollections/` - Compiled collection output (gitignored)

**Widgets:**

- `src/widgets/widgetFactory.ts` - createWidget() factory
- `src/widgets/types.ts` - Widget type definitions
- `src/stores/widgetStore.svelte.ts` - Widget registry
- `src/widgets/*/` - Individual widget implementations

**API Endpoints:**

- `src/routes/api/` - All API endpoints
- `src/hooks.server.ts` - Request middleware pipeline
- `src/hooks/` - Individual middleware hooks

**Services:**

- `src/services/settingsService.ts` - Settings cache
- `src/services/MetricsService.ts` - Performance metrics
- `src/services/TelemetryService.ts` - Update checking
- `src/services/scheduler/` - Background task scheduler

**Build & Config:**

- `vite.config.ts` - Vite configuration (HMR, plugins)
- `svelte.config.js` - SvelteKit configuration
- `tailwind.config.js` - Tailwind CSS configuration
- `drizzle.config.ts` - Drizzle ORM configuration

## Getting Help

- **Documentation:** `./docs/` directory
- **GitHub Discussions:** https://github.com/SveltyCMS/SveltyCMS/discussions
- **Discord:** https://discord.gg/qKQRB6mP
- **Issues:** https://github.com/SveltyCMS/SveltyCMS/issues
- **Contributing Guide:** `CONTRIBUTING.md`
- **Security Issues:** security@sveltycms.com

## Version Control

- Main development branch: `next`
- Stable release branch: `main`
- Use conventional commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- Include co-author line in commits: `Co-Authored-By: Warp <agent@warp.dev>`
- Run `bun run lint` and `bun run check` before committing
