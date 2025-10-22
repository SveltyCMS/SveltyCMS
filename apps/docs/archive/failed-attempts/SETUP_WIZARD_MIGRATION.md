# Setup Wizard Extraction - Migration Guide

## Overview

The setup wizard has been extracted from the main CMS into a standalone NX workspace application (`apps/setup-wizard`). This document explains the changes and migration path.

## Why This Change?

1. **Bundle Size**: Removes ~96 KB gzipped from main CMS production bundle
2. **Architecture**: Setup code runs once - shouldn't pollute production
3. **Deployment**: Can deploy/version setup wizard independently
4. **Performance**: Users never download setup code after first install

## What Changed?

### Files Moved

**From `src/routes/setup/`** → **`apps/setup-wizard/src/routes/`**:

- `+page.svelte` (640 lines)
- `+page.server.ts` (70 lines)
- `AdminConfig.svelte` (320 lines)
- `DatabaseConfig.svelte` (533 lines)
- `EmailConfig.svelte` (430 lines)
- `SystemConfig.svelte` (594 lines)
- `ReviewConfig.svelte` (120 lines)
- `ConnectionStatus.svelte` (290 lines)
- `WelcomeModal.svelte` (56 lines)
- `components.lazy.ts` (45 lines - now unused)

**From `src/routes/api/setup/`** → **`apps/setup-wizard/src/routes/api/setup/`**:

- `test-database/+server.ts` (680 lines)
- `complete/+server.ts` (520 lines)
- `seed/+server.ts` (75 lines)
- `email-test/+server.ts` (250 lines)
- `install-driver/+server.ts` (196 lines)
- `errorClassifier.ts` (245 lines)
- `seed.ts` (542 lines)
- `utils.ts` (135 lines)
- `writePrivateConfig.ts` (62 lines)
- `constants.ts` (40 lines)

**From `src/stores/`** → **`apps/setup-wizard/src/stores/`**:

- `setupStore.svelte.ts` (205 lines)

### Main CMS Changes

#### 1. `src/hooks.server.ts`

**Before**:

```typescript
import { handleSetup } from './hooks/handleSetup';

const middleware: Handle[] = [
	handleSystemState,
	handleSetup, // ← Redirects to /setup route
	handleLocale
	// ...
];
```

**After**:

```typescript
import { handleSetup } from './hooks/handleSetup';

const middleware: Handle[] = [
	handleSystemState,
	handleSetup, // ← Now redirects to setup-wizard app (port 5174)
	handleLocale
	// ...
];
```

#### 2. `src/hooks/handleSetup.ts`

**Before**:

- Redirects to `/setup` route (same app)
- Blocks `/setup` after completion

**After**:

- Redirects to `http://localhost:5174` (standalone app)
- No need to block `/setup` (doesn't exist in main app)

#### 3. `vite.config.ts`

**Removed**:

- `setupWizardPlugin()` function and logic
- Setup-related watch patterns
- `__FRESH_INSTALL__` define

**Simplified**:

```typescript
// Before: Conditional plugins based on setup status
!setupComplete ? setupWizardPlugin() : cmsWatcherPlugin();

// After: Always use cmsWatcherPlugin
cmsWatcherPlugin();
```

#### 4. `src/databases/db.ts`

**Added**:

```typescript
// Export setup wizard URL for hooks to redirect
export const SETUP_WIZARD_URL = process.env.SETUP_WIZARD_URL || 'http://localhost:5174';
```

## Development Workflow

### Fresh Install (No Config)

```bash
# Step 1: Start setup wizard (creates blank config/private.ts automatically)
nx dev setup-wizard
# → Opens browser to http://localhost:5174/setup

# Step 2: Complete setup wizard
# - Configure database
# - Create admin account
# - Set system preferences
# - Setup wizard writes config and seeds database

# Step 3: Start main CMS
nx dev sveltycms
# → http://localhost:5173/login
```

### Existing Install (Config Exists)

```bash
# Main CMS runs normally (setup wizard not needed)
nx dev sveltycms
# → http://localhost:5173/login
```

### How It Works

1. **Fresh Install Detection**:
   - Setup wizard checks if `config/private.ts` exists
   - If missing → Creates blank config automatically
   - Opens browser to setup wizard

2. **Main CMS Detection**:
   - Main CMS checks if `config/private.ts` has valid values
   - If empty → Redirects to `http://localhost:5174` (setup wizard)
   - If valid → Runs normally

3. **After Setup**:
   - Setup wizard writes filled config/private.ts
   - Seeds database with default data
   - Redirects user to main CMS login
   - Main CMS detects valid config and runs normally

### Production Deployment

```bash
# Build both apps
nx build sveltycms
nx build setup-wizard

# Deploy both to different ports/subdomains
# Main CMS: https://your-domain.com
# Setup: https://setup.your-domain.com (or port 5174)
```

## Bundle Size Impact

| Metric           | Before  | After           | Change              |
| ---------------- | ------- | --------------- | ------------------- |
| Main CMS gzipped | 914 KB  | ~818 KB         | **-96 KB (-10.5%)** |
| Main CMS total   | 3.01 MB | ~2.71 MB        | **-300 KB (-10%)**  |
| Setup wizard     | N/A     | ~200 KB gzipped | (one-time)          |

## Breaking Changes

### Import Paths

If any code outside setup wizard imports setup-related modules:

**Before**:

```typescript
import { setupStore } from '@stores/setupStore.svelte';
import type { DbConfig } from '@stores/setupStore.svelte';
```

**After**:

```typescript
// Setup store only available in setup-wizard app
// Main CMS should NOT import setup modules
```

### Routes

**Before**:

```
/setup → Main CMS route
/api/setup/* → Main CMS API
```

**After**:

```
http://localhost:5174/setup → Setup wizard route
http://localhost:5174/api/setup/* → Setup wizard API
```

## Rollback Plan

If issues arise, the old setup code is preserved in git history:

```bash
# Restore old setup route
git checkout HEAD~1 src/routes/setup
git checkout HEAD~1 src/routes/api/setup
git checkout HEAD~1 src/stores/setupStore.svelte.ts

# Remove setup-wizard app
rm -rf apps/setup-wizard

# Restore old hooks/vite config
git checkout HEAD~1 src/hooks/handleSetup.ts
git checkout HEAD~1 vite.config.ts
```

## Testing Checklist

- [ ] Fresh install: Start CMS without config, redirects to setup wizard
- [ ] Setup wizard: Complete all 6 steps successfully
- [ ] Redirection: Setup wizard redirects back to CMS after completion
- [ ] Login: Can log in with admin account created during setup
- [ ] Setup blocked: Cannot access setup wizard after completion
- [ ] Bundle size: Main CMS bundle reduced by ~96 KB gzipped
- [ ] Production build: Both apps build successfully with `nx build-all`

## Related Files

- `apps/setup-wizard/README.md` - Setup wizard documentation
- `docs/BASELINE_METRICS.md` - Bundle optimization tracking
- `nx.json` - NX workspace configuration
- `project.json` - Setup wizard NX project config

## Questions?

See [GitHub Issues](https://github.com/SveltyCMS/SveltyCMS/issues) or main [README.md](../../README.md)
