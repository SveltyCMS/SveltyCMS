# Main CMS → Tailwind v4 + Skeleton v4 Migration Roadmap

**Status:** 🟡 Preparing (Setup Wizard serves as proof-of-concept)  
**Theme Package:** ✅ Ready (`@sveltycms/theme-v4`)  
**Estimated Effort:** 3-5 days (after setup wizard validation)

---

## Why Migrate?

### Performance Benefits

- **Faster builds:** Tailwind v4 Vite plugin is 2-3x faster than PostCSS
- **Smaller bundles:** Better tree-shaking, ~20-30% size reduction
- **Better HMR:** Faster hot module replacement during development
- **Native CSS:** Less JavaScript overhead

### Modern Features

- **CSS-first config:** No `tailwind.config.ts`, everything in CSS
- **OKLCH colors:** Already using them! No color changes needed
- **Better dark mode:** Improved contrast and consistency
- **Future-proof:** Aligned with CSS standards

### Developer Experience

- **Simpler setup:** Fewer config files
- **Better IDE support:** CSS autocomplete for theme values
- **Zag.js components:** Better accessibility, cross-framework support
- **Cleaner APIs:** Skeleton v4 has more intuitive component props

---

## Prerequisites

### ✅ Already Complete

1. **OKLCH colors** - Theme already migrated
2. **Shared theme package** - `@sveltycms/theme-v4` ready
3. **Proof-of-concept** - Setup wizard validates the approach
4. **Svelte 5** - Already on latest version
5. **SvelteKit 2** - Already on latest version

### ⏳ Pending

1. **Setup wizard testing** - Validate theme package works perfectly
2. **Bundle measurements** - Confirm expected savings
3. **Component inventory** - Audit all Skeleton v2/v3 component usage
4. **Migration branch** - Create `feature/tailwind-v4-migration`

---

## Migration Strategy

### Phase 1: Preparation (1 day)

**1.1 Audit Component Usage**

```bash
# Find all Skeleton component imports
grep -r "from '@skeletonlabs/skeleton'" src/ --include="*.svelte"

# Common components to map:
# <Modal> → <Dialog>
# <Toast> → <Toast.Group>
# <ProgressRing> → <Progress>
# <Ratings> → <RatingGroup>
# <Segment> → <SegmentedControl>
```

**1.2 Create Migration Branch**

```bash
git checkout -b feature/tailwind-v4-migration
git push -u origin feature/tailwind-v4-migration
```

**1.3 Document Current State**

- Baseline bundle size (main.js, CSS)
- Current build time
- Component count by type
- Known issues/tech debt

### Phase 2: Update Dependencies (2 hours)

**2.1 Update `package.json`**

```json
{
	"dependencies": {
		"@skeletonlabs/skeleton": "^4.0.0",
		"@skeletonlabs/skeleton-svelte": "^4.0.0",
		"@tailwindcss/vite": "^4.0.0",
		"tailwindcss": "^4.0.0"
	},
	"devDependencies": {
		"@sveltycms/theme-v4": "workspace:*"
	}
}
```

**2.2 Remove Old Dependencies**

```bash
bun remove @tailwindcss/postcss postcss autoprefixer
bun install
```

**2.3 Delete Config Files**

- ❌ Delete `tailwind.config.ts`
- ❌ Delete `postcss.config.cjs`
- ✅ Keep `vite.config.ts` (will update)

### Phase 3: Update Configuration (3 hours)

**3.1 Update `vite.config.ts`**

```typescript
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite'; // NEW
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(), // MUST come before sveltekit
		cmsWatcherPlugin(),
		sveltekit()
	]
});
```

**3.2 Update `src/app.postcss` → `src/app.css`**

```bash
# Rename file
mv src/app.postcss src/app.css

# Update imports in src/routes/+layout.svelte
sed -i "s|app.postcss|app.css|g" src/routes/+layout.svelte
```

**3.3 New `src/app.css` Content**

```css
/* Import shared theme package */
@import '@sveltycms/theme-v4/base';
@import '@sveltycms/theme-v4/themes/sveltycms';

/* CMS-specific styles */
@layer components {
	/* Keep existing custom classes */
}
```

**3.4 Update `src/app.html`**

```html
<!-- Change from <body> to <html> -->
<html lang="en" data-theme="SveltyCMSTheme">
	<head>
		%sveltekit.head%
	</head>
	<body data-sveltekit-preload-data="hover">
		%sveltekit.body%
	</body>
</html>
```

### Phase 4: Component Migration (1-2 days)

**4.1 Update Component Imports**

**Before:**

```svelte
<script>
	import { Modal, Toast, ProgressRing } from '@skeletonlabs/skeleton';
</script>
```

**After:**

```svelte
<script>
	import { Dialog, Toast, Progress } from '@skeletonlabs/skeleton-svelte';
</script>
```

**4.2 Component Renames (Automated)**

```bash
# Create migration script
node scripts/migrate-skeleton-components.js
```

**Common renames:**
| v3 Component | v4 Component | Notes |
|--------------|--------------|-------|
| `<Modal>` | `<Dialog>` | Props changed |
| `<Toast>` | `<Toast.Group>` | New structure |
| `<ProgressRing>` | `<Progress>` | Simpler API |
| `<Ratings>` | `<RatingGroup>` | Zag.js based |
| `<Segment>` | `<SegmentedControl>` | Clearer name |
| `<Navigation.Bar>` | `<Navigation layout="bar">` | Prop-based |
| `<Navigation.Rail>` | `<Navigation layout="rail">` | Prop-based |

**4.3 Manual Component Updates**

Each component needs manual review:

1. Check new prop structure
2. Update event handlers (Svelte 5 style)
3. Test functionality
4. Update TypeScript types if needed

**Example - Modal → Dialog:**

```svelte
<!-- OLD (v3) -->
<Modal show={isOpen} onClose={() => (isOpen = false)}>
	<h2 slot="header">Title</h2>
	<p>Content</p>
	<button slot="footer">Close</button>
</Modal>

<!-- NEW (v4) -->
<Dialog.Root open={isOpen} onOpenChange={(open) => (isOpen = open)}>
	<Dialog.Content>
		<Dialog.Header>Title</Dialog.Header>
		<Dialog.Body>
			<p>Content</p>
		</Dialog.Body>
		<Dialog.Footer>
			<button>Close</button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
```

### Phase 5: Remove @apply (1 day)

Tailwind v4 discourages `@apply`. Convert to CSS variables:

**Before:**

```css
.my-button {
	@apply rounded bg-primary-500 px-4 py-2 text-white;
}
```

**After:**

```css
.my-button {
	background-color: var(--color-primary-500);
	color: white;
	padding: var(--spacing-4) var(--spacing-2);
	border-radius: var(--radius-base);
}
```

**Or use Tailwind classes directly:**

```svelte
<button class="rounded bg-primary-500 px-4 py-2 text-white"> Click me </button>
```

### Phase 6: Testing (1-2 days)

**6.1 Automated Tests**

```bash
# Run all tests
bun test

# Run Playwright tests
bun test:e2e

# Check for console errors
bun dev # Check browser console
```

**6.2 Visual Testing**

- [ ] Light mode: All pages render correctly
- [ ] Dark mode: All pages render correctly
- [ ] Theme switching works
- [ ] All dialogs/modals open and close
- [ ] All forms submit correctly
- [ ] File uploads work
- [ ] Media library displays correctly
- [ ] Dashboard widgets render
- [ ] Collection views work
- [ ] Rich text editor functions

**6.3 Performance Testing**

```bash
# Build and measure
bun run build
node scripts/bundle-stats.js

# Compare to baseline
# Expected: 20-30% size reduction
# Expected: 30-50% faster build time
```

### Phase 7: Documentation (3 hours)

**7.1 Update README.md**

- New setup instructions (Tailwind v4)
- Remove PostCSS mentions
- Add theme package documentation

**7.2 Update CONTRIBUTING.md**

- New styling guidelines
- Component usage examples
- Theme customization guide

**7.3 Create Migration Guide**

- Document lessons learned
- Common pitfalls
- Component migration examples
- Performance improvements achieved

### Phase 8: Deployment (1 day)

**8.1 Staging Deploy**

```bash
# Build for staging
bun run build:staging

# Deploy to staging environment
# Test thoroughly with real data
```

**8.2 Production Deploy**

```bash
# After staging validation
git checkout main
git merge feature/tailwind-v4-migration
git tag v4.0.0
git push origin main --tags

# Deploy to production
bun run build:production
```

---

## Risk Mitigation

### High-Risk Areas

**1. Component Breakage**

- **Risk:** V4 components have different APIs
- **Mitigation:** Comprehensive testing, gradual rollout
- **Rollback:** Keep v3 branch tagged for quick revert

**2. Bundle Size**

- **Risk:** Could increase if tree-shaking fails
- **Mitigation:** Measure at every step, optimize imports
- **Target:** 20-30% reduction (if increase, investigate before proceeding)

**3. Third-party Components**

- **Risk:** Custom components may break with v4
- **Mitigation:** Audit all custom Skeleton extensions
- **Fallback:** Rebuild custom components from scratch if needed

### Testing Strategy

**1. Unit Tests**

- Update component tests for new v4 APIs
- Test all stores and utilities
- Verify form validation

**2. Integration Tests**

- Test complete user workflows
- Test API interactions
- Test database operations

**3. E2E Tests**

- Run full Playwright suite
- Test on multiple browsers
- Test on mobile viewports

**4. Manual Testing**

- Click through every page
- Test every form
- Test every modal/dialog
- Test dark mode extensively

---

## Success Metrics

### Performance Goals

- ✅ **Build time:** 30-50% faster
- ✅ **Bundle size:** 20-30% smaller
- ✅ **HMR speed:** 2-3x faster updates
- ✅ **Lighthouse score:** 95+ (currently 90+)

### Quality Goals

- ✅ **Zero regressions:** All existing features work
- ✅ **Visual parity:** Identical appearance
- ✅ **Accessibility:** WCAG 2.1 AA compliance maintained
- ✅ **Tests passing:** 100% test coverage maintained

### Timeline Goals

- ✅ **Preparation:** 1 day
- ✅ **Migration:** 3-4 days
- ✅ **Testing:** 1-2 days
- ✅ **Total:** 5-7 days

---

## Rollback Plan

If critical issues arise:

**Immediate Rollback:**

```bash
# Revert to v3 (tagged before migration)
git checkout v3.9.9
bun install
bun run build
# Deploy previous version
```

**Partial Rollback:**

- Keep Tailwind v4, revert Skeleton to v3
- Keep theme package, fix component issues individually
- Roll back specific pages/features only

---

## Post-Migration Tasks

### Week 1

- [ ] Monitor error logs
- [ ] Monitor performance metrics
- [ ] Gather user feedback
- [ ] Fix any minor issues

### Week 2-4

- [ ] Optimize bundle further
- [ ] Create custom v4 components
- [ ] Update theme with new v4 features
- [ ] Documentation improvements

### Month 2+

- [ ] Explore v4-only features
- [ ] Create CMS-specific component library
- [ ] Share theme package with community
- [ ] Blog post about migration experience

---

## Key Learnings from Setup Wizard

### What Worked Well

✅ **OKLCH colors:** No conversion needed, direct copy  
✅ **Theme package:** Clean separation, easy to import  
✅ **CSS-first config:** Simpler than JS config  
✅ **Shared packages:** Reusable across apps

### Challenges Encountered

⚠️ **Component API changes:** Took time to learn new structure  
⚠️ **Import paths:** Needed careful management  
⚠️ **@apply usage:** Had to minimize/remove  
⚠️ **Documentation:** v4 docs still evolving

### Recommendations

1. **Test theme package first** (done in setup wizard)
2. **Migrate in stages** (not all at once)
3. **Keep v3 running** (for comparison/rollback)
4. **Automate what you can** (scripts for renames)
5. **Document everything** (for future reference)

---

**Next Step:** Validate setup wizard works perfectly, then begin main CMS migration

**Owner:** Development Team  
**Reviewers:** All developers  
**Timeline:** After setup wizard is production-ready
