---
title: Vite + Tailwind v4 — Path Alias Resolution Fix
description: Fix ERR_MODULE_NOT_FOUND for @-prefixed path aliases during vite build
path: docs/contributing/vite8-tailwind-build-fix.md
updated: 2026-07-08
---

# Vite + Tailwind v4 — Path Alias Resolution Fix

## Problem

`vite build` fails with:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@utils/logger'
  imported from node_modules/.vite-temp/vite.config.ts
```

## Root Cause

`@tailwindcss/node` ships `dist/esm-cache.loader.mjs` — an ESM customization
hook registered via `module.register()` that wraps Node's global module
resolver. This hook intercepts ALL `import()` calls during the build pipeline.

When Vite evaluates the config (copied to `.vite-temp/` for safe processing),
the evaluation chain passes through Tailwind's hook. Our `@src/*` and `@utils/*`
path aliases are not `node_modules` packages, so Node's native resolver fails
with `ERR_MODULE_NOT_FOUND`.

**Vite's `resolve.alias` does NOT apply through this hook** — the hook operates
at the Node.js module resolution level, before Vite's resolver runs.

### Why a fresh SvelteKit install doesn't need this

Simple setups (`tailwindcss()` + `sveltekit()` only) don't trigger module
resolution through Tailwind's hook during config evaluation. Our config has
10+ custom plugins, `vitest/config` import, and dynamic imports that reach
the hook during config processing.

### Why `package.json` `"imports"` doesn't fix it

Node's subpath imports map (`"@utils/*": "./src/utils/*"`) resolves to paths
without `.ts` extensions. Node can't find `./src/utils/logger` because the
actual file is `./src/utils/logger.ts`. Direct imports with explicit `.ts`
extensions work, but the imports map strips them.

## Fix: Junction Shims

`scripts/fix-tailwind-build.mjs` creates directory symlinks at the filesystem
level where Node's native resolver CAN find them:

```
node_modules/@src    → src/
node_modules/@utils  → src/utils/
... (all 20 aliases from config/aliases.json)
```

Now `import("@utils/logger")` resolves to `node_modules/@utils/logger` →
`src/utils/logger.ts` which Node can find directly.

The script runs automatically via the `prepare` lifecycle hook:

```json
"prepare": "git config core.hooksPath .githooks && node scripts/fix-tailwind-build.mjs"
```

- Uses plain `node` — no bun/tsx/npx dependency
- Reads aliases from `config/aliases.json` (shared with vite/vitest configs)
- Shims live in `node_modules/` (gitignored), recreated on every install

## Manual Fix

```bash
node scripts/fix-tailwind-build.mjs
bun run build
```
