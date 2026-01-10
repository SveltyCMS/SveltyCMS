# ⚠️ WORKSPACE NOT READY FOR USE

This workspace configuration is **scaffolding only** and cannot be used until source code is migrated here.

## Current Status

❌ **NOT FUNCTIONAL** - No source code in this workspace yet  
❌ Do not run `nx dev cms` or `bun dev` from this directory  
✅ Use root `bun dev` for development (uses existing `src/` directory)

## What This Is

This directory contains:
- `project.json` - Nx workspace configuration (scaffold)
- `svelte.config.js` - SvelteKit configuration example
- `vite.config.ts` - Vite configuration example  
- `tsconfig.json` - TypeScript configuration example

These are **examples** showing how the workspace will be configured after migration.

## When Will This Work?

This workspace will become functional after:

1. **Migration Step**: Code from `src/routes/(app)` and `src/routes/api` is moved to `apps/cms/src/routes`
2. **Structure Created**:
   ```
   apps/cms/
   ├── src/
   │   ├── routes/
   │   │   ├── (app)/
   │   │   └── api/
   │   ├── lib/
   │   ├── components/
   │   └── paraglide/  (generated)
   ├── static/
   ├── project.json
   ├── svelte.config.js
   ├── vite.config.ts
   └── tsconfig.json
   ```
3. **Dependencies Configured**: Package.json updated for workspace
4. **Paraglide Setup**: i18n messages configured for CMS workspace

## How to Migrate (DO NOT DO YET)

See [MIGRATION.md](../../MIGRATION.md) for the complete migration guide.

The migration is **optional** and should be done incrementally when you're ready.

## Current Development

For now, continue using:

```bash
# From repository root
bun dev              # Runs existing app from src/
```

Do NOT run:
```bash
# These will fail - workspaces not ready
nx dev cms           # ❌ No code migrated yet
cd apps/cms && bun dev    # ❌ No src/ directory
```

## Questions?

See:
- [MONOREPO.md](../../MONOREPO.md) - Nx monorepo structure overview
- [MIGRATION.md](../../MIGRATION.md) - Migration guide
- [docs/CMS-WORKSPACE-ENHANCEMENT.md](../../docs/CMS-WORKSPACE-ENHANCEMENT.md) - Future enhancements

---

**TL;DR**: This is a template/example. Don't use it yet. Continue using root `bun dev` for development.
