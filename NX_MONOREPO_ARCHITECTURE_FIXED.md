# NX Monorepo Dependency Architecture - Fixed

## ✅ Correct Dependency Direction

```
apps/cms         → apps/shared-utils  ✅ ALLOWED
apps/setup-wizard → apps/shared-utils  ✅ ALLOWED
apps/shared-utils → apps/cms           ❌ FORBIDDEN (circular dependency)
apps/shared-utils → apps/setup-wizard  ❌ FORBIDDEN (circular dependency)
```

## Fixed Files

### 1. ✅ `apps/shared-utils/configCheck.ts`

**Status:** CORRECT  
**Dependencies:** Node.js `fs` and `path` only  
**Purpose:** Generic config file validation  
**Used by:** CMS and setup-wizard

### 2. ✅ `apps/cms/src/utils/setupCheck.ts`

**Status:** CORRECT  
**Dependencies:**

- `apps/shared-utils/configCheck.ts` ✅
- `apps/cms/src/databases/db.ts` ✅ (same app)  
  **Purpose:** CMS-specific setup check (config + database validation)

### 3. ✅ `apps/setup-wizard/src/utils/setupCheck.ts`

**Status:** NEWLY CREATED  
**Dependencies:**

- `apps/shared-utils/configCheck.ts` ✅  
  **Purpose:** Setup-wizard-specific setup check (config validation only)  
  **Note:** Does NOT check database (setup-wizard has no DB access)  
  **Import:** Uses relative path `./utils/setupCheck` to avoid alias confusion

### 4. ❌ `apps/shared-utils/setupCheck.ts`

**Status:** REMOVED (violated monorepo rules)  
**Reason:** Was trying to import from `apps/cms/src/databases/db.ts`

---

## Shared Utils Analysis

### ✅ `apps/shared-utils/formSchemas.ts`

**Dependencies:** `valibot` only  
**Status:** CORRECT

### ✅ `apps/shared-utils/setupValidationSchemas.ts`

**Dependencies:** `valibot` only  
**Status:** CORRECT

### ✅ `apps/shared-utils/iso639-1.json`

**Dependencies:** None (data file)  
**Status:** CORRECT

### ✅ `apps/shared-utils/languageUtils.ts`

**Dependencies:** `./logger.svelte.ts` (same directory)  
**Status:** CORRECT

### ✅ `apps/shared-utils/logger.svelte.ts`

**Status:** FIXED  
**Was:** Imported from `@stores/globalSettings.svelte` (CMS-specific) ❌  
**Now:** Uses `process.env` directly ✅  
**Dependencies:** `$app/environment` only

### ⚠️ `apps/shared-utils/toast.ts`

**Status:** NEEDS UPDATE (separate issue)  
**Dependencies:** `@skeletonlabs/skeleton-svelte`  
**Issue:** Uses Skeleton v3 API (`getToastStore`), needs Skeleton v4 migration  
**Note:** Not a monorepo dependency violation, just API version mismatch

---

## Architecture Rules

### ✅ DO:

- Put truly shared, dependency-free utilities in `apps/shared-utils`
- Import from `apps/shared-utils` in your apps
- Keep app-specific logic in the app's own `utils` directory

### ❌ DON'T:

- Import from app directories in `apps/shared-utils`
- Create circular dependencies
- Mix app-specific logic into shared utilities

---

## File Structure

```
apps/
├── shared-utils/
│   ├── configCheck.ts         ✅ Generic config validation
│   ├── formSchemas.ts          ✅ Generic Valibot schemas
│   ├── setupValidationSchemas.ts ✅ Generic validation
│   ├── languageUtils.ts        ✅ Language helpers
│   ├── logger.svelte.ts        ✅ Generic logger (fixed)
│   ├── toast.ts                ⚠️ Needs Skeleton v4 update
│   └── iso639-1.json           ✅ Language data
├── cms/
│   └── src/
│       └── utils/
│           └── setupCheck.ts   ✅ CMS-specific (config + DB)
└── setup-wizard/
    └── src/
        └── utils/
            └── setupCheck.ts   ✅ Setup-specific (config only)
```

---

## Summary

All monorepo dependency violations have been fixed:

- ✅ Removed `apps/shared-utils/setupCheck.ts` (violated rules)
- ✅ Created `apps/setup-wizard/src/utils/setupCheck.ts` (app-specific)
- ✅ Fixed `apps/shared-utils/logger.svelte.ts` (removed CMS dependency)
- ✅ Verified all other shared-utils files are dependency-clean

The architecture now properly follows NX monorepo best practices! 🎉
