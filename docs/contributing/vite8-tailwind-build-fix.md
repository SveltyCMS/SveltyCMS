---
title: Vite 8 + Tailwind v4 Build Fix
description: Fix @src/routes resolution during vite build with @source file globs
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

## Root Cause

`@tailwindcss/vite` registers a Node.js ESM loader hook that intercepts module
resolution during the SSR build. By default, Tailwind v4 auto-scans ALL project
files. When it encounters `import("@src/routes/setup/...")` in server-only
TypeScript files, it resolves `@src/routes` via Node.js native resolution —
treating it as an npm scoped package and failing.

Vite's `resolve.alias` does NOT apply through Tailwind's loader hook.

## Fix

Use `@source` with **file globs** (not directories) in `src/app.css` to tell
Tailwind to only scan `.svelte` and `.html` files:

```css
@import "tailwindcss";

@source "../src/**/*.svelte";
@source "../src/**/*.html";
```

File globs **replace** Tailwind's default auto-scan. Directory paths
(`@source "../src/components"`) are additive and don't fix the issue.

Tailwind only scans Svelte components and HTML templates — it never touches
`src/hooks/`, `src/routes/api/`, `src/routes/setup/`, or any other server-only
TypeScript files that contain `@src/routes` dynamic imports.

## Why Not Junction Shims

Earlier attempts used `scripts/fix-tailwind-build.ts` to create junction points
in `node_modules/@src` → `src/`. This was removed because:

- `@source` globs are simpler and more correct
- Junction shims pollute `node_modules`
- Tailwind has no business scanning server-side TypeScript files
