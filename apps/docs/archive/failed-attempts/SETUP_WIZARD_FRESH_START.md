# Setup Wizard - Fresh Start Plan

**Date:** October 20, 2025  
**Decision:** Rebuild setup wizard from scratch with latest stack  
**Reason:** Cleaner than patching migrated code, modern foundation, isolated dependencies

## Why Fresh Start?

### Problems with Current Approach

- ❌ Migrated code has path resolution issues
- ❌ Mixed v3/v4 dependencies causing conflicts
- ❌ Tailwind v3 in workspace blocks v4 migration
- ❌ Skeleton components not working (Modal/Toast)
- ❌ Complex import aliases breaking
- ❌ Module caching issues

### Benefits of Fresh Start

- ✅ **Clean slate** - No legacy baggage
- ✅ **Modern stack** - Tailwind v4 + Skeleton v4 from day one
- ✅ **Isolated** - Own dependencies, no workspace conflicts
- ✅ **Simpler** - Fewer files, cleaner code
- ✅ **i18n ready** - Paraglide.js built-in
- ✅ **Separated translations** - Setup translations isolated from main CMS

## Tech Stack (Latest)

| Technology   | Version | Purpose                    |
| ------------ | ------- | -------------------------- |
| SvelteKit    | 2.x     | Meta-framework             |
| Svelte       | 5.x     | Component framework        |
| Tailwind CSS | 4.x     | Styling (CSS-first config) |
| Skeleton     | 4.x     | UI component library       |
| Paraglide.js | Latest  | i18n/translations          |
| Valibot      | Latest  | Form validation            |

## Implementation Steps

### Step 1: Backup Current Setup Wizard

```bash
cd /var/www/vhosts/asset-trade.de/svelte.asset-trade.de/SveltyCMS/apps
mv setup-wizard setup-wizard.old
```

**What to preserve:**

- API route logic (`src/routes/api/setup/*`)
- Setup store logic (`src/stores/setupStore.svelte.ts`)
- Database connection testing code
- Config file writing logic
- Documentation (README.md, MIGRATION.md)

### Step 2: Create Fresh SvelteKit Project

**Official Skeleton v4 installation:**

```bash
# Inside apps/ directory
npx sv create --types ts setup-wizard
# Select: Yes to Tailwind CSS
cd setup-wizard
```

**Install Skeleton v4:**

```bash
bun add -D @skeletonlabs/skeleton @skeletonlabs/skeleton-svelte
```

### Step 3: Configure Tailwind v4 + Skeleton v4

**File: `src/app.css`**

```css
@import 'tailwindcss';
@import '@skeletonlabs/skeleton';
@import '@skeletonlabs/skeleton-svelte';
@import '@skeletonlabs/skeleton/themes/cerberus';
```

**File: `src/app.html`**

```html
<html lang="en" data-theme="cerberus"></html>
```

### Step 4: Extract Setup Translations

**Current structure:**

- Main CMS: `src/messages/{en,de}.json` (all translations)

**New structure:**

- Main CMS: `src/messages/{en,de}.json` (CMS translations only)
- Setup Wizard: `apps/setup-wizard/messages/{en,de}.json` (setup translations only)

**Translation keys to extract** (100+ keys):

```
setup_*
welcome_modal_*
```

**Create:**

- `apps/setup-wizard/messages/en.json`
- `apps/setup-wizard/messages/de.json`

### Step 5: Add Paraglide.js

**Official Paraglide SvelteKit guide:**
https://inlang.com/m/gerre34r/library-inlang-paraglideJs/sveltekit

**Install:**

```bash
bun add -D @inlang/paraglide-sveltekit
npx @inlang/paraglide-js init
```

**Configuration:**

- Respect existing `project.inlang/settings.json` structure
- Point to `apps/setup-wizard/messages/{languageTag}.json`
- Setup language switcher in wizard UI

### Step 6: Rebuild Setup Wizard UI

**Clean file structure:**

```
apps/setup-wizard/
├── src/
│   ├── routes/
│   │   ├── +page.svelte          # Main setup wizard (6 steps)
│   │   ├── +page.server.ts       # Server-side setup guard
│   │   ├── +layout.svelte        # Minimal layout
│   │   ├── +layout.server.ts     # Theme/language loader
│   │   └── api/
│   │       └── setup/
│   │           ├── test-database/+server.ts
│   │           ├── complete/+server.ts
│   │           └── seed/+server.ts
│   ├── lib/
│   │   ├── stores/
│   │   │   └── setupStore.svelte.ts  # Setup wizard state (Svelte 5 runes)
│   │   └── components/
│   │       ├── DatabaseConfig.svelte
│   │       ├── AdminAccount.svelte
│   │       ├── SystemSettings.svelte
│   │       └── ReviewComplete.svelte
│   ├── app.css                   # Tailwind v4 + Skeleton v4
│   └── app.html                  # data-theme="cerberus"
├── messages/
│   ├── en.json                   # English setup translations
│   └── de.json                   # German setup translations
├── package.json                  # Isolated dependencies
├── vite.config.ts                # Tailwind v4 Vite plugin
├── svelte.config.js              # Standard SvelteKit config
└── project.json                  # NX configuration
```

### Step 7: API Routes Migration

**Copy logic from old setup-wizard, modernize:**

**`api/setup/test-database/+server.ts`**

- Test MongoDB/PostgreSQL/MySQL connection
- Return connection status, latency, error details
- Use database utilities from `@databases` alias

**`api/setup/complete/+server.ts`**

- Write `config/private.ts` with validated values
- Create admin user in database
- Seed initial data (roles, permissions)
- Return success/error

**`api/setup/seed/+server.ts`**

- Optional: seed demo content
- Create default collections
- Setup default menu structure

### Step 8: Setup Store (Svelte 5 Runes)

**Modern state management:**

```typescript
// lib/stores/setupStore.svelte.ts
import { writable } from 'svelte/store';

export const setupWizard = $state({
	currentStep: 0,
	database: {
		type: 'mongodb',
		host: '',
		port: 27017,
		name: '',
		user: '',
		password: ''
	},
	admin: {
		username: '',
		email: '',
		password: '',
		confirmPassword: ''
	},
	system: {
		siteName: 'SveltyCMS',
		defaultLanguage: 'en',
		languages: ['en', 'de'],
		timezone: 'UTC'
	},
	media: {
		path: './mediaFolder'
	}
});
```

### Step 9: NX Integration

**Update `apps/setup-wizard/project.json`:**

```json
{
	"name": "setup-wizard",
	"targets": {
		"dev": {
			"executor": "@nx/vite:dev-server",
			"options": {
				"buildTarget": "setup-wizard:build",
				"port": 5174
			}
		},
		"build": {
			"executor": "@nx/vite:build",
			"outputs": ["{projectRoot}/build"],
			"options": {
				"outputPath": "apps/setup-wizard/build"
			}
		}
	}
}
```

### Step 10: Main CMS Integration

**No changes needed to:**

- `src/hooks/handleSetup.ts` (already redirects to `:5174`)
- `vite.config.ts` (already simplified)

**Setup wizard workflow:**

1. User visits main CMS
2. `hooks.server.ts` detects empty `config/private.ts`
3. Redirects to `http://localhost:5174`
4. Setup wizard runs on separate port
5. After completion, redirects back to main CMS `/login`

## Bundle Size Impact

**Expected savings:**

- **Old approach:** ~96 KB from main CMS
- **Fresh build:** ~150-200 KB total setup wizard bundle (v4 is smaller)
- **Net result:** Main CMS still saves ~96 KB, setup wizard is self-contained

## Translation Extraction Script

```bash
#!/bin/bash
# Extract setup translations from main CMS

cd /var/www/vhosts/asset-trade.de/svelte.asset-trade.de/SveltyCMS

# Backup original files
cp src/messages/en.json src/messages/en.json.backup
cp src/messages/de.json src/messages/de.json.backup

# Extract setup_* and welcome_modal_* keys to setup wizard
# This will be done programmatically via Node.js script
node scripts/extract-setup-translations.js
```

## Testing Checklist

- [ ] Fresh SvelteKit app created
- [ ] Skeleton v4 + Tailwind v4 installed and working
- [ ] Paraglide.js i18n configured
- [ ] Setup translations extracted and working
- [ ] Database connection testing works
- [ ] Admin account creation works
- [ ] Config file writing works
- [ ] Language switching works
- [ ] Main CMS redirect works
- [ ] Post-setup redirect to /login works
- [ ] Bundle size measured (~150-200 KB expected)

## Success Criteria

✅ **Clean codebase** - No legacy migration issues  
✅ **Modern stack** - Latest Tailwind v4 + Skeleton v4  
✅ **Working i18n** - Paraglide.js with extracted translations  
✅ **Isolated** - No dependency conflicts with main CMS  
✅ **Functional** - All 6 setup steps work perfectly  
✅ **Measured** - Bundle size confirmed, main CMS savings verified

## Next Steps After Fresh Build

1. Delete `apps/setup-wizard.old` (keep for reference initially)
2. Update main CMS to remove setup translations (keep them only in setup wizard)
3. Test full installation workflow (fresh install)
4. Measure main CMS bundle reduction (should be ~96 KB)
5. Document new setup wizard architecture
6. Update README.md with new setup instructions

---

**Status:** Ready to implement  
**Estimated Time:** 2-3 hours for complete fresh build  
**Risk:** Low (isolated workspace, can rollback easily)  
**Reward:** High (clean, modern, working setup wizard)
