# Nx Monorepo Migration Guide

This guide helps you migrate from the current structure to the new Nx monorepo structure.

## Overview

The new structure separates the codebase into focused workspaces:
- **apps/setup**: Setup wizard (extracted from `src/routes/setup`)
- **apps/cms**: Main CMS application (extracted from `src/routes/(app)`, `src/routes/api`)
- **shared/***: Shared libraries (extracted from `src/`)

## Related Documentation

- **[CMS-WORKSPACE-ENHANCEMENT.md](./docs/CMS-WORKSPACE-ENHANCEMENT.md)** - How to further modularize CMS (media, imageEditor, dashboard, collectionBuilder, GraphQL)
- **[MONOREPO.md](./MONOREPO.md)** - Complete usage guide with Nx commands
- **Base Config Files**: `svelte.config.base.js`, `vite.config.base.js`, `tsconfig.base.json`

## Migration Steps

### Phase 1: Setup (Completed)

✅ Nx workspace initialized
✅ Project structure created
✅ Project configurations added
✅ Documentation created

### Phase 2: Install Dependencies

```bash
# Install Nx and related dependencies
bun install
```

### Phase 3: Gradual Migration

The migration maintains backward compatibility. You can migrate incrementally:

#### Option A: Use New Structure Alongside Old

Both structures coexist. New code goes into workspaces, old code remains in `src/`:

```typescript
// Old imports still work
import { db } from '@databases';

// New imports available
import { loadDatabaseAdapter } from '@shared/database';
```

#### Option B: Full Migration

Move code from `src/` to appropriate workspaces:

1. **Move setup wizard**:
   ```bash
   # Create apps/setup structure
   mkdir -p apps/setup/src/routes
   
   # Move setup routes
   cp -r src/routes/setup apps/setup/src/routes/
   cp -r src/routes/setup apps/setup/src/components/
   ```

2. **Move main CMS**:
   ```bash
   # Create apps/cms structure
   mkdir -p apps/cms/src/routes
   
   # Move CMS routes
   cp -r src/routes/(app) apps/cms/src/routes/
   cp -r src/routes/api apps/cms/src/routes/
   cp -r src/routes/login apps/cms/src/routes/
   ```

3. **Move shared code**:
   ```bash
   # Database
   cp -r src/databases/* shared/database/src/
   
   # Components
   cp -r src/components/* shared/components/src/
   
   # Utils
   cp -r src/utils/* shared/utils/src/
   
   # Stores
   cp -r src/stores/* shared/stores/src/
   
   # Hooks
   cp -r src/hooks/* shared/hooks/src/
   ```

### Phase 4: Update Import Paths

Update imports to use new workspace paths:

#### Before
```typescript
import { db } from '@databases';
import { Button } from '@components';
import { slugify } from '@utils';
```

#### After
```typescript
import { loadDatabaseAdapter } from '@shared/database';
import { Button } from '@shared/components';
import { slugify } from '@shared/utils';
```

### Phase 5: Update Path Aliases

Update `svelte.config.js` aliases:

```javascript
alias: {
  // New workspace aliases
  '@shared/theme': './shared/theme/src',
  '@shared/database': './shared/database/src',
  '@shared/utils': './shared/utils/src',
  '@shared/components': './shared/components/src',
  '@shared/hooks': './shared/hooks/src',
  '@shared/stores': './shared/stores/src',
  '@shared/paraglide': './shared/paraglide/src',
  
  // Keep old aliases for backward compatibility
  '@databases': './src/databases',
  '@components': './src/components',
  '@utils': './src/utils',
  // ...
}
```

### Phase 6: Update Build Scripts

Update `package.json` scripts to use Nx:

```json
{
  "scripts": {
    "dev": "nx dev cms",
    "dev:setup": "nx dev setup",
    "dev:all": "nx run-many --target=dev --projects=setup,cms",
    
    "build": "nx run-many --target=build --projects=setup,cms",
    "build:setup": "nx build setup",
    "build:cms": "nx build cms",
    
    "test": "nx run-many --target=test --all",
    "test:affected": "nx affected --target=test",
    
    "lint": "nx run-many --target=lint --all"
  }
}
```

## Conditional Database Loading

The key feature of this migration is conditional database driver loading.

### Before (All Drivers Bundled)

```typescript
// src/databases/db.ts
import mongoose from 'mongoose';
import { drizzle } from 'drizzle-orm';

// Both MongoDB and Drizzle code bundled even if only one is used
export const db = config.type === 'mongodb' ? mongoose : drizzle;
```

**Problem**: ~2MB of unused code bundled

### After (Conditional Loading)

```typescript
// shared/database/src/index.ts
export async function loadDatabaseAdapter() {
  const config = await getConfig();
  
  if (config.database.type === 'mongodb') {
    // Only MongoDB bundled when used
    const { MongoDBAdapter } = await import('./mongodb/adapter');
    return new MongoDBAdapter(config);
  }
  
  if (config.database.type === 'sql') {
    // Only Drizzle bundled when used
    const { DrizzleAdapter } = await import('./drizzle/adapter');
    return new DrizzleAdapter(config);
  }
}
```

**Benefit**: ~75% reduction in database code size

## Workspace-Specific Features

### Setup Wizard (apps/setup)

Minimal bundle with only setup-related code:

```typescript
// apps/setup/src/lib/database.ts
import { loadDatabaseAdapter } from '@shared/database';

// Only the selected driver is loaded
export async function testConnection(config: DatabaseConfig) {
  const db = await loadDatabaseAdapter();
  await db.connect();
  // Test connection
  await db.disconnect();
}
```

### CMS Application (apps/cms)

Full CMS features with conditional loading:

```typescript
// apps/cms/src/lib/database.ts
import { loadDatabaseAdapter } from '@shared/database';

// Database adapter loaded at startup
export const db = await loadDatabaseAdapter();
```

## Testing the Migration

### 1. Test Setup Wizard

```bash
# Run setup in development
nx dev setup

# Build setup
nx build setup

# Verify bundle size
ls -lh dist/apps/setup
```

### 2. Test CMS

```bash
# Run CMS in development
nx dev cms

# Build CMS
nx build cms

# Verify bundle size
ls -lh dist/apps/cms
```

### 3. Test Shared Libraries

```bash
# Test all shared libraries
nx run-many --target=test --projects=utils,components,stores

# Build all shared libraries
nx run-many --target=build --projects=theme,database,utils,components,hooks,stores,paraglide
```

## Rollback Plan

If issues arise, you can rollback:

1. **Keep using old structure**:
   - Don't update imports
   - Continue using `src/` directory
   - New workspace code won't affect existing code

2. **Remove Nx**:
   ```bash
   # Uninstall Nx
   bun remove nx @nx/js @nx/vite @nx/workspace
   
   # Remove Nx files
   rm nx.json
   rm -rf apps/ shared/
   rm -rf .nx/
   ```

## Best Practices

1. **Migrate incrementally**: Don't migrate everything at once
2. **Test thoroughly**: Verify each workspace works independently
3. **Monitor bundle sizes**: Use `nx build:analyze` to check bundle sizes
4. **Use Nx cache**: Don't disable caching for better performance
5. **Document changes**: Update documentation as you migrate

## Common Issues

### Import Errors

**Problem**: Module not found errors after migration

**Solution**: Update tsconfig.json paths:

```json
{
  "compilerOptions": {
    "paths": {
      "@shared/database": ["./shared/database/src"],
      "@shared/utils": ["./shared/utils/src"],
      // ...
    }
  }
}
```

### Build Failures

**Problem**: Workspace builds fail

**Solution**: Check project.json configuration and ensure all dependencies are listed

### Type Errors

**Problem**: TypeScript can't find types

**Solution**: Run type generation:

```bash
nx run-many --target=build --all
```

## Migration Checklist

- [ ] Install Nx dependencies
- [ ] Create workspace structure
- [ ] Move setup wizard to apps/setup
- [ ] Move main CMS to apps/cms
- [ ] Move shared code to shared/*
- [ ] Update import paths
- [ ] Update path aliases
- [ ] Update build scripts
- [ ] Test setup wizard independently
- [ ] Test CMS independently
- [ ] Test shared libraries
- [ ] Update CI/CD pipelines
- [ ] Update documentation
- [ ] Train team on new structure

## Support

For questions or issues:
1. Check [MONOREPO.md](./MONOREPO.md) for structure details
2. Review workspace README files
3. Check [AI-DOCUMENTATION-GUIDE.md](./docs/AI-DOCUMENTATION-GUIDE.md)
4. Open an issue on GitHub

## Timeline

- **Week 1-2**: Setup workspace structure (✅ Complete)
- **Week 3-4**: Migrate shared libraries
- **Week 5-6**: Migrate applications
- **Week 7-8**: Testing and refinement
- **Week 9**: Full migration complete
