# Reusable Skeleton v4 + Tailwind v4 Strategy

**Created:** October 20, 2025  
**Status:** ✅ Theme package ready, UI package in progress  
**Goal:** Share modern v4 stack between Setup Wizard AND Main CMS  
**Goal:** Create shared configuration that can be reused for main CMS migration  
**Benefit:** Setup wizard becomes a **test bed** and **reference implementation**

## Strategy Overview

Instead of creating isolated config, we'll build:

1. ✅ **Shared UI package** (`packages/ui-v4/`) with Skeleton v4 components
2. ✅ **Shared theme package** (`packages/theme-v4/`) with Tailwind v4 config
3. ✅ **Fresh setup wizard** using these packages
4. ✅ **Migration path** documented for main CMS

## Package Structure

```
SveltyCMS/
├── apps/
│   ├── setup-wizard/              # Fresh v4 app (test bed)
│   │   ├── src/
│   │   ├── package.json           # Uses workspace:* for shared packages
│   │   └── ...
│   └── sveltycms/                 # Main CMS (stays v3 for now)
│
├── packages/
│   ├── ui-v4/                     # 🆕 Shared Skeleton v4 components
│   │   ├── src/
│   │   │   ├── index.ts           # Export all components
│   │   │   ├── Button/
│   │   │   ├── Card/
│   │   │   ├── Dialog/
│   │   │   ├── Toast/
│   │   │   └── ...
│   │   ├── package.json
│   │   └── README.md
│   │
│   ├── theme-v4/                  # 🆕 Shared Tailwind v4 + Skeleton theme
│   │   ├── src/
│   │   │   ├── app.css            # Base Tailwind v4 + Skeleton imports
│   │   │   ├── themes/
│   │   │   │   ├── cerberus.css   # Cerberus theme config
│   │   │   │   ├── pine.css       # Pine theme config
│   │   │   │   └── custom.css     # Custom SveltyCMS theme
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── README.md
│   │
│   ├── types/                     # Existing shared types
│   ├── utils/                     # Existing shared utilities
│   └── ...
```

## Implementation Plan

### Phase 1: Create Shared Packages

#### 1.1 Create `packages/theme-v4/`

**Purpose:** Centralized Tailwind v4 + Skeleton v4 theme configuration

**File: `packages/theme-v4/package.json`**

```json
{
	"name": "@sveltycms/theme-v4",
	"version": "1.0.0",
	"type": "module",
	"exports": {
		"./base": "./src/app.css",
		"./themes/*": "./src/themes/*.css"
	},
	"peerDependencies": {
		"@skeletonlabs/skeleton": "^4.0.0",
		"tailwindcss": "^4.0.0"
	}
}
```

**File: `packages/theme-v4/src/app.css`**

```css
/**
 * @file Base Tailwind v4 + Skeleton v4 configuration
 * Import this in any app's app.css
 */

/* Tailwind v4 */
@import 'tailwindcss';

/* Skeleton v4 Core */
@import '@skeletonlabs/skeleton';
@import '@skeletonlabs/skeleton-svelte';

/* Tailwind v4 CSS-first theme configuration */
@theme {
	/* Custom spacing */
	--spacing-4_5: 1.125rem;

	/* Custom breakpoints if needed */
	--breakpoint-3xl: 1920px;
}
```

**File: `packages/theme-v4/src/themes/cerberus.css`**

```css
/**
 * @file Cerberus theme for Skeleton v4
 * Import after base.css
 */
@import '@skeletonlabs/skeleton/themes/cerberus';
```

**File: `packages/theme-v4/src/themes/custom-sveltycms.css`**

```css
/**
 * @file Custom SveltyCMS theme
 * Based on Skeleton v4 theme system
 */

/* Custom brand colors in oklch format */
:root {
	--color-primary-50: oklch(0.98 0.02 250);
	--color-primary-100: oklch(0.95 0.04 250);
	--color-primary-200: oklch(0.9 0.08 250);
	/* ... continue with full palette */
}

/* Dark mode overrides */
[data-theme='dark'] {
	--color-surface-50: oklch(0.2 0.01 250);
	/* ... */
}
```

#### 1.2 Create `packages/ui-v4/`

**Purpose:** Reusable Skeleton v4 components with consistent props/styling

**File: `packages/ui-v4/package.json`**

```json
{
	"name": "@sveltycms/ui-v4",
	"version": "1.0.0",
	"type": "module",
	"svelte": "./src/index.js",
	"exports": {
		".": {
			"types": "./dist/index.d.ts",
			"svelte": "./dist/index.js"
		}
	},
	"peerDependencies": {
		"@skeletonlabs/skeleton": "^4.0.0",
		"@skeletonlabs/skeleton-svelte": "^4.0.0",
		"svelte": "^5.0.0"
	}
}
```

**File: `packages/ui-v4/src/index.ts`**

```typescript
/**
 * @file Barrel export for all Skeleton v4 components
 * Re-export Skeleton components + custom wrappers
 */

// Direct Skeleton v4 exports
export { Dialog, Toast, Avatar, Button, Card } from '@skeletonlabs/skeleton-svelte';

// Custom wrapped components (if needed)
export { default as CmsButton } from './Button/CmsButton.svelte';
export { default as CmsCard } from './Card/CmsCard.svelte';
export { default as CmsDialog } from './Dialog/CmsDialog.svelte';
```

**File: `packages/ui-v4/src/Button/CmsButton.svelte`**

```svelte
<script lang="ts">
	/**
	 * Custom button wrapper with CMS-specific defaults
	 * Uses Skeleton v4 Button under the hood
	 */
	import { Button } from '@skeletonlabs/skeleton-svelte';

	interface Props {
		variant?: 'filled' | 'outlined' | 'ghost';
		size?: 'sm' | 'base' | 'lg';
		disabled?: boolean;
		loading?: boolean;
		onclick?: () => void;
		children?: any;
	}

	let { variant = 'filled', size = 'base', disabled = false, loading = false, onclick, children }: Props = $props();
</script>

<Button {variant} {size} disabled={disabled || loading} {onclick} class="cms-button">
	{#if loading}
		<span class="animate-spin">⟳</span>
	{/if}
	{@render children?.()}
</Button>

<style>
	:global(.cms-button) {
		/* CMS-specific button overrides */
	}
</style>
```

### Phase 2: Setup Wizard Uses Shared Packages

**File: `apps/setup-wizard/package.json`**

```json
{
	"name": "@sveltycms/setup-wizard",
	"dependencies": {
		"@sveltycms/theme-v4": "workspace:*",
		"@sveltycms/ui-v4": "workspace:*",
		"@skeletonlabs/skeleton": "^4.0.0",
		"@skeletonlabs/skeleton-svelte": "^4.0.0",
		"tailwindcss": "^4.0.0",
		"@tailwindcss/vite": "^4.0.0"
	}
}
```

**File: `apps/setup-wizard/src/app.css`**

```css
/**
 * Setup wizard styles
 * Imports shared theme-v4 package
 */

/* Base Tailwind v4 + Skeleton v4 */
@import '@sveltycms/theme-v4/base';

/* Cerberus theme */
@import '@sveltycms/theme-v4/themes/cerberus';

/* Setup-specific overrides */
.setup-wizard {
	/* Custom setup styles */
}
```

**File: `apps/setup-wizard/src/routes/+page.svelte`**

```svelte
<script lang="ts">
	/**
	 * Setup wizard using shared ui-v4 components
	 */
	import { CmsButton, CmsCard, Dialog } from '@sveltycms/ui-v4';
	import * as m from '$lib/paraglide/messages';

	let step = $state(0);
</script>

<CmsCard>
	<h1>{m.setup_heading_title({ siteName: 'SveltyCMS' })}</h1>

	{#if step === 0}
		<!-- Database config -->
	{/if}

	<CmsButton onclick={() => step++}>
		{m.setup_continue()}
	</CmsButton>
</CmsCard>
```

### Phase 3: Main CMS Migration Path

When ready to migrate main CMS to v4:

**File: `apps/sveltycms/package.json`** (FUTURE)

```json
{
	"name": "@sveltycms/app",
	"dependencies": {
		"@sveltycms/theme-v4": "workspace:*",
		"@sveltycms/ui-v4": "workspace:*",
		"@skeletonlabs/skeleton": "^4.0.0",
		"@skeletonlabs/skeleton-svelte": "^4.0.0",
		"tailwindcss": "^4.0.0"
	}
}
```

**File: `apps/sveltycms/src/app.css`** (FUTURE)

```css
/* Same as setup wizard! */
@import '@sveltycms/theme-v4/base';
@import '@sveltycms/theme-v4/themes/custom-sveltycms';
```

**File: `apps/sveltycms/src/routes/+layout.svelte`** (FUTURE)

```svelte
<script>
	/* Just swap imports - same components! */
	import { Dialog, Toast } from '@sveltycms/ui-v4';
</script>

<Dialog.Root />
<Toast.Group />
<slot />
```

## Benefits of This Approach

### ✅ Reusability

- **Single source of truth** for Skeleton v4 config
- **Shared components** across apps
- **Consistent styling** everywhere

### ✅ Testability

- **Setup wizard** tests v4 in production first
- **Find issues early** before main CMS migration
- **Iterate quickly** on smaller codebase

### ✅ Gradual Migration

- **No big bang** - migrate incrementally
- **Main CMS stays stable** on v3
- **Setup wizard proves v4** works

### ✅ Maintainability

- **One place** to update Skeleton components
- **One place** to update theme colors
- **Version control** via package versions

### ✅ Documentation

- **Setup wizard becomes reference** implementation
- **Living examples** of v4 usage
- **Migration guide** writes itself

## File Structure Example

```
packages/theme-v4/
├── src/
│   ├── app.css                    # Base import (Tailwind v4 + Skeleton v4)
│   ├── themes/
│   │   ├── cerberus.css           # Pre-built theme
│   │   ├── pine.css               # Pre-built theme
│   │   ├── catppuccin.css         # Pre-built theme
│   │   └── custom-sveltycms.css   # Custom CMS theme
│   └── index.ts
├── package.json
├── README.md                      # How to use the package
└── CHANGELOG.md

packages/ui-v4/
├── src/
│   ├── index.ts                   # Barrel export
│   ├── Button/
│   │   ├── CmsButton.svelte
│   │   └── CmsButton.test.ts
│   ├── Card/
│   │   ├── CmsCard.svelte
│   │   └── CmsCard.test.ts
│   ├── Dialog/
│   │   ├── CmsDialog.svelte
│   │   └── CmsDialog.test.ts
│   ├── Toast/
│   │   ├── CmsToast.svelte
│   │   └── CmsToast.test.ts
│   └── ...
├── package.json
├── README.md                      # Component usage docs
└── CHANGELOG.md
```

## Migration Checklist

### Setup Wizard (Phase 1 - NOW)

- [ ] Create `packages/theme-v4/`
- [ ] Create `packages/ui-v4/`
- [ ] Create fresh `apps/setup-wizard/`
- [ ] Setup wizard uses `@sveltycms/theme-v4`
- [ ] Setup wizard uses `@sveltycms/ui-v4`
- [ ] Test and validate v4 stack
- [ ] Document lessons learned

### Main CMS (Phase 2 - LATER)

- [ ] Review setup wizard implementation
- [ ] Create migration branch
- [ ] Update `apps/sveltycms/package.json` to use v4 packages
- [ ] Update `app.css` to import `@sveltycms/theme-v4`
- [ ] Replace component imports with `@sveltycms/ui-v4`
- [ ] Test thoroughly
- [ ] Measure bundle size impact
- [ ] Merge when stable

## Key Decisions

### Q: Should we create custom wrappers or use Skeleton directly?

**A:** Hybrid approach:

- ✅ Export Skeleton v4 components directly (no wrapper overhead)
- ✅ Create custom wrappers ONLY when we need CMS-specific defaults
- ✅ Example: `CmsButton` with loading state, `CmsDialog` with consistent close behavior

### Q: How do we handle theme customization?

**A:** CSS-first with layers:

1. Base: `@sveltycms/theme-v4/base` (Tailwind v4 + Skeleton v4)
2. Theme: Choose preset or custom (`@sveltycms/theme-v4/themes/*`)
3. App: App-specific overrides in local `app.css`

### Q: What about breaking changes between v3 and v4?

**A:** Document them:

- Component renames (`Modal` → `Dialog`)
- Prop changes (different API)
- Import path changes
- Use setup wizard as **living migration guide**

## Success Metrics

After setup wizard is complete:

✅ **Shared packages work** - theme-v4 and ui-v4 functional  
✅ **Setup wizard runs** - All 6 steps work with v4 components  
✅ **Bundle size measured** - Actual v4 impact known  
✅ **Documentation complete** - README for each package  
✅ **Main CMS plan ready** - Migration guide based on learnings

## Timeline

**Week 1:** Create shared packages + setup wizard (NOW)

- Day 1-2: `packages/theme-v4/` + `packages/ui-v4/`
- Day 3-5: Fresh setup wizard using packages
- Day 5-7: Testing, documentation, bundle measurement

**Week 2+:** Evaluate main CMS migration (LATER)

- Assess bundle size impact from setup wizard
- Review any issues/gotchas discovered
- Plan main CMS migration if beneficial
- Execute migration in controlled phases

---

**Status:** Ready to implement  
**First Step:** Create `packages/theme-v4/` with shared config  
**Next Step:** Create `packages/ui-v4/` with component exports  
**Final Step:** Fresh setup wizard using both packages

**Result:** Reusable, maintainable, well-tested v4 foundation for entire monorepo
