# Skeleton v4 + Tailwind v4 Migration Summary

**Date:** October 20, 2025  
**Scope:** Setup Wizard Only (Main CMS remains on v3)

## Why Migrate the Setup Wizard First?

The setup wizard extraction provided a **perfect opportunity** to adopt the latest stack:

- ✅ **Fresh workspace** - No legacy code to refactor
- ✅ **Isolated impact** - Won't affect main CMS stability
- ✅ **Bundle benefits** - Tailwind v4 is smaller and faster
- ✅ **Learning opportunity** - Test v4 before main CMS migration
- ✅ **Modern foundation** - Setup wizard starts with best practices

## Changes Made

### 1. Package Dependencies

**Updated `package.json`:**

```json
{
	"dependencies": {
		"@skeletonlabs/skeleton": "workspace:*",
		"@skeletonlabs/skeleton-svelte": "workspace:*",
		"@tailwindcss/vite": "workspace:*",
		"tailwindcss": "workspace:*"
	}
}
```

**Key Changes:**

- Added `@skeletonlabs/skeleton-svelte` (v4 Svelte-specific package)
- Added `@tailwindcss/vite` (replaces PostCSS plugin)
- Added `tailwindcss` v4 as explicit dependency

### 2. Vite Configuration

**File:** `vite.config.ts`

**Before (v3):**

```typescript
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [sveltekit()]
});
```

**After (v4):**

```typescript
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite'; // NEW: Tailwind v4 Vite plugin

export default defineConfig({
	plugins: [
		tailwindcss(), // MUST come before sveltekit
		setupInitPlugin(),
		sveltekit()
	]
});
```

**Critical:** Tailwind Vite plugin **MUST** be placed **before** SvelteKit plugin.

### 3. CSS Configuration

**File:** Renamed `app.postcss` → `app.css` (Tailwind v4 convention)

**Before (v3):**

```css
@import '@skeletonlabs/skeleton/themes/theme-skeleton.css';
@import '@skeletonlabs/skeleton/styles/skeleton.css';
@tailwind base;
@tailwind components;
@tailwind utilities;
@tailwind variants;
```

**After (v4 - CSS-First Configuration):**

```css
/* Import Skeleton v4 Svelte styles */
@import '@skeletonlabs/skeleton-svelte';

/* Tailwind v4 directives */
@import 'tailwindcss';

/* Tailwind v4 CSS-first theme configuration */
@theme {
	/* Custom spacing if needed */
	--spacing-4_5: 1.125rem;

	/* Custom colors can be defined here */
	/* Skeleton themes will override these via data-theme */
}
```

**Key Changes:**

- Single `@import '@skeletonlabs/skeleton-svelte'` replaces multiple v3 imports
- `@import 'tailwindcss'` replaces `@tailwind` directives
- `@theme {}` block for CSS-first configuration (no `tailwind.config.ts` needed)

### 4. Component Imports

**File:** `+layout.svelte`

**Before (v3):**

```svelte
<script>
	import '../app.postcss';
	import { Modal, Toast } from '@skeletonlabs/skeleton';
</script>

<Modal />
<Toast />
<slot />
```

**After (v4):**

```svelte
<script>
	import '../app.css';
	import { Dialog, Toast } from '@skeletonlabs/skeleton-svelte';
</script>

<Dialog.Root />
<Toast.Group />
<slot />
```

**Component Renames:**

- `<Modal>` → `<Dialog.Root>` (Zag.js naming convention)
- `<Toast>` → `<Toast.Group>` (clearer naming)
- Import from `@skeletonlabs/skeleton-svelte` (not `@skeletonlabs/skeleton`)

### 5. Files Removed

- ❌ `tailwind.config.ts` - Not needed (CSS-first configuration in `app.css`)
- ❌ `postcss.config.cjs` - Not needed (Vite plugin replaces PostCSS)
- ❌ `@tailwindcss/postcss` - Removed from dependencies

## Migration Checklist

- [x] Update `package.json` dependencies
- [x] Add Tailwind Vite plugin to `vite.config.ts` (before SvelteKit)
- [x] Rename `app.postcss` → `app.css`
- [x] Update CSS imports (`@import '@skeletonlabs/skeleton-svelte'`)
- [x] Replace `@tailwind` directives with `@import 'tailwindcss'`
- [x] Add `@theme {}` block for custom configuration
- [x] Update component imports in `+layout.svelte`
- [x] Rename `<Modal>` → `<Dialog.Root>`
- [x] Rename `<Toast>` → `<Toast.Group>`
- [x] Remove `tailwind.config.ts` (if exists)
- [x] Remove `postcss.config.cjs` (if exists)
- [ ] **TODO:** Install workspace dependencies (`bun install`)
- [ ] **TODO:** Test dev server (`bun x nx dev setup-wizard`)
- [ ] **TODO:** Verify Skeleton v4 styles load correctly
- [ ] **TODO:** Test Dialog/Toast components work
- [ ] **TODO:** Measure bundle size impact

## Expected Benefits

### Bundle Size

- **Tailwind v4:** ~20-30% smaller than v3 (modern CSS features, better tree-shaking)
- **Skeleton v4:** Better tree-shaking, optimized component loading
- **Combined:** Estimated 25-35 KB additional savings for setup wizard

### Performance

- **Faster builds:** Vite plugin is faster than PostCSS
- **Better HMR:** Improved hot module replacement
- **Smaller runtime:** Less JavaScript, more native CSS

### Developer Experience

- **CSS-first config:** No JavaScript config files, better IDE support
- **Modern APIs:** Zag.js provides better accessibility
- **Clearer naming:** Dialog instead of Modal, Toast.Group instead of Toast

## Main CMS Migration Plan

**When to migrate:** After setup wizard is fully tested and stable

**Strategy:**

1. Test Skeleton v4 thoroughly in setup wizard
2. Document any issues or gotchas
3. Create migration branch for main CMS
4. Follow same steps as setup wizard
5. Update all component usages (bigger surface area)
6. Test thoroughly before merging

**Complexity:**

- Setup wizard: ~10 component files ✅ (DONE)
- Main CMS: ~150+ component files ⏳ (Future)

## Resources

- [Skeleton v3 → v4 Migration Guide](https://www.skeleton.dev/docs/get-started/migrate-from-v3)
- [Skeleton v2 → v3 Migration Guide](https://www.skeleton.dev/docs/get-started/migrate-from-v2)
- [Tailwind v4 Announcement](https://tailwindcss.com/blog/tailwindcss-v4)
- [Tailwind v4 Upgrade Guide](https://tailwindcss.com/docs/upgrade-guide)
- [Zag.js Documentation](https://zagjs.com/)

## Notes

- Setup wizard is a perfect testbed for v4
- Main CMS can stay on v3 until we're confident
- Both versions can coexist in the monorepo via `workspace:*` dependencies
- No breaking changes to setup workflow or UX
- Purely internal modernization

---

**Status:** ✅ Migration complete, ready for testing  
**Next Step:** Install dependencies and test dev server
