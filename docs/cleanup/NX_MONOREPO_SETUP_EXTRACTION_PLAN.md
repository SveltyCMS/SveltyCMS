# NX Monorepo Setup Extraction Plan

## 🎯 Objectives

1. **Fix Immediate Issue**: Resolve 503 error and `/login` redirect on fresh install
2. **Extract Setup**: Move setup wizard into separate NX package (`@sveltycms/setup`)
3. **Enhance Architecture**: Create pluggable, modular CMS core

---

## 🐛 Phase 0: Fix Immediate Issue (Priority)

### Problem Analysis

```
Browser Flow (Fresh Install):
1. User visits http://localhost:5173/
2. handleSystemState: IDLE → Allows request
3. handleSetup: No config → Should redirect to /setup
4. ❌ Something redirects to /login instead
5. handleSystemState: Blocks /login → 503 error
```

### Root Cause

The issue is in `handleSetup.ts` - when `private.ts` file is created by Vite but has empty values, the sync check passes but async check might fail.

### Solution Steps

#### Step 0.1: Fix handleSetup.ts Logic

```typescript
// Current problem:
if (!configExists) {
	// Redirects to /setup ✅
}

// Config exists but empty values?
// Falls through to blocking setup routes ❌
if (pathname.startsWith('/setup')) {
	throw redirect(302, '/login'); // ← BUG: This runs even on fresh install
}
```

**Fix**: Add async database check before blocking setup routes

#### Step 0.2: Update handleSystemState.ts

Add `/login` to allowed paths during IDLE state (for better UX during transition states)

#### Step 0.3: Improve Vite setupWizardPlugin

Don't create `private.ts` with valid structure - create a marker file instead, or check for **filled values** not just file existence.

---

## 📦 Phase 1: Prepare for NX Monorepo

### 1.1 Install NX in Existing Project

```bash
# Convert existing project to NX workspace
bun add -D @nx/workspace @nx/vite @nx/js nx

# Initialize NX configuration
bunx nx init
```

### 1.2 Create NX Workspace Structure

```
SveltyCMS/
├── packages/
│   ├── core/                    # Main CMS (existing src/)
│   │   ├── package.json
│   │   ├── project.json         # NX config
│   │   ├── vite.config.ts
│   │   └── src/
│   │
│   ├── setup/                   # Setup wizard (new package)
│   │   ├── package.json
│   │   ├── project.json
│   │   ├── vite.config.ts
│   │   └── src/
│   │       ├── routes/
│   │       │   └── setup/      # Setup UI
│   │       └── api/
│   │           └── setup/      # Setup API endpoints
│   │
│   └── shared/                  # Shared utilities
│       ├── package.json
│       ├── project.json
│       └── src/
│           ├── types/
│           ├── utils/
│           └── schemas/
│
├── apps/                        # Future: Admin dashboard, public site
├── nx.json
├── package.json
└── tsconfig.base.json
```

### 1.3 Define Package Dependencies

```json
// packages/core/package.json
{
  "name": "@sveltycms/core",
  "dependencies": {
    "@sveltycms/shared": "workspace:*"
  }
}

// packages/setup/package.json
{
  "name": "@sveltycms/setup",
  "dependencies": {
    "@sveltycms/shared": "workspace:*"
  }
}
```

---

## 🔧 Phase 2: Extract Setup Package

### 2.1 Identify Setup-Related Code

#### Files to Move to `@sveltycms/setup`:

```
src/routes/(admin)/setup/              → packages/setup/src/routes/
src/routes/api/setup/                  → packages/setup/src/api/
src/hooks/handleSetup.ts               → packages/setup/src/hooks/
src/utils/setupCheck.ts                → packages/setup/src/utils/
vite.config.ts (setupWizardPlugin)     → packages/setup/src/vite-plugin/
```

#### Files to Keep in Core (with modifications):

```
src/hooks.server.ts                    # Load setup hook conditionally
src/databases/db.ts                    # Remove setup-specific logic
vite.config.ts                         # Remove setupWizardPlugin
```

### 2.2 Create Setup Package Structure

```typescript
// packages/setup/src/index.ts
export { setupHook } from './hooks/setupHook';
export { setupVitePlugin } from './vite-plugin/setupWizard';
export { isSetupComplete, invalidateSetupCache } from './utils/setupCheck';
export type { SetupConfig, SetupResult } from './types';
```

### 2.3 Create Setup Hook API

```typescript
// packages/setup/src/hooks/setupHook.ts
import type { Handle } from '@sveltejs/kit';
import { isSetupComplete } from '../utils/setupCheck';

export interface SetupHookOptions {
	setupBasePath?: string; // Default: '/setup'
	apiBasePath?: string; // Default: '/api/setup'
	redirectOnComplete?: string; // Default: '/login'
	allowedAssets?: RegExp; // Asset patterns to allow
}

export function createSetupHook(options?: SetupHookOptions): Handle {
	const opts = {
		setupBasePath: '/setup',
		apiBasePath: '/api/setup',
		redirectOnComplete: '/login',
		allowedAssets: /\.(svg|png|jpg|css|js|woff2)$/,
		...options
	};

	return async ({ event, resolve }) => {
		// Setup logic here
		// Returns a Handle that can be used in sequence()
	};
}
```

### 2.4 Create Setup Vite Plugin

```typescript
// packages/setup/src/vite-plugin/setupWizard.ts
import type { Plugin } from 'vite';
import { isSetupComplete } from '../utils/setupCheck';

export interface SetupPluginOptions {
	configPath?: string; // Path to private.ts
	autoOpen?: boolean; // Auto-open browser
	port?: number; // Default port
}

export function setupWizardPlugin(options?: SetupPluginOptions): Plugin {
	return {
		name: '@sveltycms/setup-wizard',
		async buildStart() {
			// Check setup status
			// Create config file if needed
		},
		configureServer(server) {
			// Auto-open setup page
		}
	};
}
```

---

## 🔌 Phase 3: Core Integration

### 3.1 Update Core hooks.server.ts

```typescript
// packages/core/src/hooks.server.ts
import { sequence } from '@sveltejs/kit/hooks';
import { handleSystemState } from './hooks/handleSystemState';
import { handleAuthentication } from './hooks/handleAuthentication';
// ... other core hooks

// Conditionally import setup hook
let setupHook: Handle | null = null;
try {
	const { createSetupHook } = await import('@sveltycms/setup');
	setupHook = createSetupHook({
		setupBasePath: '/setup',
		redirectOnComplete: '/login'
	});
} catch {
	// Setup package not installed - skip setup hook
}

const middleware: Handle[] = [
	handleSystemState,
	...(setupHook ? [setupHook] : []), // ← Conditional
	handleAuthentication
	// ... other hooks
];

export const handle = sequence(...middleware);
```

### 3.2 Update Core vite.config.ts

```typescript
// packages/core/vite.config.ts
import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';

// Conditionally import setup plugin
let setupPlugin: Plugin | null = null;
try {
	const { setupWizardPlugin } = await import('@sveltycms/setup/vite');
	const { isSetupComplete } = await import('@sveltycms/setup');

	if (!isSetupComplete()) {
		setupPlugin = setupWizardPlugin({
			configPath: './config/private.ts',
			autoOpen: true,
			port: 5173
		});
	}
} catch {
	// Setup package not installed
}

export default defineConfig({
	plugins: [
		sveltekit(),
		...(setupPlugin ? [setupPlugin] : [])
		// ... other plugins
	]
});
```

### 3.3 Update Core db.ts

```typescript
// packages/core/src/databases/db.ts
import { transitionSystemState } from '@src/stores/system';

// Remove setup-specific checks
export async function initializeDatabase() {
	// Just connect to database
	// No more "check if setup complete" logic
	// Let setup hook handle that

	try {
		// Connect
		await dbAdapter.connect();
		transitionSystemState('READY', 'Database connected');
	} catch (error) {
		transitionSystemState('FAILED', `Database connection failed: ${error}`);
	}
}
```

---

## 🎨 Phase 4: Setup Package Features

### 4.1 Setup Wizard Steps

```typescript
// packages/setup/src/lib/steps.ts
export interface SetupStep {
	id: string;
	title: string;
	description: string;
	component: Component;
	validate: () => Promise<boolean>;
}

export const setupSteps: SetupStep[] = [
	{
		id: 'welcome',
		title: 'Welcome to SveltyCMS',
		description: "Let's get your CMS configured",
		component: WelcomeStep,
		validate: async () => true
	},
	{
		id: 'database',
		title: 'Database Configuration',
		description: 'Configure your database connection',
		component: DatabaseStep,
		validate: async () => {
			// Test DB connection
			return await testDatabaseConnection();
		}
	},
	{
		id: 'admin',
		title: 'Admin Account',
		description: 'Create your admin user',
		component: AdminStep,
		validate: async () => {
			// Validate admin credentials
			return true;
		}
	},
	{
		id: 'complete',
		title: 'Setup Complete',
		description: 'Your CMS is ready to use',
		component: CompleteStep,
		validate: async () => true
	}
];
```

### 4.2 Setup API Endpoints

```typescript
// packages/setup/src/api/routes.ts
export const setupApiRoutes = [
	{
		path: '/api/setup/check',
		method: 'GET',
		handler: checkSetupStatus
	},
	{
		path: '/api/setup/database',
		method: 'POST',
		handler: configurDatabase
	},
	{
		path: '/api/setup/admin',
		method: 'POST',
		handler: createAdminUser
	},
	{
		path: '/api/setup/complete',
		method: 'POST',
		handler: completeSetup
	}
];
```

---

## 🚀 Phase 5: Migration & Testing

### 5.1 Migration Steps

1. **Create NX workspace structure**

   ```bash
   mkdir -p packages/{core,setup,shared}
   ```

2. **Move existing code to core package**

   ```bash
   mv src packages/core/
   mv static packages/core/
   mv vite.config.ts packages/core/
   ```

3. **Extract setup code to setup package**

   ```bash
   # Move setup routes
   mv packages/core/src/routes/(admin)/setup packages/setup/src/routes/
   mv packages/core/src/routes/api/setup packages/setup/src/api/
   ```

4. **Update imports**

   ```bash
   # Use NX migration tool
   bunx nx generate @nx/workspace:move \
     --project core \
     --destination packages/core
   ```

5. **Test each phase**

   ```bash
   # Build packages
   bunx nx run-many --target=build --all

   # Run tests
   bunx nx run-many --target=test --all
   ```

### 5.2 Testing Strategy

#### Unit Tests

```typescript
// packages/setup/src/__tests__/setupCheck.test.ts
describe('isSetupComplete', () => {
	it('returns false when config missing', () => {
		expect(isSetupComplete()).toBe(false);
	});

	it('returns false when config has empty values', () => {
		// Test with empty DB_HOST, JWT_SECRET, etc.
	});

	it('returns true when config is valid', () => {
		expect(isSetupComplete()).toBe(true);
	});
});
```

#### Integration Tests

```typescript
// packages/setup/src/__tests__/setupFlow.test.ts
describe('Setup Flow', () => {
	it('redirects to /setup on fresh install', async () => {
		const response = await request('/');
		expect(response.status).toBe(302);
		expect(response.headers.location).toBe('/setup');
	});

	it('blocks access to /setup after completion', async () => {
		await completeSetup();
		const response = await request('/setup');
		expect(response.status).toBe(302);
		expect(response.headers.location).toBe('/login');
	});
});
```

---

## 📊 Phase 6: Benefits & Future

### 6.1 Immediate Benefits

✅ **Modular Architecture**

- Setup can be completely removed in production
- Core CMS is cleaner and focused
- Easier to test and maintain

✅ **Better Performance**

- Setup code not loaded in production
- Smaller bundle size for core CMS
- Faster cold starts

✅ **Easier Development**

- Clear separation of concerns
- Independent versioning
- Parallel development possible

### 6.2 Future Extensions

Once NX monorepo is in place, you can extract more packages:

```
packages/
├── core/              # Main CMS logic
├── setup/             # Setup wizard (✅ Phase 1)
├── admin-ui/          # Admin dashboard
├── media/             # Media management
├── auth/              # Authentication package
├── collections/       # Collection management
├── widgets/           # Widget system
├── themes/            # Theme system
└── plugins/           # Plugin system
```

### 6.3 Plugin Architecture

```typescript
// Future: Pluggable CMS
import { createCMS } from '@sveltycms/core';
import { setupPlugin } from '@sveltycms/setup';
import { mediaPlugin } from '@sveltycms/media';
import { authPlugin } from '@sveltycms/auth';

export const cms = createCMS({
	plugins: [setupPlugin(), authPlugin({ providers: ['google', 'github'] }), mediaPlugin({ storage: 's3' })]
});
```

---

## 🛠️ Implementation Timeline

### Week 1: Fix & Prepare

- [ ] **Day 1-2**: Fix immediate 503/login redirect issue
- [ ] **Day 3-4**: Install NX, create workspace structure
- [ ] **Day 5-7**: Document current setup flow, identify dependencies

### Week 2: Extract Setup

- [ ] **Day 1-3**: Create `@sveltycms/setup` package structure
- [ ] **Day 4-5**: Move setup code to package
- [ ] **Day 6-7**: Update imports, test integration

### Week 3: Integration & Testing

- [ ] **Day 1-2**: Update core to use setup package conditionally
- [ ] **Day 3-4**: Write tests for setup package
- [ ] **Day 5-7**: Integration testing, fix bugs

### Week 4: Documentation & Polish

- [ ] **Day 1-2**: Update documentation
- [ ] **Day 3-4**: Performance testing
- [ ] **Day 5-7**: Final polish, release

---

## 📝 Next Steps (Immediate)

1. **Fix the immediate issue** (Priority 1)
   - Modify `handleSetup.ts` to check DB before blocking setup routes
   - Test fresh install flow

2. **Create NX workspace** (Priority 2)
   - Install NX dependencies
   - Create initial workspace structure
   - Move existing code to `packages/core`

3. **Extract setup package** (Priority 3)
   - Create `packages/setup` structure
   - Move setup-related files
   - Create public API

4. **Test & Document** (Priority 4)
   - Write comprehensive tests
   - Update documentation
   - Create migration guide

---

## 🤔 Questions to Consider

1. **Versioning Strategy**: Should setup package follow core version or be independent?
2. **Distribution**: Should setup be optional dependency or always included?
3. **Multi-tenancy**: How does setup work with tenant-specific configurations?
4. **Database Migrations**: Should setup package handle migrations or just initial setup?
5. **Rollback Strategy**: What happens if setup fails mid-way?

---

## 🎯 Success Metrics

- ✅ Fresh install works without 503 errors
- ✅ Setup can be completed successfully
- ✅ Setup package can be removed in production builds
- ✅ Core CMS works without setup package
- ✅ Bundle size reduced by 20-30%
- ✅ All tests passing
- ✅ Documentation complete

---

**Status**: Ready to begin Phase 0 (Fix immediate issue)

**Author**: AI Assistant  
**Date**: 2025-10-20  
**Version**: 1.0
