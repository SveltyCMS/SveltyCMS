# Skeleton v4 + Tailwind v4 Migration TODO

Based on: https://www.skeleton.dev/docs/get-started/migrate-from-v2

## ✅ Completed

1. ✅ Removed Skeleton plugin from tailwind config (using CSS-first config now)
2. ✅ Renamed `app.postcss` to `app.css`
3. ✅ Migrated to `@tailwindcss/vite` plugin
4. ✅ Replaced `variant-*` classes with `preset-*` classes
5. ✅ Created custom theme in `sveltycms.css` without `@apply` directives
6. ✅ Moved translations to setup-wizard message files

## 🔧 Required Changes

### 1. Move `data-theme` attribute (HIGH PRIORITY)

**File:** `apps/setup-wizard/src/app.html`

**Change:**

```html
<!-- BEFORE -->
<html lang="en" dir="ltr">
	...
	<body data-theme="SveltyCMSTheme">
		<!-- AFTER -->
		<html lang="en" dir="ltr" data-theme="SveltyCMSTheme">
			...
			<body></body>
		</html>
	</body>
</html>
```

**Why:** Tailwind v4 requires `data-theme` on `<html>` not `<body>`

---

### 2. Replace Skeleton Utilities with Alternatives

Skeleton v3/v4 removed several utilities from core. These need alternative implementations:

#### A. Popovers (popup)

**Currently used in:**

- `AdminConfig.svelte`
- `SystemConfig.svelte`
- `DatabaseConfig.svelte`

**Solution Options:**

1. Use [Floating UI Svelte](https://floating-ui-svelte.vercel.app/)
2. Use Zag.js Popover component
3. Use native HTML `popover` API (browser support limited)
4. Build custom solution with CSS

**Recommendation:** For setup wizard, consider replacing with simpler tooltips or inline help text since this is a one-time setup flow.

---

#### B. Modals

**Currently used in:**

- `+page.svelte` (imports `Modal`, `getModalStore`, `ModalSettings`, `ModalComponent`)
- `WelcomeModal.svelte`

**Solution Options:**

1. Use dialog element with Zag.js
2. Implement custom modal with `<dialog>` element
3. Use Svelte 5 snippets for inline modals

**Recommendation:** Replace with native `<dialog>` element for simplicity.

---

#### C. Toasts

**Currently used in:**

- `+page.svelte` (imports `Toast`, `getToastStore`)

**Solution Options:**

1. Use [Svelte Sonner](https://svelte-sonner.vercel.app/)
2. Use [svelte-french-toast](https://svelte-french-toast.com/)
3. Build custom toast with CSS animations

**Recommendation:** Use Svelte Sonner (modern, lightweight, accessible).

---

### 3. Update Skeleton Import Paths

**All files using Skeleton imports need updating:**

```typescript
// ❌ OLD (v2)
import { popup } from '@skeletonlabs/skeleton';
import { getModalStore } from '@skeletonlabs/skeleton';
import { getToastStore } from '@skeletonlabs/skeleton';

// ✅ NEW (v4) - but these utilities don't exist anymore!
// import { ... } from '@skeletonlabs/skeleton-svelte';
```

**Note:** Most of these utilities have been removed, so imports need to be replaced with alternatives (see section 2).

---

### 4. Enable Skeleton CSS (if still needed)

**File:** `apps/setup-wizard/src/app.css`

Currently disabled:

```css
/* Skeleton v4 - Temporarily disabled due to Tailwind v4 incompatibility */
/* @import '@skeletonlabs/skeleton'; */
/* @import '@skeletonlabs/skeleton-svelte'; */
```

**Check:** Are we actually using any Skeleton components?

- If YES: Re-enable imports
- If NO: Remove Skeleton dependency entirely

**Components potentially in use:** None found in grep search - we may not need Skeleton at all!

---

### 5. Clean Up Package Dependencies

**Check `package.json` for:**

```json
{
	"dependencies": {
		"@skeletonlabs/skeleton": "^2.x.x", // ❌ Remove if not using v4
		"@skeletonlabs/skeleton-svelte": "^4.x.x" // ✅ Only if using components
	}
}
```

---

## 🎯 Recommended Approach

### Option A: Remove Skeleton Entirely (RECOMMENDED)

Since we're only using utilities (popup, modal, toast) and not actual components:

1. Remove Skeleton dependency
2. Replace modals with native `<dialog>`
3. Replace toasts with Svelte Sonner
4. Replace popups with simple hover tooltips or inline help
5. Keep custom theme CSS as-is

**Pros:**

- Lighter bundle
- No framework compatibility issues
- More control over UI

**Cons:**

- Need to implement replacements

---

### Option B: Keep Skeleton v4

If we want to keep Skeleton:

1. Update import paths to `@skeletonlabs/skeleton-svelte`
2. Implement popover/modal/toast alternatives as per Skeleton docs
3. Check all components for prop changes
4. Enable Skeleton CSS imports

**Pros:**

- Access to Skeleton component library

**Cons:**

- More dependencies
- Need to maintain compatibility

---

## 📋 Action Items

### Immediate (Blocking)

- [ ] Move `data-theme` to `<html>` tag
- [ ] Decide: Keep or remove Skeleton dependency?

### If Removing Skeleton:

- [ ] Install `svelte-sonner` for toasts
- [ ] Replace modal with `<dialog>` element
- [ ] Replace popups with tooltips/inline help
- [ ] Remove Skeleton from package.json
- [ ] Remove Skeleton imports from all files

### If Keeping Skeleton:

- [ ] Update to `@skeletonlabs/skeleton-svelte` v4
- [ ] Implement Floating UI for popovers
- [ ] Implement Zag.js dialog for modals
- [ ] Implement alternative toast solution
- [ ] Enable Skeleton CSS imports
- [ ] Update all component props

---

## 📚 Resources

- [Skeleton v2 to v3 Migration](https://www.skeleton.dev/docs/get-started/migrate-from-v2)
- [Skeleton v3 to v4 Migration](https://www.skeleton.dev/docs/get-started/migrate-from-v3)
- [Tailwind v4 Migration](https://tailwindcss.com/docs/upgrade-guide)
- [Floating UI Svelte](https://floating-ui-svelte.vercel.app/)
- [Svelte Sonner](https://svelte-sonner.vercel.app/)
- [MDN Dialog Element](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/dialog)

---

## ⚠️ Current Status

**Setup Wizard State:**

- Running on port 5178
- Skeleton CSS disabled
- Using Tailwind v4 + custom theme
- **Likely broken:** Modal, Toast, Popup features not working

**Next Step:** Test the setup wizard UI to see what's actually broken, then decide on the best migration path.
