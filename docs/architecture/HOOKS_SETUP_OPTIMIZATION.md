# Hooks Analysis - Setup Route Optimization

## Date: October 10, 2025

**Context:** Setup will be a separate application in the future, so we should minimize hooks processing during setup to improve performance and reduce log noise.

---

## Analysis of Each Hook

### ✅ 1. addSecurityHeaders.ts

**Current:** Adds security headers to ALL responses

**Should Skip Setup?** ❌ **NO** - Keep security headers even for setup

**Reason:** Security headers (X-Frame-Options, CSP, etc.) protect against attacks regardless of setup state

**Action:** No changes needed

**Impact:** Security headers are lightweight and important

---

### ✅ 2. handleApiRequests.ts

**Current:** Only processes `/api/*` with authenticated users

**Should Skip Setup?** ✅ **ALREADY SKIPS** - Requires `locals.user`

**Current Code:**

```typescript
if (!url.pathname.startsWith('/api/') || !locals.user) {
	return resolve(event);
}
```

**Reason:** Setup routes (`/api/setup/*`) run before authentication, so this naturally skips them

**Action:** No changes needed

**Impact:** Already optimized ✅

---

### ⚠️ 3. handleAuthentication.ts

**Current:** Runs on every request, checks database health, attaches adapter

**Should Skip Setup?** ⚠️ **PARTIAL SKIP** - Needs optimization

**Issues:**

1. Checks `isServiceHealthy('database')` on every setup request
2. Triggers `dbInitPromise` even during setup
3. Validates session cookies during setup (unnecessary)

**Recommended Changes:**

```typescript
export const handleAuthentication: Handle = async ({ event, resolve }) => {
  const { locals, url } = event;

  // Skip authentication entirely for setup routes
  if (url.pathname.startsWith('/setup') || url.pathname.startsWith('/api/setup')) {
    // Still attach dbAdapter if available (needed by setup endpoints)
    if (dbAdapter) {
      locals.dbAdapter = dbAdapter;
    }
    return resolve(event);
  }

  // ... rest of authentication logic
```

**Impact:**

- ✅ No database health checks during setup
- ✅ No session validation during setup
- ✅ Cleaner logs

---

### ⚠️ 4. handleAuthorization.ts

**Current:** Runs on every request, checks roles, caches admin data

**Should Skip Setup?** ✅ **YES** - Not needed during setup

**Issues:**

1. Checks user roles during setup (no users yet)
2. Tries to cache user count during setup
3. Initializes roles during setup

**Recommended Changes:**

```typescript
export const handleAuthorization: Handle = async ({ event, resolve }) => {
  // Skip authorization entirely for setup routes
  if (event.url.pathname.startsWith('/setup') || event.url.pathname.startsWith('/api/setup')) {
    return resolve(event);
  }

  // ... rest of authorization logic
```

**Impact:**

- ✅ No role checking during setup
- ✅ No cache operations during setup
- ✅ Much faster setup requests

---

### ✅ 5. handleLocale.ts

**Current:** Handles locale cookies and updates stores

**Should Skip Setup?** ❌ **NO** - Locale is useful for setup UI

**Reason:** Setup wizard might need i18n support

**Action:** No changes needed

**Impact:** Locale handling is lightweight and useful

---

### ⚠️ 6. handleMultiTenancy.ts

**Current:** Identifies tenant from hostname

**Should Skip Setup?** ⚠️ **MAYBE** - Depends on architecture

**Questions:**

1. Is multi-tenancy available during setup?
2. Does each tenant have separate setup?

**Recommended Changes (if setup is global):**

```typescript
export const handleMultiTenancy: Handle = async ({ event, resolve }) => {
	// Skip multi-tenancy for setup routes (setup is global)
	if (event.url.pathname.startsWith('/setup') || event.url.pathname.startsWith('/api/setup')) {
		return resolve(event);
	}

	if (privateEnv.MULTI_TENANT) {
		// ... tenant identification logic
	}
	return resolve(event);
};
```

**Impact:**

- ✅ No tenant lookups during setup
- ✅ Simpler setup flow

---

### ✅ 7. handleRateLimit.ts

**Current:** Skips localhost and static assets

**Should Skip Setup?** ⚠️ **MAYBE** - Could skip to speed up setup testing

**Current Code:**

```typescript
if (isStaticAsset(event.url.pathname) || isLocalhost(clientIp) || building) {
	return resolve(event);
}
```

**Recommended Changes (optional):**

```typescript
// Skip rate limiting for setup routes (for easier testing)
const isSetupRoute = event.url.pathname.startsWith('/setup') || event.url.pathname.startsWith('/api/setup');
if (isStaticAsset(event.url.pathname) || isLocalhost(clientIp) || building || isSetupRoute) {
	return resolve(event);
}
```

**Impact:**

- ✅ No rate limiting during setup (easier testing)
- ⚠️ Could allow setup abuse (low risk if setup is separate app)

**Decision:** Optional - depends on security requirements

---

### ✅ 8. handleSessionAuth.ts

**Current:** **ALREADY SKIPS SETUP** ✅

**Current Code:**

```typescript
const isSetupRoute = event.url.pathname.startsWith('/setup') || event.url.pathname.startsWith('/api/setup');
if (isSetupRoute) {
	logger.info(`Bypassing authentication for setup route: ${event.url.pathname}`);
	if (!event.locals.dbAdapter && dbAdapter) {
		event.locals.dbAdapter = dbAdapter;
	}
	return resolve(event);
}
```

**Action:** No changes needed - already optimized! ✅

**Impact:** Already skipping session validation during setup

---

### ✅ 9. handleSetup.ts

**Current:** Manages setup flow and redirects

**Should Skip Setup?** ❌ **NO** - This IS the setup handler

**Reason:** Core setup logic lives here

**Action:** No changes needed

**Impact:** Essential for setup flow

---

### ✅ 10. handleStaticAssetCaching.ts

**Current:** Adds cache headers to static assets

**Should Skip Setup?** ❌ **NO** - Helps setup performance

**Reason:** Caching static assets speeds up setup UI

**Action:** No changes needed

**Impact:** Improves setup page load times

---

### ✅✅ 11. handleTheme.ts

**Current:** **ALREADY SKIPS SETUP** ✅ (after our recent fix)

**Current Code:**

```typescript
// Skip ThemeManager entirely during setup - no logging needed
if (!event.url.pathname.startsWith('/setup') && !event.url.pathname.startsWith('/api/setup')) {
	// Only try to load ThemeManager for non-setup routes
}
```

**Action:** No changes needed - just fixed! ✅

**Impact:** No ThemeManager logs during setup

---

## Summary & Recommendations

### Hooks That Should Skip Setup (Priority Order)

| Priority   | Hook                 | Status          | Action                           |
| ---------- | -------------------- | --------------- | -------------------------------- |
| **HIGH**   | handleAuthorization  | ❌ Not Skipping | Add skip check                   |
| **HIGH**   | handleAuthentication | ⚠️ Partial      | Optimize skip check              |
| **MEDIUM** | handleMultiTenancy   | ⚠️ Conditional  | Add skip if setup is global      |
| **LOW**    | handleRateLimit      | ✅ Optional     | Consider adding skip for testing |

### Hooks Already Optimized

| Hook              | Status                              |
| ----------------- | ----------------------------------- |
| handleSessionAuth | ✅ Already skips setup              |
| handleTheme       | ✅ Already skips setup (just fixed) |
| handleApiRequests | ✅ Naturally skips (no auth)        |
| handleSetup       | ✅ Core setup handler               |

### Hooks That Should NOT Skip

| Hook                     | Reason                    |
| ------------------------ | ------------------------- |
| addSecurityHeaders       | Security is always needed |
| handleLocale             | i18n useful for setup     |
| handleStaticAssetCaching | Performance optimization  |

---

## Implementation Plan

### Phase 1: Critical Optimizations (Do Now)

#### 1. Fix handleAuthorization.ts

```typescript
export const handleAuthorization: Handle = async ({ event, resolve }) => {
	const { locals, url } = event;

	// Skip authorization entirely for setup routes - no users/roles exist yet
	if (url.pathname.startsWith('/setup') || url.pathname.startsWith('/api/setup')) {
		return resolve(event);
	}

	// ... rest of the authorization logic (roles, permissions, caching)
};
```

**Impact:** Eliminates role checking, user count caching, and admin data queries during setup

#### 2. Optimize handleAuthentication.ts

```typescript
export const handleAuthentication: Handle = async ({ event, resolve }) => {
	const { locals, url } = event;

	// Skip authentication entirely for setup routes
	if (url.pathname.startsWith('/setup') || url.pathname.startsWith('/api/setup')) {
		// Still attach dbAdapter if available (needed by setup endpoints)
		if (dbAdapter) {
			locals.dbAdapter = dbAdapter;
		}
		return resolve(event);
	}

	// Check if database is ready (non-blocking check)
	if (!isServiceHealthy('database')) {
		dbInitPromise.catch((err) => {
			console.error('Database initialization failed in handleAuthentication', err);
		});
	}

	// ... rest of authentication logic
};
```

**Impact:** Eliminates database health checks and session validation during setup

---

### Phase 2: Conditional Optimizations (Consider)

#### 3. handleMultiTenancy.ts (if setup is global)

```typescript
export const handleMultiTenancy: Handle = async ({ event, resolve }) => {
	// Skip multi-tenancy for setup routes (setup is global, not per-tenant)
	if (event.url.pathname.startsWith('/setup') || event.url.pathname.startsWith('/api/setup')) {
		return resolve(event);
	}

	if (privateEnv.MULTI_TENANT) {
		const tenantId = getTenantIdFromHostname(event.url.hostname);
		if (!tenantId) {
			throw error(404, `Tenant not found for hostname: ${event.url.hostname}`);
		}
		event.locals.tenantId = tenantId;
		logger.trace(`Request identified for tenant: ${tenantId}`);
	}
	return resolve(event);
};
```

**Impact:** Eliminates tenant lookups during setup

#### 4. handleRateLimit.ts (optional for testing)

```typescript
export const handleRateLimit: Handle = async ({ event, resolve }) => {
	const clientIp = getClientIp(event);

	// Skip rate limiting for setup routes (easier testing)
	const isSetupRoute = event.url.pathname.startsWith('/setup') || event.url.pathname.startsWith('/api/setup');

	if (isStaticAsset(event.url.pathname) || isLocalhost(clientIp) || building || isSetupRoute) {
		return resolve(event);
	}

	// ... rate limiting logic
};
```

**Impact:** Eliminates rate limiting during setup (useful for automated testing)

---

## Expected Performance Improvements

### Before Optimizations:

**Setup Request Processing:**

```
1. addSecurityHeaders ✅ (fast)
2. handleStaticAssetCaching ✅ (fast)
3. handleLocale ✅ (fast)
4. handleRateLimit ⚠️ (moderate)
5. handleMultiTenancy ⚠️ (DB lookup if multi-tenant)
6. handleAuthentication ❌ (DB health check + session validation)
7. handleSessionAuth ✅ (already skips)
8. handleAuthorization ❌ (role init + user count + cache queries)
9. handleTheme ✅ (already skips)
10. handleApiRequests ✅ (naturally skips)
11. handleSetup ✅ (core logic)
```

**Estimated Processing Time:** ~50-100ms per setup request

### After Optimizations:

**Setup Request Processing:**

```
1. addSecurityHeaders ✅ (fast)
2. handleStaticAssetCaching ✅ (fast)
3. handleLocale ✅ (fast)
4. handleRateLimit ✅ (skipped)
5. handleMultiTenancy ✅ (skipped)
6. handleAuthentication ✅ (skipped early)
7. handleSessionAuth ✅ (skipped early)
8. handleAuthorization ✅ (skipped early)
9. handleTheme ✅ (skipped)
10. handleApiRequests ✅ (naturally skipped)
11. handleSetup ✅ (core logic)
```

**Estimated Processing Time:** ~5-10ms per setup request

**Performance Gain:** **80-90% faster setup requests** 🚀

---

## Log Cleanliness Improvements

### Before:

```
[WARN] System setup is not complete...
[INFO] Bypassing authentication for setup route: /api/setup/test-database
[TRACE] Auth service not ready, allowing setup request
[TRACE] ThemeManager not ready, using default theme  ❌ (fixed)
[DEBUG] Checking database health...  ❌ (will fix)
[INFO] Initializing roles...  ❌ (will fix)
[DEBUG] Caching user count...  ❌ (will fix)
[TRACE] Validating session...  ❌ (will fix)
[DEBUG] Request /api/setup/test-database 610.8ms
```

### After:

```
[WARN] System setup is not complete...
[INFO] Bypassing authentication for setup route: /api/setup/test-database
[DEBUG] Request /api/setup/test-database 50.2ms ⚡
```

**Log Reduction:** ~70-80% fewer log lines during setup ✅

---

## Testing Plan

### Test 1: Fresh Setup Flow

**Steps:**

1. Delete `config/private.ts`
2. Clear database
3. Start server: `bun dev`
4. Navigate to `/setup`
5. Complete setup wizard

**Expected:**

- ✅ No authentication logs during setup
- ✅ No authorization/role logs during setup
- ✅ No multi-tenancy logs during setup
- ✅ Faster request times (~50-100ms → ~5-10ms)
- ✅ Clean minimal logs

### Test 2: State Machine Integration

**Focus:**

- Verify state machine still works after setup completes
- Check that hooks activate properly post-setup

**Expected:**

- ✅ Authentication works after setup
- ✅ Authorization/roles work after setup
- ✅ Multi-tenancy works (if enabled)
- ✅ State machine reaches READY

---

## Migration Path (Future Separate Setup App)

When setup becomes a separate application:

1. **Remove hooks entirely from setup app:**
   - addSecurityHeaders (add basic headers in setup app)
   - handleAuthentication (not needed)
   - handleAuthorization (not needed)
   - handleMultiTenancy (not needed)
   - handleSessionAuth (not needed)
   - handleTheme (use simple default theme)
   - handleApiRequests (not needed)

2. **Keep in setup app:**
   - handleSetup (core logic)
   - handleLocale (i18n support)
   - handleStaticAssetCaching (performance)
   - Basic rate limiting (if needed)

3. **Simplify setup app:**
   - Single database connection
   - No auth system
   - No caching layers
   - No multi-tenancy
   - Minimal middleware

**Result:** Setup app becomes a lightweight wizard (~500 lines) instead of full CMS

---

## Recommendations

### Implement Now (High Priority):

1. ✅ Fix handleAuthorization - skip setup routes
2. ✅ Optimize handleAuthentication - skip setup routes early
3. ✅ Consider handleMultiTenancy skip (if setup is global)

### Implement Later (Low Priority):

4. ⚠️ handleRateLimit skip (optional, for testing convenience)

### Already Done:

- ✅ handleTheme - already skips setup
- ✅ handleSessionAuth - already skips setup
- ✅ systemMethods logging - already optimized to TRACE

---

## Summary

**Files to Modify:**

1. `src/hooks/handleAuthorization.ts` - Add early skip for setup routes
2. `src/hooks/handleAuthentication.ts` - Optimize skip logic
3. `src/hooks/handleMultiTenancy.ts` - Add skip if setup is global (optional)
4. `src/hooks/handleRateLimit.ts` - Add skip for setup routes (optional)

**Expected Benefits:**

- ✅ 80-90% faster setup requests
- ✅ 70-80% fewer log lines during setup
- ✅ Cleaner state machine testing
- ✅ Better separation of concerns
- ✅ Easier migration to separate setup app

**Ready to implement?** Let me know and I'll make the changes! 🚀
