# Immediate Fix Summary: 503 Error on Fresh Install

## 🐛 Problem

**Symptom**: Fresh install causes 503 error and redirect loop
**Root Cause**: Vite creates `config/private.ts` with empty values, causing ambiguous setup state

### Request Flow (Broken):

```
1. Browser → http://localhost:5173/
2. handleSystemState (IDLE) → ✅ Allow
3. handleSetup → Config file exists ❓
4. handleSetup → Blocks /setup routes → Redirect to /login
5. Browser → /login
6. handleSystemState (IDLE) → ❌ Block /login → 503 error
```

## ✅ Solution

### Changes Made

#### 1. Fixed `handleSetup.ts`

**Problem**: Only checked file existence, not if values were filled

**Solution**: Added validation for empty values

```typescript
// OLD (broken):
if (!configExists) {
    redirect to /setup ✅
}
if (pathname.startsWith('/setup')) {
    redirect to /login ❌  // Runs even with empty config!
}

// NEW (fixed):
if (!configExists) {
    redirect to /setup ✅
}

// Check if config has actual values
const hasValidJwtSecret = /* not empty */;
const hasValidDbHost = /* not empty */;
const hasValidDbName = /* not empty */;

if (!hasValidValues) {
    redirect to /setup ✅  // Treat as unconfigured
}

// Only block setup if config is truly complete
if (pathname.startsWith('/setup')) {
    redirect to /login ✅
}
```

#### 2. Fixed `handleSystemState.ts`

**Problem**: `/login` blocked during IDLE state

**Solution**: Added `/login` to allowed paths during IDLE

```typescript
if (systemState.overallState === 'IDLE') {
	const allowedPaths = [
		'/setup',
		'/api/setup',
		'/login' // ← Added this
		// ...
	];
}
```

### Request Flow (Fixed):

```
1. Browser → http://localhost:5173/
2. handleSystemState (IDLE) → ✅ Allow
3. handleSetup → Config empty → Redirect to /setup ✅
4. Browser → /setup
5. handleSystemState (IDLE) → ✅ Allow /setup
6. Setup wizard loads successfully ✅
```

## 🧪 Testing

### Test Case 1: Fresh Install

```bash
# Clean state
rm config/private.ts
bun run dev

# Expected:
# 1. Vite creates empty private.ts
# 2. Browser opens http://localhost:5173/setup
# 3. Setup wizard loads ✅
```

### Test Case 2: Completed Setup

```bash
# After completing setup
# Config has real values

# Try to access /setup
curl http://localhost:5173/setup

# Expected: 302 redirect to /login ✅
```

### Test Case 3: Partial Config

```bash
# Config exists but only JWT_SECRET filled

# Expected:
# Still redirects to /setup ✅
# (All three values must be filled)
```

## 📊 Impact

### Before Fix

- ❌ 503 errors on fresh install
- ❌ Setup wizard inaccessible
- ❌ Confusing error messages
- ❌ Redirect loop /login → 503 → /login

### After Fix

- ✅ Setup wizard loads immediately
- ✅ Clear path: / → /setup → complete → /login
- ✅ No 503 errors during setup
- ✅ Proper state validation

## 🔍 Code Changes

### File: `src/hooks/handleSetup.ts`

- Added `readFileSync` and `join` imports
- Added validation logic for config values
- Treats empty config same as missing config

### File: `src/hooks/handleSystemState.ts`

- Added `/login` to IDLE state allowed paths
- Better UX during state transitions

## 🎯 Next Steps

Now that the immediate issue is fixed, you can proceed with:

1. ✅ **Phase 0 Complete** - Fresh install works
2. 📦 **Phase 1** - Set up NX monorepo structure
3. 🔧 **Phase 2** - Extract setup into separate package
4. 🚀 **Phase 3** - Deploy modular architecture

See `docs/NX_MONOREPO_SETUP_EXTRACTION_PLAN.md` for full roadmap.

---

**Fixed by**: AI Assistant  
**Date**: 2025-10-20  
**Files Changed**: 2  
**Lines Changed**: ~40  
**Status**: ✅ Ready for testing
