# Console.log Audit Report

**Date:** October 5, 2025  
**Status:** Analysis Complete

## Summary

Found multiple `console.log/warn/error` statements in the codebase. These need to be categorized and potentially migrated to the logger system where appropriate.

## Logger Usage Guidelines

### ✅ Use Logger for:

- **Backend-only files** (`.ts` in routes/api, hooks.server.ts, +server.ts, +page.server.ts)
- **Server utilities** that don't run in browser
- **API endpoints**
- **Database operations**

### ❌ Keep console.log for:

- **`.svelte` files** (frontend components - logger works but console is simpler)
- **Shared `.svelte.ts` files** used in both frontend/backend (like stores)
- **Build-time scripts** (Vite plugins, compilation scripts)
- **Logger internal fallbacks** (when logger itself fails)
- **Development-only debugging**

---

## Files Requiring Logger Migration (Backend Only)

### High Priority - API Routes (Already Fixed ✅)

1. **`src/routes/api/widgets/active/+server.ts`** ✅ FIXED
   - Fixed variable name bug causing 500 error
   - Already using `logger.trace()` and `logger.error()`

### High Priority - API Routes (Need Migration)

2. **`src/routes/api/export/full/+server.ts`**
   - Line 185: `console.error('Export error:', error);`
   - **Action:** Replace with `logger.error('Export failed', { error })`

3. **`src/routes/api/config/load/+server.ts`**
   - Line 53: `console.error('Failed to dynamically load configuration:', error);`
   - **Action:** Replace with `logger.error('Failed to load configuration', { error })`

4. **`src/routes/api/config/backup/+server.ts`**
   - Line 38: `console.error('Configuration backup failed:', error);`
   - **Action:** Replace with `logger.error('Configuration backup failed', { error })`

### Medium Priority - Server Pages

5. **`src/routes/(app)/user/+page.server.ts`**
   - Line 55: `console.warn('Failed to fetch fresh user data, using session data:', error);`
   - **Action:** Replace with `logger.warn('Failed to fetch user data, using session fallback', { error })`

### Medium Priority - Server Utilities

6. **`src/utils/server-utils.ts`**
   - Line 46: `console.error('Error checking collection name:', error);`
   - **Action:** Replace with `logger.error('Collection name check failed', { error })`

7. **`src/utils/setupCheck.ts`**
   - Line 41: `console.error('[SveltyCMS] ❌ Error during setup check:', error);`
   - Line 81: `console.error('[SveltyCMS] ❌ Database validation failed during setup check:', error);`
   - **Action:** Replace with `logger.error()` calls

8. **`src/utils/entryActions.ts`**
   - Line 102: `console.warn('Batch delete failed, using individual deletes:', batchError);`
   - Line 383: `console.log('Cloning entry with payload:', clonedPayload);`
   - **Action:** Replace with `logger.warn()` and `logger.debug()`

---

## Files to Keep console.log (Justified)

### Build-Time Scripts (Cannot use logger)

1. **`src/utils/compilation/compile.ts`**
   - Multiple console.log/warn/error statements
   - **Reason:** Build-time compilation script, runs before app initialization
   - **Status:** ✅ Keep as-is

2. **`src/utils/vitePluginSecurityCheck.ts`**
   - Multiple console.warn/error for security violations
   - **Reason:** Vite plugin, runs during build process
   - **Status:** ✅ Keep as-is

3. **`src/content/vite.ts`**
   - Lines 26, 49: console.warn/error
   - **Reason:** Vite plugin for type generation
   - **Status:** ✅ Keep as-is

### Frontend/Mixed Usage Files

4. **`src/widgets/core/input/Input.svelte`** ✅ REVERTED
   - Lines 137, 172: console.log/error
   - **Reason:** Svelte component, runs in browser
   - **Status:** ✅ Keep console.log (already reverted logger changes)

5. **`src/stores/store.svelte.ts`** ✅ REVERTED
   - Line 53: console.warn
   - **Reason:** Shared store used in frontend and backend
   - **Status:** ✅ Keep console.warn (already reverted logger changes)

6. **`src/widgets/widgetManager.svelte.ts`**
   - Line 51: console.warn for inactive widgets
   - **Reason:** Frontend widget management
   - **Status:** ✅ Keep as-is

7. **`src/widgets/core/mediaUpload/Input.svelte`**
   - Line 17: console.log
   - **Reason:** Frontend component debugging
   - **Status:** ✅ Keep as-is

8. **`src/widgets/core/date/Display.svelte`**
   - Line 57: console.warn
   - **Reason:** Frontend display component
   - **Status:** ✅ Keep as-is

### Utility Files (Mixed Usage)

9. **`src/utils/toast.ts`**
   - Lines 23, 33, 37, 46: console.log/warn
   - **Reason:** Frontend toast notifications, debugging
   - **Status:** ✅ Keep as-is (helpful for debugging toast issues)

10. **`src/utils/modalUtils.ts`**
    - Line 39: console.warn
    - **Reason:** Frontend modal utilities
    - **Status:** ✅ Keep as-is

11. **`src/utils/memoryOptimizer.svelte.ts`**
    - Line 126: console.warn
    - **Reason:** May run in frontend, error handling
    - **Status:** ✅ Keep as-is

### Logger Internal (Must keep console)

12. **`src/utils/logger.svelte.ts`**
    - Multiple console.error/log statements
    - **Reason:** Logger fallback when file system fails
    - **Status:** ✅ Keep as-is (cannot use logger within logger!)

---

## Migration Plan

### Phase 1: Critical API Endpoints (High Priority)

```bash
# Files to update:
- src/routes/api/export/full/+server.ts
- src/routes/api/config/load/+server.ts
- src/routes/api/config/backup/+server.ts
```

### Phase 2: Server Utilities (Medium Priority)

```bash
# Files to update:
- src/routes/(app)/user/+page.server.ts
- src/utils/server-utils.ts
- src/utils/setupCheck.ts
- src/utils/entryActions.ts
```

### Phase 3: Verification

- Test with different LOG_LEVELS configurations
- Ensure no build-time errors
- Verify frontend still works correctly

---

## Console.log Statistics

### Total Found: ~50+ instances

**Categories:**

- ✅ **Already using logger:** 3 files (API routes)
- 🔄 **Should migrate to logger:** 8 files (backend-only)
- ✅ **Keep console.log:** 12+ files (frontend, build scripts, logger itself)

**Migration Status:**

- Fixed: 1 file (widgets/active API - also fixed 500 error)
- Reverted: 2 files (Input.svelte, store.svelte.ts - correctly kept as console.log)
- Pending: 8 files for logger migration

---

## Testing Commands

```bash
# Production level (errors only)
LOG_LEVELS='["error"]' bun run dev

# Standard production (errors + warnings)
LOG_LEVELS='["error","warn"]' bun run dev

# Production with info
LOG_LEVELS='["error","warn","info"]' bun run dev

# Development (includes debug)
LOG_LEVELS='["error","warn","info","debug"]' bun run dev

# Full debugging (includes trace)
LOG_LEVELS='["error","warn","info","debug","trace"]' bun run dev
```

---

## Related Documentation

- [Logger Levels Guide](./Logger_Levels.mdx) - Complete logger documentation
- [Logger Quick Reference](./Logger_Quick_Reference.md) - Decision guide
- [Logger Performance Refinements](./Logger_Performance_Refinements.md) - Performance details
