---
title: Vite 8 + Tailwind v4 Build Fix
description: Fix module resolution failures during vite build with Tailwind v4
path: docs/contributing/vite8-tailwind-build-fix.md
updated: 2026-07-08
---

# Vite 8 + Tailwind v4 Build Fix

## Problem

`vite build` shows UNRESOLVED_IMPORT warnings:

```
Could not resolve '@utils/logger' in src/routes/setup/preset-collections.server.ts
Module not found, treating it as an external dependency
```

Or in some environments, the build fails with:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@utils/logger'
  imported from node_modules/.vite-temp/vite.config.ts
```

## Root Cause

`@tailwindcss/vite` registers a Node.js ESM loader hook that intercepts module
resolution during the SSR build. Vite's `resolve.alias` does NOT apply through
this hook. When the build encounters `import("@utils/logger")`, Node's native
resolver treats `@utils/logger` as an npm scoped package and either warns
(UNRESOLVED_IMPORT) or errors (ERR_MODULE_NOT_FOUND).

The `@source` CSS directive only limits which files Tailwind scans for utility
classes — it does not affect module resolution.

## Fix: Junction Shims

`scripts/fix-tailwind-build.mjs` creates directory symlinks in
`node_modules/@xxx` → actual path for every Vite path alias:

- `@src` → `src/`
- `@utils` → `src/utils/`
- `@components` → `src/components/`
- ... (all `@`-prefixed path aliases from `vite.config.ts` and `svelte.config.js`)

The script runs automatically via the `prepare` lifecycle hook on every install:

```json
"prepare": "git config core.hooksPath .githooks && node scripts/fix-tailwind-build.mjs"
```

It uses plain `node` — no bun, tsx, or npx required. Works with any package manager.

The shims live in `node_modules/` (always gitignored) and are recreated on each
`bun install` or `npm install`.

## Manual Fix

If the build shows UNRESOLVED_IMPORT warnings or ERR_MODULE_NOT_FOUND:

```bash
node scripts/fix-tailwind-build.mjs
bun run build
```
