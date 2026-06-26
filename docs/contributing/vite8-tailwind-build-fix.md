---
title: Vite 8 + Tailwind v4 Build Fix
description: Fix module resolution failures during vite build with Tailwind v4
path: docs/contributing/vite8-tailwind-build-fix.md
updated: 2026-06-26
---

# Vite 8 + Tailwind v4 Build Fix

## Problem

`vite build` fails with:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@src/routes'
  imported from node_modules/.vite-temp/vite.config.ts
```

Followed by cascading failures for other path aliases (`@utils/logger`,
`$app/environment`, etc.)

## Root Cause

`@tailwindcss/vite` registers a Node.js ESM loader hook that intercepts ALL
module resolution during the SSR build — not just class scanning. Vite's
`resolve.alias` does NOT apply through this hook. When Tailwind encounters
`import("@src/routes/setup/...")`, Node's native resolver treats `@src/routes`
as an npm scoped package and fails with `ERR_MODULE_NOT_FOUND`.

## Why `@source` Globs Don't Fix It

Tailwind v4's `@source` directive with file globs only limits which files
Tailwind _scans for utility classes_. The ESM loader hook operates at the
Node.js module resolution level — it intercepts ALL imports regardless of
whether the file is in Tailwind's scan scope.

This means even with `@source "../src/**/*.svelte"`, the loader hook still
sees and tries to resolve `@src/routes/setup/...` imports from TypeScript files.

## Fix: Junction Shims

`scripts/fix-tailwind-build.ts` creates junction points (directory symlinks)
in `node_modules/@xxx` → `actual/path` for every Vite path alias. This makes
Node's native resolver find these "packages" successfully through the loader
hook.

The shims are:

- `@src` → `src/`
- `@utils` → `src/utils/`
- `@components` → `src/components/`
- (all other `@`-prefixed path aliases)
- `$app` → `node_modules/@sveltejs/kit/src/runtime/app`

The script runs automatically via the `prepare` lifecycle hook before every
build:

```json
{
  "scripts": {
    "prepare": "git config core.hooksPath .githooks && bun run scripts/fix-tailwind-build.ts"
  }
}
```

The shims are gitignored (`node_modules` is always gitignored) and recreated
on each `bun install` or `bun run prepare`.

## Manual Fix

If the build fails with `ERR_MODULE_NOT_FOUND` for a `@xxx` or `$xxx` alias:

```bash
bun run scripts/fix-tailwind-build.ts
bun run build
```
