# Plugin System Developer Guide

## Overview

The SveltyCMS plugin system allows developers to extend the CMS functionality with custom features. Plugins are:

- **Language-aware**: All plugin data includes language context from `params.language`
- **Multi-tenant**: Plugin tables must store `tenantId` (use `'default'` when MULTI_TENANT is disabled)
- **Migration-based**: Plugins use migrations to manage their database schema
- **Nx-friendly**: Clean boundaries under `src/plugins/` for future monorepo migration
- **Secure**: Separate public/private settings, enforce authz and SSRF protection

## Plugin Architecture

```
src/plugins/
├── types.ts          # Core plugin type definitions
├── registry.ts       # Plugin registry and service
├── index.ts          # Plugin initialization
└── pagespeed/        # Example plugin
    ├── index.ts      # Plugin definition
    ├── types.ts      # Plugin-specific types
    ├── migrations.ts # Database migrations
    ├── service.ts    # Business logic
    └── urlUtils.ts   # Utility functions
```

## Creating a Plugin

### 1. Define Plugin Metadata

```typescript
import type { Plugin } from '@src/plugins/types';

export const myPlugin: Plugin = {
  metadata: {
    id: 'my-plugin',
    name: 'My Awesome Plugin',
    version: '1.0.0',
    description: 'Does amazing things',
    author: 'Your Name',
    enabled: true
  },
  
  migrations: [...],
  ssrHook: mySSRHook,
  ui: {...},
  config: {...}
};
```

### 2. Create Migrations

Migrations manage your plugin's database tables:

```typescript
import type { PluginMigration } from '@src/plugins/types';

export const createMyTable: PluginMigration = {
  id: '001_create_my_table',
  pluginId: 'my-plugin',
  version: 1,
  description: 'Create plugin_my_data table',
  
  async up(dbAdapter) {
    // Create table by inserting a test record
    const testRecord = {
      entryId: '__INIT__',
      collectionId: '__INIT__',
      tenantId: 'system',
      // ... your fields
    };
    
    const result = await dbAdapter.crud.insert('plugin_my_data', testRecord);
    
    if (result.success) {
      // Delete the init record
      await dbAdapter.crud.deleteMany('plugin_my_data', {
        entryId: '__INIT__'
      });
    }
  }
};
```

**Important**: Always include `tenantId` in plugin tables. Use `'default'` when MULTI_TENANT is disabled.

### 3. Implement SSR Hook

SSR hooks enrich entry list data during server-side rendering:

```typescript
import type { PluginContext, PluginEntryData } from '@src/plugins/types';

async function mySSRHook(
  context: PluginContext,
  entries: Array<Record<string, unknown>>
): Promise<PluginEntryData[]> {
  const { dbAdapter, collectionSchema, language, tenantId } = context;
  
  // Extract entry IDs
  const entryIds = entries.map((e) => e._id as string).filter(Boolean);
  
  // Fetch plugin data for entries
  const result = await dbAdapter.crud.findMany('plugin_my_data', {
    entryId: { $in: entryIds },
    collectionId: collectionSchema._id,
    language,  // Language-aware!
    tenantId   // Tenant-aware!
  });
  
  // Return enriched data
  return result.success && result.data
    ? result.data.map((item) => ({
        entryId: item.entryId,
        data: { myField: item.myField },
        updatedAt: new Date(item.updatedAt)
      }))
    : [];
}
```

### 4. Define UI Contributions

Specify how your plugin data appears in EntryList:

```typescript
ui: {
  columns: [
    {
      id: 'my_field',
      label: 'My Field',
      width: '120px',
      sortable: false
    }
  ],
  actions: [
    {
      id: 'my_action',
      label: 'My Action',
      icon: 'mdi:star',
      handler: 'handleMyAction'
    }
  ]
}
```

### 5. Register Your Plugin

Add to `src/plugins/index.ts`:

```typescript
import { myPlugin } from './my-plugin';

export const availablePlugins: Plugin[] = [
  pageSpeedPlugin,
  myPlugin  // Add your plugin here
];
```

## Language-Aware URL Derivation

Plugins often need to derive public URLs for entries. Follow this pattern:

```typescript
import { deriveEntryUrl } from '@src/plugins/pagespeed/urlUtils';
import { getPublicSettingSync } from '@src/services/settingsService';

const baseUrl = getPublicSettingSync('SITE_URL') as string;
const baseLocale = getPublicSettingSync('BASE_LOCALE') as string || 'en';

const url = deriveEntryUrl(baseUrl, language, baseLocale, entry, schema);
```

**URL Pattern Rules**:
- Base locale (e.g., 'en'): No prefix → `/about-us`
- Translated languages (e.g., 'de'): Prefixed → `/de/uber-uns`

## Security Best Practices

### 1. SSRF Protection

Never accept arbitrary URLs from users. Always derive URLs from entry data:

```typescript
// ❌ BAD: Accepting URL from request
const { url } = await request.json();

// ✅ GOOD: Deriving URL from entry
const url = deriveEntryUrl(baseUrl, language, baseLocale, entry, schema);
if (!validateUrl(url, baseUrl)) {
  throw error(400, 'Invalid URL');
}
```

### 2. Authorization

Plugin endpoints must enforce authorization:

```typescript
export const POST: RequestHandler = async ({ request, locals }) => {
  const { user, tenantId, dbAdapter } = locals;
  
  // Check authentication
  if (!user) {
    throw error(401, 'Unauthorized');
  }
  
  // Validate tenant isolation
  if (entry.tenantId !== tenantId) {
    throw error(403, 'Access denied: tenant mismatch');
  }
  
  // ... plugin logic
};
```

### 3. Private Settings

Store sensitive data (API keys) in private settings:

```typescript
import { getPrivateSettingSync } from '@src/services/settingsService';

const apiKey = getPrivateSettingSync('MY_PLUGIN_API_KEY');
```

## API Endpoints

Plugin endpoints should be namespaced under `/api/plugins/<plugin-id>/`:

```
src/routes/api/plugins/
└── my-plugin/
    └── +server.ts
```

Example endpoint:

```typescript
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
  const { user, tenantId, dbAdapter } = locals;
  
  if (!user) throw error(401, 'Unauthorized');
  
  const { entryId, language } = await request.json();
  
  // Plugin logic here
  
  return json({ success: true, data: {...} });
};
```

## Testing

Unit tests should be added to `tests/bun/plugins/`:

```typescript
import { describe, test, expect } from 'bun:test';
import { myFunction } from '@src/plugins/my-plugin/utils';

describe('My Plugin Utils', () => {
  test('should do something', () => {
    const result = myFunction('input');
    expect(result).toBe('expected');
  });
});
```

## Migration Best Practices

1. **Incremental**: Create one migration per schema change
2. **Versioned**: Use sequential version numbers (1, 2, 3...)
3. **Idempotent**: Migrations should be safe to run multiple times
4. **Tenant-aware**: Always include `tenantId` in plugin tables
5. **Language-aware**: Include `language` field for language-specific data

## Example: PageSpeed Plugin

See `src/plugins/pagespeed/` for a complete example that demonstrates:

- ✅ Migration-based table creation
- ✅ Language-aware URL derivation
- ✅ SSRF protection
- ✅ SSR data enrichment
- ✅ Secure API endpoint
- ✅ Result caching

## Plugin Lifecycle

1. **Server Startup** → Plugins registered from `availablePlugins`
2. **Migration Check** → Pending migrations executed via registry
3. **SSR Request** → Plugin hooks called during `+page.server.ts` load
4. **Client Render** → EntryList displays plugin columns
5. **User Action** → Client calls plugin API endpoint
6. **Data Update** → Plugin stores results in database
7. **SSR Refresh** → Updated data displayed on next load

## Troubleshooting

### Plugin not showing data

1. Check plugin is enabled: `metadata.enabled = true`
2. Check collection is included: `enabledCollections` array
3. Check SSR hook is implemented and returning data
4. Check database table exists (run migrations)

### Migration not running

1. Check plugin is in `availablePlugins` array
2. Check migration version is sequential
3. Check `plugin_migrations` table for applied migrations
4. Check server logs for migration errors

### URL derivation failing

1. Check schema has slug field (`widget: 'slug'`)
2. Check entry has slug value
3. Check base URL is configured in system settings
4. Check language parameter matches available languages

## Resources

- Plugin Types: `src/plugins/types.ts`
- Registry API: `src/plugins/registry.ts`
- Example Plugin: `src/plugins/pagespeed/`
- Database Interface: `src/databases/dbInterface.ts`
