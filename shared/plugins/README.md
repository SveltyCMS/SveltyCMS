# SveltyCMS Plugin System

A language-aware, multi-tenant plugin system for extending SveltyCMS functionality.

## Overview

The plugin system allows developers to extend SveltyCMS with custom features while maintaining clean architectural boundaries in the NX monorepo.

## Key Features

- **Language-Aware**: All plugin data includes language context
- **Multi-Tenant**: Designed for multi-tenant deployments
- **Database Migrations**: Plugins can manage their own database schemas
- **SSR Hooks**: Enrich entry list data server-side
- **UI Contributions**: Add columns and actions to the EntryList
- **Secure**: Separate public/private configuration

## Plugin Structure

```typescript
interface Plugin {
  metadata: PluginMetadata;      // Plugin info (id, name, version)
  migrations?: PluginMigration[]; // Database schema changes
  ssrHook?: PluginSSRHook;        // Server-side data enrichment
  ui?: PluginUIContribution;      // UI columns and actions
  config?: PluginConfig;          // Public/private settings
  enabledCollections?: string[];  // Which collections to enable for
}
```

## Creating a Plugin

### 1. Define Plugin Metadata

```typescript
import type { Plugin } from '$shared/plugins';

export const myPlugin: Plugin = {
  metadata: {
    id: 'my-plugin',
    name: 'My Plugin',
    version: '1.0.0',
    description: 'Does something awesome',
    enabled: true
  }
};
```

### 2. Add Database Migrations (Optional)

```typescript
migrations: [
  {
    id: '001_create_plugin_table',
    pluginId: 'my-plugin',
    version: 1,
    description: 'Create plugin data table',
    async up(dbAdapter) {
      // Create your plugin's collections/tables
    }
  }
]
```

### 3. Implement SSR Hook (Optional)

```typescript
async ssrHook(context, entries) {
  const { user, tenantId, language, dbAdapter } = context;
  
  // Fetch additional data for entries
  const pluginData = await dbAdapter.find('my_plugin_data', {
    entryId: { $in: entries.map(e => e._id) },
    tenantId,
    language
  });
  
  return pluginData.map(data => ({
    entryId: data.entryId,
    data: data.score,
    updatedAt: new Date()
  }));
}
```

### 4. Add UI Contributions (Optional)

```typescript
ui: {
  columns: [
    {
      id: 'my-column',
      label: 'My Data',
      width: '100px',
      sortable: true
    }
  ],
  actions: [
    {
      id: 'refresh',
      label: 'Refresh',
      icon: 'mdi:refresh',
      handler: 'handleRefresh'
    }
  ]
}
```

## Example Plugin: PageSpeed

See `apps/cms/src/plugins/pagespeed/` for a complete example that:
- Analyzes page speed for entries
- Stores results in database
- Displays scores in EntryList
- Provides refresh action

## Integration Status

This plugin system has been integrated into the NX monorepo structure:

✅ Core types defined in `shared/plugins/src/types.ts`
✅ Plugin registry in `shared/plugins/src/registry.ts`
✅ Exports in `shared/plugins/src/index.ts`

## Pending Integration

The following features from the original branches still need integration:
- PageSpeed plugin implementation
- Plugin UI components
- API endpoints for plugin management
- Documentation updates

## Learn More

- [Plugin Architecture Documentation](../../../docs/plugins/ARCHITECTURE_DIAGRAM.md)
- [Developer Guide](../../../docs/plugins/developer-guide.md)
- [Implementation Summary](../../../docs/plugins/IMPLEMENTATION_SUMMARY.md)

## License

Part of SveltyCMS - see main LICENSE file
