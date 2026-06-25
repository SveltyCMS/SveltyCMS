---
title: Vite 8 + Tailwind v4 Build Fix
description: Fixing @src/routes resolution during vite build with junction shims
path: docs/contributing/vite8-tailwind-build-fix.md
updated: 2026-06-25
---

# Vite 8 + Tailwind v4 Build Fix

## Problem

`vite build` fails with:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@src/routes'
  imported from node_modules/.vite-temp/vite.config.ts
```

This affects **all Vite 8 versions using Rolldown** — both VoidZero `vp build`
and standard `vite build`. The regression started in Vite 8.0.13 (#21406).

## Root Cause

Vite 8 uses Rolldown as its bundler. The `@tailwindcss/vite` plugin registers a
Node.js ESM loader hook that intercepts module resolution during the SSR build.
When Tailwind encounters `import("@src/routes/setup/...")` in server-only
TypeScript files, it resolves `@src/routes` via Node.js's native package
resolution — treating it as an npm scoped package and failing.

Vite's `resolve.alias` (`@src` → `./src`) does NOT apply through Tailwind's
loader hook because the hook runs at the Node.js ESM level, before Vite's
resolution pipeline.

## Fix

`scripts/fix-tailwind-build.ts` creates **junction points** in `node_modules/`
that map `@`-prefixed aliases to their actual source directories, so Node.js's
native resolver finds them directly. Also creates stub packages for SvelteKit
virtual modules (`$app`, `$env`) that Tailwind encounters transitively.

```bash
bun run scripts/fix-tailwind-build.ts   # run once before build
bun run build                            # ✅ passes
```

## Workaround vs Fix

**Workaround:** Junction shims (`node_modules/@src` → `src/`)

**Upstream fix:** Vite 8.0.13 introduced Rolldown lazy bundling (#21406) which
changed ESM loader hook behavior. Downgrading to Vite 8.0.12 avoids the issue
but we target 8.0.12 anyway. The root cause is in `@tailwindcss/node`'s loader
hook not being compatible with Rolldown's resolution pipeline.
