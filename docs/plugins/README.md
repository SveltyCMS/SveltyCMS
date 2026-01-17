# SveltyCMS Plugin System

## Overview

The SveltyCMS plugin system enables developers to extend CMS functionality with custom features while maintaining security, performance, and multi-tenant isolation.

## Key Features

- ✅ **Language-Aware**: Automatic language context from route parameters
- ✅ **Multi-Tenant**: Secure tenant isolation with `tenantId` tracking
- ✅ **Migration-Based**: Database schema management via versioned migrations
- ✅ **SSR-First**: Server-side data enrichment without client fetching
- ✅ **Nx-Friendly**: Clean code boundaries for future monorepo migration
- ✅ **Secure**: SSRF protection, authorization enforcement, private settings

## Architecture

```
src/plugins/
├── types.ts              # Core type definitions
├── registry.ts           # Plugin registration and lifecycle
├── index.ts              # Initialization and exports
└── <plugin-name>/        # Individual plugin
    ├── index.ts          # Plugin definition
    ├── types.ts          # Plugin-specific types
    ├── migrations.ts     # Database migrations
    ├── service.ts        # Business logic
    └── utils.ts          # Helper functions
```

## Built-in Plugins

### Google PageSpeed Insights

Monitors page performance using Google's PageSpeed Insights API.

**Features**:
- Fetches Core Web Vitals (LCP, FCP, CLS, TTI, TBT, SI)
- Language-aware URL derivation
- Automatic result caching (24-hour TTL)
- SSRF protection via URL validation
- Secure API key storage in private settings

**Configuration**:
1. Add Google PageSpeed API key to private settings: `GOOGLE_PAGESPEED_API_KEY`
2. Ensure `SITE_URL` is configured in system settings
3. Ensure `BASE_LOCALE` is set (defaults to 'en')

**Usage**:
- Plugin automatically enriches entry lists with cached scores
- Call `/api/plugins/pagespeed` to refresh metrics for an entry
- View performance scores in EntryList column

## Quick Start

### 1. Creating a Plugin

See [Developer Guide](./developer-guide.md) for detailed instructions.

```typescript
// src/plugins/my-plugin/index.ts
import type { Plugin } from '@src/plugins/types';

export const myPlugin: Plugin = {
  metadata: {
    id: 'my-plugin',
    name: 'My Plugin',
    version: '1.0.0',
    description: 'Does amazing things',
    enabled: true
  },
  migrations: [...],
  ssrHook: mySSRHook,
  ui: {...}
};
```

### 2. Registering a Plugin

Add to `src/plugins/index.ts`:

```typescript
import { myPlugin } from './my-plugin';

export const availablePlugins: Plugin[] = [
  pageSpeedPlugin,
  myPlugin  // Add here
];
```

### 3. Testing Locally

```bash
# Run unit tests
bun test tests/bun/plugins/

# Start dev server (migrations run automatically)
npm run dev
```

## Database Schema

### plugin_migrations

Tracks applied migrations across all plugins:

```typescript
{
  _id: string;
  pluginId: string;      // e.g., 'pagespeed'
  migrationId: string;   // e.g., '001_create_table'
  version: number;       // Sequential version
  appliedAt: Date;
  tenantId: string;      // Tenant isolation
}
```

### Plugin Tables

All plugin tables must include:
- `tenantId`: For multi-tenant isolation
- `language`: For language-aware features (where applicable)

Example:
```typescript
{
  _id: string;
  entryId: string;
  collectionId: string;
  tenantId: string;
  language: string;
  // ... plugin-specific fields
  fetchedAt: Date;
}
```

## Security

### SSRF Protection

Plugins must never accept arbitrary URLs from users:

```typescript
// ❌ BAD
const { url } = await request.json();
await fetch(url);

// ✅ GOOD
const url = deriveEntryUrl(baseUrl, language, baseLocale, entry, schema);
if (!validateUrl(url, baseUrl)) {
  throw error(400, 'Invalid URL');
}
```

### Authorization

All plugin endpoints must check:
1. User authentication
2. Tenant isolation
3. Permission levels (if applicable)

```typescript
if (!user) throw error(401, 'Unauthorized');
if (entry.tenantId !== tenantId) throw error(403, 'Forbidden');
```

### Private Settings

Store API keys and secrets in private settings:

```typescript
import { getPrivateSettingSync } from '@src/services/settingsService';

const apiKey = getPrivateSettingSync('MY_PLUGIN_API_KEY');
```

## Performance

### Caching Strategy

- **Database Cache**: Store plugin results in dedicated tables
- **TTL-based**: Set appropriate cache expiration (e.g., 24 hours)
- **Language-aware**: Include language in cache keys
- **Lazy Loading**: Fetch data only when needed

### SSR Optimization

- Plugin hooks run during server-side rendering
- No client-side data fetching in EntryList
- Batch database queries for multiple entries
- Return only essential data to minimize payload

## API Reference

### Plugin Interface

```typescript
interface Plugin {
  metadata: PluginMetadata;
  migrations?: PluginMigration[];
  ssrHook?: PluginSSRHook;
  ui?: PluginUIContribution;
  config?: PluginConfig;
  enabledCollections?: string[];
}
```

### Plugin Registry Methods

```typescript
pluginRegistry.register(plugin);              // Register a plugin
pluginRegistry.getAll();                      // Get all plugins
pluginRegistry.get(pluginId);                 // Get specific plugin
pluginRegistry.runMigrations(pluginId, ...);  // Run migrations
pluginRegistry.getSSRHooks(collectionId);     // Get SSR hooks
```

## Migration Lifecycle

1. **Server Startup** → `initializePlugins()` called
2. **Registration** → Plugins registered from `availablePlugins`
3. **Migration Check** → Compare applied vs available migrations
4. **Execution** → Run pending migrations in version order
5. **Tracking** → Record applied migrations in `plugin_migrations`

## Troubleshooting

### Plugin data not showing

1. Check plugin is enabled in metadata
2. Verify SSR hook is implemented and returning data
3. Check database table exists (run migrations)
4. Inspect server logs for errors

### Migrations not running

1. Ensure plugin is in `availablePlugins` array
2. Check migration has unique ID and sequential version
3. Verify `plugin_migrations` table exists
4. Check server logs for migration errors

### URL derivation fails

1. Ensure schema has slug field
2. Check entry has slug value
3. Verify `SITE_URL` is configured
4. Check language matches available languages

## Resources

- [Developer Guide](./developer-guide.md) - Complete plugin development guide
- [Example: PageSpeed Plugin](../../src/plugins/pagespeed/) - Reference implementation
- [Database Interface](../../src/databases/dbInterface.ts) - DB adapter API
- [Plugin Types](../../src/plugins/types.ts) - Type definitions

## License

Plugins inherit the license of SveltyCMS (BUSL-1.1).
