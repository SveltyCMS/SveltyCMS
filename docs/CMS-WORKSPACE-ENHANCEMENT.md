# CMS Workspace Enhancement Strategy

This document explains how to further modularize the CMS workspace and implement shared base configurations.

## Table of Contents
1. [CMS Workspace Modularization](#cms-workspace-modularization)
2. [Shared Base Configurations](#shared-base-configurations)
3. [API/GraphQL Benefits from Nx](#api-graphql-benefits)
4. [Implementation Guide](#implementation-guide)

---

## CMS Workspace Modularization

### Current Structure Analysis

The CMS currently has several distinct functional areas that could benefit from workspace separation:

```
src/
├── components/
│   ├── media/              → Candidate for apps/cms-media
│   ├── imageEditor/        → Candidate for apps/cms-image-editor
│   └── admin/              → Stays in apps/cms
├── routes/
│   ├── (app)/
│   │   ├── dashboard/      → Candidate for apps/cms-dashboard
│   │   ├── mediagallery/   → Links to apps/cms-media
│   │   └── config/         → Candidate for apps/cms-config
│   └── api/
│       ├── graphql/        → Candidate for apps/api-graphql
│       ├── media/          → Links to apps/cms-media
│       └── ...             → Stays in apps/cms
└── widgets/                → Move to shared/widgets
```

### Recommended Workspace Split

#### Phase 1: Extract Large Features (Immediate Benefits)

**1. apps/cms-media** (Media Library & Image Editor)
```
apps/cms-media/
├── src/
│   ├── routes/
│   │   └── media/          # Media management UI
│   ├── components/
│   │   ├── media/          # Gallery, upload, browser
│   │   └── imageEditor/    # Image editing tools
│   └── lib/
│       └── media-utils.ts  # Media processing
├── project.json
├── svelte.config.js        # Extends base config
└── vite.config.ts          # Extends base config
```

**Benefits**:
- ~40% of CMS bundle size (media processing, image libraries)
- Independent deployment for media CDN
- Can scale separately (media-heavy workloads)
- Hot-reload only media code during development

**2. apps/cms-dashboard** (Analytics & Metrics)
```
apps/cms-dashboard/
├── src/
│   ├── routes/
│   │   └── dashboard/      # Dashboard UI
│   ├── components/
│   │   └── charts/         # Chart components
│   └── lib/
│       └── analytics.ts    # Analytics logic
├── project.json
└── ...
```

**Benefits**:
- Isolated heavy chart.js dependency
- Independent caching (dashboard data vs content data)
- Can be optional feature (not all users need analytics)

**3. apps/cms-config** (Collection Builder & Configuration)
```
apps/cms-config/
├── src/
│   ├── routes/
│   │   └── config/         # Config UI
│   ├── components/
│   │   ├── collectionBuilder/
│   │   └── widgetBuilder/
│   └── lib/
│       └── schema-builder.ts
├── project.json
└── ...
```

**Benefits**:
- Admin-only feature, not loaded for regular users
- Complex UI can be developed independently
- Separate testing for schema validation

#### Phase 2: Extract API Layer (Optional)

**4. apps/api-graphql** (GraphQL Server)
```
apps/api-graphql/
├── src/
│   ├── schema/             # GraphQL schemas
│   ├── resolvers/          # Query/mutation resolvers
│   └── subscriptions/      # WebSocket subscriptions
├── project.json
└── ...
```

**Benefits**:
- Can deploy as standalone API server
- Independent scaling (API vs UI)
- Different caching strategies
- Can run on different infrastructure

**Decision**: Keep GraphQL in main CMS initially, extract only if:
- API traffic > 10x UI traffic
- Need different deployment regions
- Want to offer API-only tier

#### Phase 3: Shared Libraries (Gradual)

**5. shared/widgets** (Widget Factory)
```
shared/widgets/
├── src/
│   ├── core/               # Core widgets (text, number, etc.)
│   ├── custom/             # Custom widgets (address, currency)
│   ├── factory.ts          # Widget factory
│   └── index.ts
├── project.json
└── README.md
```

**Benefits**:
- Reusable across setup, cms, config workspaces
- Clear widget API
- Easier to add third-party widgets

### Migration Priority Matrix

| Workspace | Bundle Impact | Complexity | Priority | Timeline |
|-----------|--------------|------------|----------|----------|
| cms-media | High (40%) | Medium | 🔴 High | Week 1-2 |
| shared/widgets | Medium (15%) | Low | 🟡 Medium | Week 3-4 |
| cms-config | Medium (20%) | Medium | 🟡 Medium | Week 5-6 |
| cms-dashboard | Low (10%) | Low | 🟢 Low | Week 7-8 |
| api-graphql | None | High | 🔵 Optional | Later |

---

## Shared Base Configurations

### Problem
Currently, each workspace would duplicate configuration in:
- `svelte.config.js` - Svelte/SvelteKit settings
- `vite.config.ts` - Build configuration
- `tsconfig.json` - TypeScript settings

### Solution: Base Config Pattern

Create shared base configurations that workspaces extend.

#### 1. Base Svelte Config

**File**: `svelte.config.base.js`
```javascript
/**
 * @file svelte.config.base.js
 * @description Shared SvelteKit configuration for all workspaces
 */
import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/**
 * Base SvelteKit configuration
 * Workspaces can import and extend this configuration
 */
export const getBaseSvelteConfig = (options = {}) => {
	const {
		adapterOptions = {},
		aliases = {},
		csp = {}
	} = options;

	return {
		// Enable Svelte 5 runes mode
		compilerOptions: {
			runes: true
		},

		// Default preprocessor
		preprocess: [vitePreprocess()],

		kit: {
			// Adapter configuration
			adapter: adapter({
				out: 'build',
				precompress: true,
				envPrefix: '',
				external: [
					'typescript',
					'ts-node',
					'@typescript-eslint/parser',
					'@typescript-eslint/eslint-plugin'
				],
				polyfill: false,
				...adapterOptions
			}),

			// Base path aliases (workspaces can extend)
			alias: {
				$paraglide: './src/paraglide',
				'@shared/theme': '../../shared/theme/src',
				'@shared/database': '../../shared/database/src',
				'@shared/utils': '../../shared/utils/src',
				'@shared/components': '../../shared/components/src',
				'@shared/hooks': '../../shared/hooks/src',
				'@shared/stores': '../../shared/stores/src',
				'@shared/paraglide': '../../shared/paraglide/src',
				'@config': '../../config',
				'@root': '../..',
				...aliases
			},

			// Base CSP configuration
			csp: {
				mode: 'nonce',
				directives: {
					'default-src': ['self'],
					'script-src': ['self', 'unsafe-inline', 'unsafe-eval', 'blob:', 'https://*.iconify.design'],
					'worker-src': ['self', 'blob:'],
					'style-src': ['self', 'unsafe-inline', 'https://*.iconify.design'],
					'img-src': [
						'self',
						'data:',
						'blob:',
						'https://*.iconify.design',
						'https://placehold.co',
						'https://github.com'
					],
					'font-src': ['self', 'data:'],
					'connect-src': ['self', 'https://*.iconify.design', 'wss:', 'ws:'],
					'object-src': ['none'],
					'base-uri': ['self'],
					'form-action': ['self'],
					...csp
				}
			},

			// Plugin options
			vitePlugin: {
				inspector: {
					toggleKeyCombo: 'meta-shift',
					holdMode: true,
					showToggleButton: 'always',
					toggleButtonPos: 'bottom-right'
				},
				experimental: {}
			}
		}
	};
};

export default getBaseSvelteConfig();
```

**Usage in Workspace**:
```javascript
// apps/cms/svelte.config.js
import { getBaseSvelteConfig } from '../../svelte.config.base.js';
import { enhancedImages } from '@sveltejs/enhanced-img';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const config = getBaseSvelteConfig({
	aliases: {
		// CMS-specific aliases
		'@cms': './src/lib',
		'@widgets': '../../shared/widgets/src'
	}
});

// Add CMS-specific preprocessing
config.preprocess = [enhancedImages(), vitePreprocess()];

export default config;
```

```javascript
// apps/setup/svelte.config.js
import { getBaseSvelteConfig } from '../../svelte.config.base.js';

const config = getBaseSvelteConfig({
	adapterOptions: {
		// Setup wizard has smaller output
		out: 'dist/setup'
	}
});

export default config;
```

#### 2. Base Vite Config

**File**: `vite.config.base.js`
```javascript
/**
 * @file vite.config.base.js
 * @description Shared Vite configuration for all workspaces
 */
import tailwindcss from '@tailwindcss/vite';
import { paraglideVitePlugin } from '@inlang/paraglide-js';
import { sveltekit } from '@sveltejs/kit/vite';
import path from 'path';

/**
 * Get base Vite configuration
 * @param {string} workspaceDir - Absolute path to workspace directory
 * @param {object} options - Additional options
 */
export const getBaseViteConfig = (workspaceDir, options = {}) => {
	const {
		port = 5173,
		paraglideProject = './project.inlang',
		additionalPlugins = [],
		optimizeDeps = {}
	} = options;

	return {
		plugins: [
			sveltekit(),
			tailwindcss(),
			paraglideVitePlugin({
				project: paraglideProject,
				outdir: './src/paraglide'
			}),
			...additionalPlugins
		],

		server: {
			port,
			fs: {
				// Allow serving files from workspace and shared
				allow: [workspaceDir, path.resolve(workspaceDir, '../../shared')]
			}
		},

		optimizeDeps: {
			exclude: ['@inlang/paraglide-js'],
			...optimizeDeps
		},

		build: {
			target: 'esnext',
			sourcemap: true,
			rollupOptions: {
				// Externalize optional dependencies
				external: ['mongoose', 'mariadb', 'mysql2', 'postgres']
			}
		},

		resolve: {
			alias: {
				// Shared library aliases
				'@shared/theme': path.resolve(workspaceDir, '../../shared/theme/src'),
				'@shared/database': path.resolve(workspaceDir, '../../shared/database/src'),
				'@shared/utils': path.resolve(workspaceDir, '../../shared/utils/src'),
				'@shared/components': path.resolve(workspaceDir, '../../shared/components/src'),
				'@shared/hooks': path.resolve(workspaceDir, '../../shared/hooks/src'),
				'@shared/stores': path.resolve(workspaceDir, '../../shared/stores/src'),
				'@shared/paraglide': path.resolve(workspaceDir, '../../shared/paraglide/src'),
				'@config': path.resolve(workspaceDir, '../../config')
			}
		}
	};
};

/**
 * Create Plesk deployment plugin (optional)
 */
export const createPleskDeployPlugin = (workspaceDir) => {
	return {
		name: 'plesk-deploy',
		closeBundle: () => {
			// Custom deployment logic
			console.log(`Plesk deployment ready from ${workspaceDir}`);
		}
	};
};
```

**Usage in Workspace**:
```javascript
// apps/cms/vite.config.ts
import { getBaseViteConfig, createPleskDeployPlugin } from '../../vite.config.base.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = getBaseViteConfig(__dirname, {
	port: 5174, // CMS on different port
	additionalPlugins: [createPleskDeployPlugin(__dirname)]
});

// CMS-specific optimizations
config.build.rollupOptions.output = {
	manualChunks: {
		// Split large dependencies
		'tiptap': ['@tiptap/core', '@tiptap/starter-kit'],
		'chart': ['chart.js', 'chartjs-adapter-date-fns']
	}
};

export default config;
```

```javascript
// apps/setup/vite.config.ts
import { getBaseViteConfig } from '../../vite.config.base.js';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const config = getBaseViteConfig(__dirname, {
	port: 5173, // Setup on default port
	optimizeDeps: {
		// Setup doesn't need heavy deps
		exclude: ['@tiptap/core', 'chart.js']
	}
});

export default config;
```

#### 3. Base TypeScript Config

**File**: `tsconfig.base.json`
```json
{
	"compilerOptions": {
		"target": "ESNext",
		"module": "ESNext",
		"moduleResolution": "bundler",
		"verbatimModuleSyntax": true,
		"isolatedModules": true,
		"strict": true,
		"forceConsistentCasingInFileNames": true,
		"noUnusedLocals": true,
		"noUnusedParameters": true,
		"allowJs": true,
		"checkJs": true,
		"esModuleInterop": true,
		"skipLibCheck": true,
		"allowArbitraryExtensions": true,
		"resolveJsonModule": true,
		"allowImportingTsExtensions": true,
		"types": ["@types/bun"],
		
		"paths": {
			"@shared/theme": ["./shared/theme/src"],
			"@shared/theme/*": ["./shared/theme/src/*"],
			"@shared/database": ["./shared/database/src"],
			"@shared/database/*": ["./shared/database/src/*"],
			"@shared/utils": ["./shared/utils/src"],
			"@shared/utils/*": ["./shared/utils/src/*"],
			"@shared/components": ["./shared/components/src"],
			"@shared/components/*": ["./shared/components/src/*"],
			"@shared/hooks": ["./shared/hooks/src"],
			"@shared/hooks/*": ["./shared/hooks/src/*"],
			"@shared/stores": ["./shared/stores/src"],
			"@shared/stores/*": ["./shared/stores/src/*"],
			"@shared/paraglide": ["./shared/paraglide/src"],
			"@shared/paraglide/*": ["./shared/paraglide/src/*"],
			"@config": ["./config"],
			"@config/*": ["./config/*"]
		}
	}
}
```

**Usage in Workspace**:
```json
// apps/cms/tsconfig.json
{
	"extends": [
		"../../tsconfig.base.json",
		"./.svelte-kit/tsconfig.json"
	],
	"compilerOptions": {
		"types": ["@types/bun"],
		"noEmit": true,
		"skipLibCheck": true,
		
		"paths": {
			"$lib": ["./src/lib"],
			"$lib/*": ["./src/lib/*"]
		}
	},
	"include": [
		"src/**/*.js",
		"src/**/*.ts",
		"src/**/*.svelte",
		"types/**/*.ts"
	]
}
```

```json
// apps/setup/tsconfig.json
{
	"extends": [
		"../../tsconfig.base.json",
		"./.svelte-kit/tsconfig.json"
	],
	"compilerOptions": {
		"types": ["@types/bun"],
		"noEmit": true,
		"skipLibCheck": true
	},
	"include": [
		"src/**/*.js",
		"src/**/*.ts",
		"src/**/*.svelte"
	]
}
```

---

## API/GraphQL Benefits from Nx

### Should GraphQL be a Separate Workspace?

**Answer**: It depends on your deployment strategy.

### Scenario 1: Keep GraphQL in Main CMS (Recommended Initially)

**When**:
- API and UI traffic are similar
- Simple deployment (one application)
- Shared authentication and session handling

**Structure**:
```
apps/cms/
├── src/
│   └── routes/
│       └── api/
│           └── graphql/
│               ├── +server.ts
│               ├── schema/
│               └── resolvers/
```

**Benefits**:
- Simpler deployment
- Shared database connection
- Single authentication layer
- Easy to call GraphQL from UI

### Scenario 2: Extract GraphQL to Separate Workspace

**When**:
- API traffic >> UI traffic (10x+)
- Need independent scaling
- Want API-only deployments
- Different caching strategies

**Structure**:
```
apps/api-graphql/
├── src/
│   ├── schema/
│   │   ├── collections.graphql
│   │   ├── users.graphql
│   │   └── media.graphql
│   ├── resolvers/
│   │   ├── Query.ts
│   │   ├── Mutation.ts
│   │   └── Subscription.ts
│   ├── subscriptions/
│   │   └── websocket.ts
│   └── index.ts
├── project.json
└── vite.config.ts
```

**Benefits**:
1. **Independent Scaling**
   ```bash
   # Scale API separately
   nx build api-graphql
   docker run --replicas=10 api-graphql
   
   # Scale UI separately
   nx build cms
   docker run --replicas=2 cms
   ```

2. **Different Caching**
   ```typescript
   // API-specific caching (Redis)
   cache: {
     type: 'redis',
     ttl: 3600
   }
   
   // UI-specific caching (Memory)
   cache: {
     type: 'memory',
     ttl: 60
   }
   ```

3. **API-Only Deployments**
   ```
   api.sveltycms.com → GraphQL only
   app.sveltycms.com → Full CMS UI
   ```

4. **Shared Code with CMS**
   ```typescript
   // Both use shared database adapter
   import { loadDatabaseAdapter } from '@shared/database';
   
   // Both use shared auth
   import { authHandle } from '@shared/hooks';
   ```

### Nx Benefits for API Endpoints

**1. Affected Testing**
```bash
# Only test affected by database changes
nx affected --target=test --base=main

# If shared/database changes:
# ✅ Tests: apps/cms, apps/setup, apps/api-graphql
# ❌ Skips: apps/cms-media, apps/cms-dashboard
```

**2. Build Caching**
```bash
# GraphQL schema unchanged → use cached build
nx build api-graphql
# → Using cache from previous build

# Database adapter changed → rebuild
nx build api-graphql
# → Building (shared/database changed)
```

**3. Dependency Graph**
```bash
nx graph

# Shows:
# api-graphql depends on:
# ├── shared/database
# ├── shared/hooks (auth)
# └── shared/stores (config)
```

**4. Parallel Execution**
```bash
# Build API and CMS in parallel
nx run-many --target=build --projects=cms,api-graphql --parallel=2
```

---

## Implementation Guide

### Step 1: Create Base Configs (Week 1)

1. **Create base configuration files**:
```bash
# In repository root
touch svelte.config.base.js
touch vite.config.base.js
touch tsconfig.base.json
```

2. **Implement base configs** (see examples above)

3. **Update existing configs to use base**:
```javascript
// svelte.config.js (root) - for backward compatibility
import { getBaseSvelteConfig } from './svelte.config.base.js';
export default getBaseSvelteConfig();
```

### Step 2: Extract Media Workspace (Week 2-3)

1. **Create workspace structure**:
```bash
nx generate @nx/js:library cms-media --directory=apps
```

2. **Move media code**:
```bash
# Move components
mv src/components/media apps/cms-media/src/components/
mv src/components/imageEditor apps/cms-media/src/components/

# Move routes
mv src/routes/(app)/mediagallery apps/cms-media/src/routes/
mv src/routes/api/media apps/cms-media/src/routes/api/
```

3. **Update imports in main CMS**:
```typescript
// Before
import MediaGallery from '@components/media/Gallery.svelte';

// After
import MediaGallery from '@cms-media/components/Gallery.svelte';
```

4. **Configure workspace configs**:
```javascript
// apps/cms-media/svelte.config.js
import { getBaseSvelteConfig } from '../../svelte.config.base.js';
export default getBaseSvelteConfig({
	aliases: {
		'@cms-media': './src/lib'
	}
});
```

### Step 3: Extract Widgets to Shared (Week 4)

1. **Create shared library**:
```bash
nx generate @nx/js:library widgets --directory=shared
```

2. **Move widget code**:
```bash
mv src/widgets/* shared/widgets/src/
```

3. **Update imports**:
```typescript
// Before
import { widgetFactory } from '@widgets';

// After
import { widgetFactory } from '@shared/widgets';
```

### Step 4: Extract Config/Dashboard (Week 5-8)

Repeat similar process for:
- `apps/cms-config` (collection builder)
- `apps/cms-dashboard` (analytics)

### Step 5: Consider GraphQL Split (Later)

Only if needed based on traffic patterns and deployment requirements.

---

## Configuration File Organization

```
SveltyCMS/
├── svelte.config.base.js       # Shared Svelte config
├── vite.config.base.js         # Shared Vite config
├── tsconfig.base.json          # Shared TypeScript config
├── svelte.config.js            # Root config (backward compat)
├── vite.config.ts              # Root config (backward compat)
├── tsconfig.json               # Root config (references)
│
├── apps/
│   ├── setup/
│   │   ├── svelte.config.js    # Extends base
│   │   ├── vite.config.ts      # Extends base
│   │   └── tsconfig.json       # Extends base
│   ├── cms/
│   │   ├── svelte.config.js    # Extends base + custom
│   │   ├── vite.config.ts      # Extends base + custom
│   │   └── tsconfig.json       # Extends base
│   ├── cms-media/
│   │   ├── svelte.config.js    # Extends base
│   │   └── ...
│   └── api-graphql/            # (Optional)
│       └── ...
│
└── shared/
    ├── widgets/
    │   └── tsconfig.json       # Extends base
    └── ...
```

---

## Summary

### Key Recommendations

1. **Phase 1 (Immediate)**:
   - ✅ Create base config files (svelte.config.base.js, vite.config.base.js, tsconfig.base.json)
   - ✅ Extract `apps/cms-media` (biggest bundle impact)
   - ✅ Move widgets to `shared/widgets`

2. **Phase 2 (Soon)**:
   - ✅ Extract `apps/cms-config` (collection builder)
   - ✅ Extract `apps/cms-dashboard` (analytics)

3. **Phase 3 (Later)**:
   - 🔵 Consider `apps/api-graphql` only if deployment requires it

4. **Always**:
   - ✅ Keep `config/` shared (collections, private.ts)
   - ✅ Keep `docs/` and `tests/` as non-workspaces
   - ✅ Use base configs for consistency

### Benefits Summary

| Improvement | Bundle Size | Build Time | Deploy Flexibility | Complexity |
|-------------|-------------|------------|-------------------|------------|
| Base configs | - | ⬆️ Better cache | = | ⬇️ Lower |
| cms-media | ⬇️ -40% | ⬆️ Parallel | ⬆️ Independent | ➡️ Same |
| shared/widgets | ⬇️ -15% | ⬆️ Cache reuse | - | ⬇️ Lower |
| cms-config | ⬇️ -20% | ⬆️ Parallel | ⬆️ Optional | ➡️ Same |
| api-graphql | - | ⬆️ Parallel | ⬆️⬆️ High | ⬆️ Higher |
