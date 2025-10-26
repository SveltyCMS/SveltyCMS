# NX Monorepo Flat Structure - Complete Implementation Plan

## 🎯 Objective

Refactor the monolithic SveltyCMS into a **flat NX monorepo** to achieve:

- ✅ **Pinpoint Production Builds**: Only bundle selected database driver (no unused drivers)
- ✅ **Isolated Concerns**: Setup wizard, login, docs, tests as independent apps
- ✅ **Fast Builds**: Incremental builds, affected-only testing
- ✅ **Easy Testing**: Each workspace testable in isolation
- ✅ **Clean Architecture**: Shared libraries, pluggable drivers, thin wrappers

---

## 📁 Final Structure (Flat)

```
SveltyCMS/                              # Root monorepo
├── package.json                        # Root package.json (workspaces, bun)
├── bun.lockb                           # Single lock file
├── nx.json                             # NX configuration
├── tsconfig.base.json                  # Base TypeScript config with path aliases
│
├── cms/                                # 🎯 Core CMS App (SvelteKit)
│   ├── svelte.config.js
│   ├── vite.config.ts
│   ├── src/
│   │   ├── app.html
│   │   ├── hooks.server.ts            # Thin wrapper (imports from libraries)
│   │   ├── routes/
│   │   │   ├── (app)/                 # Protected routes
│   │   │   ├── api/
│   │   │   │   ├── graphql/+server.ts # Thin wrapper → graphql-logic
│   │   │   │   └── ...
│   │   │   └── +layout.svelte
│   │   ├── components/
│   │   ├── stores/
│   │   └── utils/
│   ├── static/
│   └── project.json                   # NX project config
│
├── setup-wizard/                       # 🔧 Setup App (SvelteKit, runs once)
│   ├── svelte.config.js
│   ├── vite.config.ts
│   ├── src/
│   │   ├── app.html
│   │   ├── routes/
│   │   │   ├── +page.svelte           # Setup wizard UI
│   │   │   └── api/
│   │   │       └── complete/+server.ts # Writes tsconfig.base.json
│   │   └── lib/
│   ├── static/
│   └── project.json
│
├── login/                              # 🔐 Login App (SvelteKit, standalone)
│   ├── svelte.config.js
│   ├── vite.config.ts
│   ├── src/
│   │   ├── app.html
│   │   ├── routes/
│   │   │   ├── +page.svelte           # Login/register UI
│   │   │   ├── oauth/
│   │   │   └── api/
│   │   └── components/
│   ├── static/
│   └── project.json
│
├── docs/                               # 📚 Documentation Site (SvelteKit)
│   ├── svelte.config.js
│   ├── vite.config.ts
│   ├── src/
│   │   ├── app.html
│   │   ├── routes/
│   │   │   └── [...slug]/+page.svelte # MDX docs
│   │   └── lib/
│   ├── static/
│   └── project.json
│
├── db-interface/                       # 📦 Database Interface (Library)
│   ├── src/
│   │   └── index.ts                   # DatabaseAdapter interface
│   ├── package.json                   # Local package.json (exports only)
│   └── project.json
│
├── db-driver-mongo/                    # 🍃 MongoDB Driver (Library)
│   ├── src/
│   │   └── index.ts                   # Implements DatabaseAdapter
│   ├── package.json                   # dependencies: { "mongodb": "^6.0.0" }
│   └── project.json
│
├── db-driver-drizzle/                  # 🔥 Drizzle Driver (Library)
│   ├── src/
│   │   └── index.ts                   # Implements DatabaseAdapter
│   ├── package.json                   # dependencies: { "drizzle-orm": "^0.30.0" }
│   └── project.json
│
├── db-driver-prisma/                   # 💎 Prisma Driver (Library, optional)
│   ├── src/
│   │   └── index.ts
│   ├── package.json
│   └── project.json
│
├── api-logic/                          # 🔌 API Request Logic (Library)
│   ├── src/
│   │   ├── index.ts
│   │   ├── caching.ts                 # Logic from handleApiRequests
│   │   ├── permissions.ts
│   │   └── rate-limiting.ts
│   ├── package.json
│   └── project.json
│
├── graphql-logic/                      # 📊 GraphQL Logic (Library)
│   ├── src/
│   │   ├── index.ts
│   │   ├── schema-builder.ts          # Schema generation
│   │   ├── resolvers.ts
│   │   └── yoga-setup.ts              # GraphQL Yoga config
│   ├── package.json
│   └── project.json
│
├── tailwind-config/                    # 🎨 Shared Tailwind Config (Library)
│   ├── src/
│   │   ├── app.postcss                # Shared styles
│   │   └── tailwind.preset.js         # Skeleton plugin + theme
│   ├── package.json
│   └── project.json
│
├── shared-utils/                       # 🛠️ Shared Utilities (Library)
│   ├── src/
│   │   ├── logger.ts
│   │   ├── validation.ts
│   │   └── crypto.ts
│   ├── package.json
│   └── project.json
│
├── shared-types/                       # 📘 Shared TypeScript Types (Library)
│   ├── src/
│   │   ├── index.ts
│   │   ├── user.ts
│   │   ├── collection.ts
│   │   └── settings.ts
│   ├── package.json
│   └── project.json
│
└── tests/                              # 🧪 E2E & Integration Tests
    ├── e2e/
    │   ├── setup.spec.ts
    │   ├── login.spec.ts
    │   └── cms.spec.ts
    ├── integration/
    │   ├── api.spec.ts
    │   └── graphql.spec.ts
    └── project.json
```

---

## 🚀 Implementation Plan

### Phase 1: Initialize Monorepo (Day 1-2)

#### Step 1.1: Create Root Structure

```bash
# Backup existing project
cd /var/www/vhosts/asset-trade.de/svelte.asset-trade.de
mv SveltyCMS SveltyCMS_old

# Create new monorepo with same name
mkdir SveltyCMS
cd SveltyCMS

# Initialize bun workspace
bun init -y

# Install NX (bun only, no npm/yarn)
bun add -D nx @nx/js @nxext/sveltekit
```

#### Step 1.2: Configure Root `package.json`

````json
{
  "name": "sveltycms",
  "version": "2.0.0",
  "private": true,

#### Step 1.3: Configure `nx.json`

```json
{
	"$schema": "./node_modules/nx/schemas/nx-schema.json",
	"packageManager": "bun",
	"targetDefaults": {
		"build": {
			"cache": true,
			"dependsOn": ["^build"]
		},
		"test": {
			"cache": true
		},
		"lint": {
			"cache": true
		}
	},
	"plugins": [
		{
			"plugin": "@nxext/sveltekit",
			"options": {
				"buildTargetName": "build",
				"serveTargetName": "serve",
				"previewTargetName": "preview",
				"checkTargetName": "check",
				"syncTargetName": "sync"
			}
		}
	],
	"affected": {
		"defaultBase": "main"
	}
}
````

#### Step 1.4: Configure `tsconfig.base.json`

```json
{
	"compilerOptions": {
		"target": "ES2022",
		"module": "ESNext",
		"moduleResolution": "bundler",
		"strict": true,
		"esModuleInterop": true,
		"skipLibCheck": true,
		"resolveJsonModule": true,
		"isolatedModules": true,
		"paths": {
			// CMS app
			"@src/*": ["cms/src/*"],
			"@components/*": ["cms/src/components/*"],
			"@stores/*": ["cms/src/stores/*"],
			"@utils/*": ["cms/src/utils/*"],

			// Database alias (MODIFIED BY SETUP WIZARD)
			"@sveltycms/database": ["db-driver-mongo/src/index.ts"],

			// Shared libraries
			"@sveltycms/db-interface": ["db-interface/src/index.ts"],
			"@sveltycms/api-logic": ["api-logic/src/index.ts"],
			"@sveltycms/graphql-logic": ["graphql-logic/src/index.ts"],
			"@sveltycms/tailwind-config": ["tailwind-config/src/index.ts"],
			"@sveltycms/shared-utils": ["shared-utils/src/index.ts"],
			"@sveltycms/shared-types": ["shared-types/src/index.ts"]
		}
	},
	"exclude": ["node_modules", "dist", ".svelte-kit", "build"]
}
```

---

### Phase 2: Migrate CMS App (Day 3-4)

#### Step 2.1: Copy Existing Code

```bash
# Copy entire SvelteKit app from backup
cp -r ../SveltyCMS_old/src ./cms/
cp -r ../SveltyCMS_old/static ./cms/
cp -r ../SveltyCMS_old/config ./cms/
cp ../SveltyCMS_old/svelte.config.js ./cms/
cp ../SveltyCMS_old/vite.config.ts ./cms/
cp ../SveltyCMS_old/tailwind.config.ts ./cms/
cp ../SveltyCMS_old/postcss.config.cjs ./cms/
```

#### Step 2.2: Delete CMS-Specific Files

```bash
# CMS should NOT have its own package.json or lock file
rm cms/package.json
rm cms/bun.lockb
rm cms/tsconfig.json  # Use root tsconfig.base.json
```

#### Step 2.3: Create `cms/project.json`

```json
{
	"name": "cms",
	"$schema": "../node_modules/nx/schemas/project-schema.json",
	"sourceRoot": "cms/src",
	"projectType": "application",
	"tags": ["type:app", "scope:cms"],
	"implicitDependencies": ["db-interface", "api-logic", "graphql-logic", "tailwind-config", "shared-utils", "shared-types"]
}
```

#### Step 2.4: Update CMS Imports

```typescript
// cms/src/hooks.server.ts - BEFORE
import { handleApiRequests } from './hooks/handleApiRequests';
import { dbAdapter } from './databases/db';

// cms/src/hooks.server.ts - AFTER (Thin wrapper)
import { handleApiRequests } from '@sveltycms/api-logic';
import { dbAdapter } from '@sveltycms/database'; // Pluggable!

export const handle: Handle = sequence(
	handleSystemState,
	// handleSetup removed (now separate app)
	handleLocale,
	handleTheme,
	handleAuthentication,
	handleAuthorization,
	handleApiRequests, // From api-logic library
	addSecurityHeaders
);
```

---

### Phase 3: Extract Setup Wizard (Day 5-6)

#### Step 3.1: Create Setup Wizard App

```bash
mkdir -p setup-wizard/src/routes/api/complete
mkdir -p setup-wizard/static
```

#### Step 3.2: Move Setup Code

```bash
# Move setup UI
mv cms/src/routes/setup/* setup-wizard/src/routes/

# Move setup API
mv cms/src/routes/api/setup/* setup-wizard/src/routes/api/
```

#### Step 3.3: Create Setup Complete API

```typescript
// setup-wizard/src/routes/api/complete/+server.ts
import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import type { RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async ({ request }) => {
	const { dbDriver } = await request.json();

	// Read root tsconfig.base.json
	const tsconfigPath = join(process.cwd(), '..', 'tsconfig.base.json');
	const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf-8'));

	// Update database alias based on user selection
	const driverMap = {
		mongodb: 'db-driver-mongo/src/index.ts',
		drizzle: 'db-driver-drizzle/src/index.ts',
		prisma: 'db-driver-prisma/src/index.ts'
	};

	tsconfig.compilerOptions.paths['@sveltycms/database'] = [driverMap[dbDriver]];

	// Write updated tsconfig
	writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2), 'utf-8');

	return new Response(JSON.stringify({ success: true }), {
		status: 200
	});
};
```

#### Step 3.4: Remove Setup from CMS

```bash
# Delete setup routes from CMS
rm -rf cms/src/routes/setup
rm -rf cms/src/routes/api/setup

# Remove handleSetup from hooks.server.ts
```

---

### Phase 4: Create Database Drivers (Day 7-8)

#### Step 4.1: Create `db-interface`

```typescript
// db-interface/src/index.ts
export interface DatabaseAdapter {
	connect(): Promise<void>;
	disconnect(): Promise<void>;

	// Auth methods
	auth: {
		getUserById(id: string): Promise<User | null>;
		getAllUsers(options?: QueryOptions): Promise<Result<User[]>>;
		createUser(data: CreateUserData): Promise<Result<User>>;
		// ... more auth methods
	};

	// Collection methods
	collection: {
		find(collectionName: string, query: any): Promise<Result<any[]>>;
		findOne(collectionName: string, query: any): Promise<Result<any>>;
		insert(collectionName: string, data: any): Promise<Result<any>>;
		// ... more collection methods
	};

	// Settings methods
	settings: {
		getAll(): Promise<Result<Settings>>;
		update(key: string, value: any): Promise<Result<void>>;
	};
}

export type Result<T> = { success: true; data: T } | { success: false; error: string };
```

#### Step 4.2: Create `db-driver-mongo`

```json
// db-driver-mongo/package.json
{
	"name": "@sveltycms/db-driver-mongo",
	"version": "1.0.0",
	"type": "module",
	"exports": {
		".": "./src/index.ts"
	},
	"dependencies": {
		"mongodb": "^6.0.0"
	},
	"peerDependencies": {
		"@sveltycms/db-interface": "*"
	}
}
```

```typescript
// db-driver-mongo/src/index.ts
import { MongoClient } from 'mongodb';
import type { DatabaseAdapter } from '@sveltycms/db-interface';

class MongoAdapter implements DatabaseAdapter {
	private client: MongoClient;
	private db: Db;

	async connect() {
		this.client = new MongoClient(process.env.DB_HOST!);
		await this.client.connect();
		this.db = this.client.db(process.env.DB_NAME);
	}

	async disconnect() {
		await this.client.close();
	}

	auth = {
		async getUserById(id: string) {
			const user = await this.db.collection('users').findOne({ _id: new ObjectId(id) });
			return user ? { success: true, data: user } : { success: false, error: 'Not found' };
		}
		// ... implement all auth methods
	};

	collection = {
		async find(collectionName: string, query: any) {
			const docs = await this.db.collection(collectionName).find(query).toArray();
			return { success: true, data: docs };
		}
		// ... implement all collection methods
	};

	settings = {
		// ... implement settings methods
	};
}

export const dbAdapter = new MongoAdapter();
```

#### Step 4.3: Create `db-driver-drizzle`

```json
// db-driver-drizzle/package.json
{
	"name": "@sveltycms/db-driver-drizzle",
	"version": "1.0.0",
	"type": "module",
	"exports": {
		".": "./src/index.ts"
	},
	"dependencies": {
		"drizzle-orm": "^0.30.0",
		"postgres": "^3.4.0"
	},
	"peerDependencies": {
		"@sveltycms/db-interface": "*"
	}
}
```

```typescript
// db-driver-drizzle/src/index.ts
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { DatabaseAdapter } from '@sveltycms/db-interface';

class DrizzleAdapter implements DatabaseAdapter {
	private db: any;

	async connect() {
		const connection = postgres(process.env.DB_HOST!);
		this.db = drizzle(connection);
	}

	async disconnect() {
		// Close connection
	}

	// Implement all DatabaseAdapter methods...
}

export const dbAdapter = new DrizzleAdapter();
```

---

### Phase 5: Extract API & GraphQL Logic (Day 9-10)

#### Step 5.1: Create `api-logic` Library

```typescript
// api-logic/src/index.ts
import type { Handle } from '@sveltejs/kit';
import { dbAdapter } from '@sveltycms/database'; // Uses alias!

export const handleApiRequests: Handle = async ({ event, resolve }) => {
	const { url, locals, request } = event;

	if (!url.pathname.startsWith('/api/') || !locals.user) {
		return resolve(event);
	}

	// All the caching, permission checking logic
	// (moved from cms/src/hooks/handleApiRequests.ts)

	// Uses dbAdapter via @sveltycms/database alias
	const cached = await dbAdapter.cache?.get(cacheKey);

	// ... rest of logic
};
```

#### Step 5.2: Create `graphql-logic` Library

```typescript
// graphql-logic/src/index.ts
import { createYoga } from 'graphql-yoga';
import { makeExecutableSchema } from '@graphql-tools/schema';
import { dbAdapter } from '@sveltycms/database'; // Uses alias!

export function createGraphQLHandler() {
	const schema = makeExecutableSchema({
		typeDefs: generateTypeDefs(), // From collection schemas
		resolvers: generateResolvers() // Uses dbAdapter
	});

	return createYoga({
		schema,
		graphqlEndpoint: '/api/graphql'
		// ... configuration
	});
}

function generateResolvers() {
	return {
		Query: {
			user: async (_, { id }) => {
				const result = await dbAdapter.auth.getUserById(id);
				return result.success ? result.data : null;
			}
			// ... more resolvers
		}
	};
}
```

#### Step 5.3: Update CMS to Use Libraries

```typescript
// cms/src/hooks.server.ts - Thin wrapper
import { handleApiRequests } from '@sveltycms/api-logic';

export const handle = sequence(
	handleSystemState,
	handleLocale,
	handleTheme,
	handleAuthentication,
	handleAuthorization,
	handleApiRequests, // ← From library
	addSecurityHeaders
);
```

```typescript
// cms/src/routes/api/graphql/+server.ts - Thin wrapper
import { createGraphQLHandler } from '@sveltycms/graphql-logic';

const yoga = createGraphQLHandler();

export const POST = yoga;
export const GET = yoga;
```

---

### Phase 6: Extract Login App (Day 11-12)

#### Step 6.1: Create Login App Structure

```bash
mkdir -p login/src/routes/oauth
mkdir -p login/src/routes/api/auth
mkdir -p login/src/components
mkdir -p login/static
```

#### Step 6.2: Move Login Code

```bash
# Move login UI
mv cms/src/routes/login/* login/src/routes/

# Move login components
mv cms/src/routes/login/components/* login/src/components/
```

#### Step 6.3: Create Login `+page.server.ts`

```typescript
// login/src/routes/+page.server.ts
import { dbAdapter } from '@sveltycms/database';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ cookies }) => {
	// Check if first user exists
	const result = await dbAdapter.auth.getAllUsers({ limit: 1 });
	const firstUserExists = result.success && result.data.length > 0;

	return {
		firstUserExists
	};
};
```

#### Step 6.4: Remove Login from CMS

```bash
# Delete login routes from CMS
rm -rf cms/src/routes/login
```

---

### Phase 7: Extract Docs App (Day 13-14)

#### Step 7.1: Create Docs App

```bash
mkdir -p docs/src/routes/[...slug]
mkdir -p docs/static
```

#### Step 7.2: Move Docs Content

```bash
# Move all MDX docs
mv cms/docs/* docs/src/routes/
```

#### Step 7.3: Create Docs `+page.svelte`

```svelte
<!-- docs/src/routes/[...slug]/+page.svelte -->
<script lang="ts">
	import { page } from '$app/stores';
	import type { PageData } from './$types';

	let { data } = $props<{ data: PageData }>();
</script>

<article class="prose">
	{@html data.content}
</article>
```

---

### Phase 8: Create Shared Libraries (Day 15)

#### Step 8.1: Create `tailwind-config`

```javascript
// tailwind-config/src/tailwind.preset.js
import { skeleton } from '@skeletonlabs/skeleton/plugin';

export default {
	darkMode: 'class',
	plugins: [
		skeleton({
			themes: {
				preset: ['skeleton', 'crimson']
			}
		})
	]
};
```

```css
/* tailwind-config/src/app.postcss */
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Shared custom styles */
.btn-primary {
	@apply bg-primary-500 text-white hover:bg-primary-600;
}
```

#### Step 8.2: Update Apps to Use Shared Config

```javascript
// cms/tailwind.config.js
import preset from '@sveltycms/tailwind-config/tailwind.preset';

export default {
	presets: [preset],
	content: ['./src/**/*.{html,js,svelte,ts}', '../shared-components/src/**/*.svelte']
};
```

---

### Phase 9: Bundle Analysis & Optimization (Day 16)

#### Step 9.1: Add Bundle Visualizer

```typescript
// cms/vite.config.ts
import { sveltekit } from '@sveltejs/kit/vite';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		sveltekit(),
		process.env.ANALYZE &&
			visualizer({
				filename: './bundle-analysis.html',
				open: true,
				gzipSize: true,
				brotliSize: true
			})
	]
});
```

#### Step 9.2: Build with Mongo Driver

```bash
# 1. Run setup wizard, select MongoDB
bun x nx serve setup-wizard
# Complete setup, select MongoDB

# 2. Verify tsconfig.base.json updated
cat tsconfig.base.json | grep "@sveltycms/database"
# Should show: ["db-driver-mongo/src/index.ts"]

# 3. Build CMS with analysis
ANALYZE=true bun x nx build cms

# 4. Check bundle-analysis.html
# Verify: ✅ mongodb package included
#         ❌ drizzle-orm NOT included
#         ❌ prisma NOT included
```

#### Step 9.3: Build with Drizzle Driver

```bash
# 1. Change driver in tsconfig.base.json
# "@sveltycms/database": ["db-driver-drizzle/src/index.ts"]

# 2. Build CMS with analysis
ANALYZE=true bun x nx build cms

# 3. Check bundle-analysis.html
# Verify: ✅ drizzle-orm included
#         ❌ mongodb NOT included
#         ❌ prisma NOT included
```

---

## ✅ Acceptance Criteria

### Critical Success Metrics

#### 1. Structure ✅

- [ ] Flat structure (no `packages/` folder)
- [ ] All workspaces in root directory
- [ ] Single `bun.lockb` at root
- [ ] No nested `package.json` files (except libraries with dependencies)

#### 2. Build System ✅

- [ ] `bun install` completes successfully
- [ ] `bun x nx serve setup-wizard` runs
- [ ] `bun x nx serve cms` runs after setup
- [ ] `bun x nx serve login` runs independently
- [ ] `bun x nx serve docs` runs independently

#### 3. Setup Wizard ✅

- [ ] Setup wizard modifies `tsconfig.base.json`
- [ ] Database driver alias points to selected driver
- [ ] CMS app starts with correct driver after setup

#### 4. Bundle Analysis ✅ (CRITICAL)

- [ ] `bun x nx build cms` with Mongo alias:
  - ✅ `mongodb` package in bundle
  - ❌ `drizzle-orm` NOT in bundle
  - ❌ Other unused drivers NOT in bundle
- [ ] Bundle size < 500KB (gzipped, excluding framework)

#### 5. Code Quality ✅

- [ ] `cms/src/hooks.server.ts` is thin wrapper (< 50 lines)
- [ ] `cms/src/routes/api/graphql/+server.ts` is thin wrapper (< 20 lines)
- [ ] All database imports use `@sveltycms/database` alias

#### 6. Testing ✅

- [ ] `bun x nx test cms` passes
- [ ] `bun x nx test setup-wizard` passes
- [ ] `bun x nx affected:test` runs successfully
- [ ] `bun x nx affected:build` runs successfully

#### 7. Styling ✅

- [ ] CMS app uses shared Tailwind config
- [ ] Setup wizard uses shared Tailwind config
- [ ] Login app uses shared Tailwind config
- [ ] Docs app uses shared Tailwind config
- [ ] All apps render Skeleton theme correctly

---

## 📊 Expected Bundle Sizes

### Before Refactor (Monolithic)

```
Total Bundle: ~8.5MB (uncompressed)
├── mongodb: 1.2MB
├── drizzle-orm: 800KB
├── prisma: 1.5MB
├── all other deps: 5MB
└── app code: 1MB
```

### After Refactor (With Mongo)

```
Total Bundle: ~2.5MB (uncompressed)
├── mongodb: 1.2MB        ✅ Selected driver
├── app code: 1MB
└── shared deps: 300KB
❌ drizzle-orm: NOT INCLUDED
❌ prisma: NOT INCLUDED
```

### Bundle Size Reduction

- **Before**: 8.5MB uncompressed, ~2.1MB gzipped
- **After**: 2.5MB uncompressed, ~650KB gzipped
- **Savings**: ~70% reduction 🎉

---

## 🎯 Key Implementation Notes

### 1. Database Driver Alias (Most Important)

The setup wizard's PRIMARY function is to update `tsconfig.base.json`:

```json
{
	"compilerOptions": {
		"paths": {
			"@sveltycms/database": ["db-driver-mongo/src/index.ts"]
		}
	}
}
```

**Why This Works:**

- TypeScript resolves `@sveltycms/database` to the chosen driver
- Vite/Rollup only bundles the imported code
- Unused drivers never get imported → never bundled
- Zero runtime overhead, pure build-time optimization

### 2. Thin Wrappers Pattern

All complex logic must be in libraries. App files should be minimal:

```typescript
// ❌ BAD - Logic in app file
export const handle: Handle = async ({ event, resolve }) => {
	// 200 lines of caching logic...
	// 100 lines of permission checks...
	// 50 lines of rate limiting...
};

// ✅ GOOD - Thin wrapper
import { handleApiRequests } from '@sveltycms/api-logic';
export const handle = sequence(handleApiRequests);
```

### 3. Library Dependencies

Only database drivers should have heavy dependencies:

```json
// ✅ db-driver-mongo/package.json
{
  "dependencies": {
    "mongodb": "^6.0.0"  // Only this driver needs MongoDB
  }
}

// ❌ cms/package.json (should NOT exist)
{
  "dependencies": {
    "mongodb": "^6.0.0",      // ❌ All drivers bundled!
    "drizzle-orm": "^0.30.0",
    "prisma": "^5.0.0"
  }
}
```

---

## 🚦 Migration Checklist

### Pre-Migration

- [ ] Backup existing SveltyCMS project
- [ ] Document current bundle size
- [ ] List all current dependencies
- [ ] Create migration branch in git

### Phase 1: Setup (Days 1-2)

- [ ] Initialize monorepo structure
- [ ] Configure NX and bun workspaces
- [ ] Merge all dependencies to root
- [ ] Install all packages successfully

### Phase 2: CMS Migration (Days 3-4)

- [ ] Copy CMS code to `cms/` workspace
- [ ] Remove CMS-specific config files
- [ ] Update all imports to use aliases
- [ ] Verify CMS builds

### Phase 3: Setup Wizard (Days 5-6)

- [ ] Extract setup routes to `setup-wizard/`
- [ ] Implement tsconfig modification API
- [ ] Remove setup from CMS
- [ ] Test setup wizard flow

### Phase 4: Database Drivers (Days 7-8)

- [ ] Create `db-interface` with adapter interface
- [ ] Implement `db-driver-mongo`
- [ ] Implement `db-driver-drizzle`
- [ ] Update CMS to use `@sveltycms/database` alias

### Phase 5: API/GraphQL (Days 9-10)

- [ ] Extract API logic to `api-logic` library
- [ ] Extract GraphQL logic to `graphql-logic` library
- [ ] Convert CMS hooks/routes to thin wrappers
- [ ] Test all API endpoints

### Phase 6: Login App (Days 11-12)

- [ ] Extract login routes to `login/` workspace
- [ ] Remove login from CMS
- [ ] Test login flow independently

### Phase 7: Docs App (Days 13-14)

- [ ] Extract docs to `docs/` workspace
- [ ] Configure MDX rendering
- [ ] Test docs site independently

### Phase 8: Shared Libraries (Day 15)

- [ ] Create `tailwind-config` library
- [ ] Create `shared-utils` library
- [ ] Create `shared-types` library
- [ ] Update all apps to use shared libraries

### Phase 9: Testing & Validation (Day 16)

- [ ] Run bundle analysis with each driver
- [ ] Verify unused drivers NOT in bundle
- [ ] Run all tests
- [ ] Performance benchmarks

---

## 🎉 Success Criteria Summary

| Criterion            | Target                         | How to Verify                     |
| -------------------- | ------------------------------ | --------------------------------- |
| **Bundle Size**      | < 500KB gzipped                | `ANALYZE=true bun x nx build cms` |
| **Driver Isolation** | Only selected driver in bundle | Check `bundle-analysis.html`      |
| **Build Speed**      | < 30s for affected projects    | `time bun x nx affected:build`    |
| **Test Speed**       | < 2min for all tests           | `time bun x nx test`              |
| **Setup Time**       | < 5min for fresh install       | Complete setup wizard flow        |
| **Code Quality**     | Thin wrappers < 50 lines       | Check `cms/src/hooks.server.ts`   |
| **Modularity**       | Each app runs independently    | Test each `nx serve` command      |

---

## 📖 Documentation Updates Needed

After migration, update these docs:

1. **Installation Guide** - New workspace structure, NX commands
2. **Development Guide** - How to work with monorepo, affected builds
3. **Architecture Docs** - Database driver system, thin wrapper pattern
4. **Contributing Guide** - Workspace conventions, testing strategy
5. **Deployment Guide** - Building specific driver bundles

---

**Status**: Ready to implement  
**Estimated Time**: 16 days (2.5 weeks)  
**Team Size**: 1-2 developers  
**Risk Level**: Medium (requires careful dependency management)

---

**Next Steps:**

1. Review and approve this plan
2. Set up initial monorepo structure (Phase 1)
3. Begin CMS migration (Phase 2)
4. Progressive enhancement through phases 3-9
