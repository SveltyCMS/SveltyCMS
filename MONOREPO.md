# SveltyCMS Nx Monorepo Structure

## ⚠️ IMPORTANT: Workspace Structure is Scaffolding Only

**The workspace structure (`apps/` and `shared/`) contains configuration examples but NO actual source code yet.**

### Current Status

✅ **Working**: Root application in `src/` directory - use `bun dev` as normal  
❌ **Not Working**: Workspace applications in `apps/` - these are templates only  
📝 **Ready**: Base configuration files and documentation

### For Developers

**Continue using the existing development workflow:**
```bash
bun dev              # ✅ Works - runs from src/
bun build            # ✅ Works - builds from src/
bun test             # ✅ Works - tests existing code
```

**Do NOT use workspace commands yet:**
```bash
nx dev setup         # ❌ Fails - no code in apps/setup/src
nx dev cms           # ❌ Fails - no code in apps/cms/src
nx build setup       # ❌ Fails - workspace not ready
```

### What This PR Provides

1. **Documentation** - Complete guides for Nx monorepo structure
2. **Base Configs** - Reusable configuration files (svelte.config.base.js, etc.)
3. **Workspace Templates** - Example configurations in `apps/` and `shared/`
4. **Migration Guide** - Step-by-step instructions for future migration

**No code has been moved.** The existing application in `src/` continues to work normally.

See [MIGRATION.md](./MIGRATION.md) for details on the optional, incremental migration process.

---

## Structure Overview

```
SveltyCMS/
├── apps/                    # Applications
│   ├── setup/              # Setup wizard application
│   └── cms/                # Main CMS application
├── shared/                  # Shared libraries
│   ├── theme/              # TailwindCSS & Skeleton UI theme
│   ├── database/           # Database drivers (MongoDB/Drizzle)
│   ├── utils/              # Shared utility functions
│   ├── components/         # Shared UI components
│   ├── hooks/              # Global security & language hooks
│   ├── stores/             # Shared state management
│   └── paraglide/          # Global i18n configuration
├── docs/                    # Documentation (not a workspace)
└── tests/                   # Tests (not a workspace)
```

## Key Benefits

### 1. Optimal Performance
- Each app only bundles what it needs
- Tree-shaking eliminates unused code
- Conditional database driver loading

### 2. Efficient Caching
- Nx caches build outputs
- Database driver changes don't affect frontend builds
- Faster CI/CD pipelines

### 3. Flexible Deployment
- Apps can be deployed independently
- Setup wizard can run standalone
- CMS can scale separately

### 4. Developer Experience
- Shared code with app-specific optimizations
- Clear separation of concerns
- Easy to navigate and understand

### 5. Cost Effective
- Smaller bundles = faster load times
- Lower bandwidth usage
- Better resource utilization

## Applications

### apps/setup
The setup wizard for first-time installation. Only loads the database driver selection and configuration code.

**Port:** 5173 (dev), 4173 (preview)

```bash
nx dev setup
nx build setup
```

### apps/cms
The main CMS application with plans for further separation into:
- Media management
- Configuration (imageEditor, collectionBuilder)
- Content management

**Port:** 5174 (dev), 4174 (preview)

```bash
nx dev cms
nx build cms
```

## Shared Libraries

### shared/theme
TailwindCSS and Skeleton.dev v4 configuration. Flexible architecture allows each app to update to v5 separately when released.

### shared/database
Database drivers with conditional loading:
- MongoDB (via Mongoose)
- Drizzle ORM (MariaDB/PostgreSQL/MySQL)

Only the selected driver is bundled in production builds.

### shared/utils
Common utility functions used across workspaces.

### shared/components
Reusable UI components for consistency between apps.

### shared/hooks
Global security handling and language detection hooks.

### shared/stores
Shared state management using Svelte stores.

### shared/paraglide
Global i18n language definitions. Each workspace has its own messages folder for specific translations.

## Working with the Monorepo

### Install Dependencies
```bash
bun install
```

### Run Development Server
```bash
# Run setup wizard
nx dev setup

# Run CMS
nx dev cms

# Run both
nx run-many --target=dev --projects=setup,cms
```

### Build Projects
```bash
# Build specific app
nx build setup
nx build cms

# Build all apps
nx run-many --target=build --projects=setup,cms

# Build with affected
nx affected --target=build
```

### Test
```bash
# Test specific library
nx test utils
nx test database

# Test all
nx run-many --target=test --all

# Test affected
nx affected --target=test
```

### Lint
```bash
# Lint specific project
nx lint setup

# Lint all
nx run-many --target=lint --all
```

## Database Driver Loading

The monorepo uses dynamic imports to load only the selected database driver:

```typescript
// Only loads when MongoDB is configured
if (config.database.type === 'mongodb') {
  const { MongoDBAdapter } = await import('@shared/database/mongodb');
}

// Only loads when SQL is configured
if (config.database.type === 'sql') {
  const { DrizzleAdapter } = await import('@shared/database/drizzle');
}
```

## Documentation & Tests

### Documentation (docs/)
Documentation is not a workspace but a regular directory. This approach:
- Keeps docs simple and accessible
- Enables easy navigation for LLM/AI tools
- Allows direct editing without build steps
- Supports multiple documentation formats (MDX, MD)

**Best Practices for LLM/AI Understanding:**
1. Use clear, hierarchical structure
2. Include code examples inline
3. Maintain consistent naming conventions
4. Add JSDoc comments for complex functions
5. Use markdown tables for API references

### Tests (tests/)
Tests are organized by type, not workspace:
- `tests/unit/` - Unit tests for shared libraries
- `tests/integration/` - Integration tests across workspaces
- `tests/e2e/` - End-to-end tests for apps

This structure allows:
- Running all tests of a type easily
- Shared test utilities and fixtures
- Better CI/CD pipeline organization

## Dependency Graph

View the dependency graph to understand relationships:

```bash
nx graph
```

## Caching

Nx caches build outputs. To clear cache:

```bash
nx reset
```

## Migration from Existing Structure

The migration maintains backward compatibility:
1. Existing imports continue to work via path aliases
2. Gradual migration of components
3. Both structures coexist during transition
4. Full migration completed incrementally

## Performance Tips

1. **Use affected commands** - Only build/test what changed
2. **Leverage caching** - Don't disable Nx cache
3. **Optimize imports** - Use specific imports, not barrel exports
4. **Monitor bundle size** - Use build:analyze to check bundle sizes
5. **Profile builds** - Use Nx cloud for distributed builds (optional)

## Troubleshooting

### Build Issues
```bash
# Clear cache and rebuild
nx reset
nx build <project>
```

### Dependency Issues
```bash
# Reinstall dependencies
rm -rf node_modules
bun install
```

### Type Issues
```bash
# Regenerate types
nx run-many --target=build --all
```

## Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines on:
- Adding new workspaces
- Sharing code between apps
- Testing requirements
- Documentation standards

## License

BUSL-1.1 - See [LICENSE](../LICENSE)
