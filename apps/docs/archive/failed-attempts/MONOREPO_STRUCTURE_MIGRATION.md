# Monorepo Structure Migration - Complete

## 📋 Overview

Successfully migrated `config/` and `compiledCollections/` from app-specific directories to workspace root level, implementing proper monorepo architecture for shared resources.

**Date:** October 22, 2025  
**Branch:** next

---

## 🎯 Objectives Achieved

1. ✅ Moved `config/` and `compiledCollections/` to workspace root
2. ✅ Both apps (CMS & setup-wizard) can access shared `private.ts`
3. ✅ Compilation logic moved to shared-utils (monorepo-aware)
4. ✅ Both apps compile collections independently (setup-wizard: pre-seed, CMS: on restart)
5. ✅ No dedicated package created (kept simple)

---

## 📁 Directory Structure Changes

### Before:

```
SveltyCMS/
├── apps/
│   ├── cms/
│   │   ├── config/              ❌ CMS-specific
│   │   │   ├── private.ts
│   │   │   ├── roles.ts
│   │   │   └── collections/
│   │   ├── compiledCollections/  ❌ CMS-specific
│   │   └── src/
│   │       └── utils/
│   │           └── compilation/
│   │               └── compile.ts  ❌ CMS-specific
│   ├── setup-wizard/
│   └── shared-utils/
```

### After:

```
SveltyCMS/
├── config/                       ✅ Workspace root (shared)
│   ├── private.ts
│   ├── roles.ts
│   └── collections/
├── compiledCollections/          ✅ Workspace root (shared)
│   ├── Collections/
│   └── Menu/
├── apps/
│   ├── cms/
│   ├── setup-wizard/
│   └── shared-utils/
│       └── compile.ts            ✅ Shared compilation logic
```

---

## 🔧 Files Modified

### 1. **Moved Directories**

- `apps/cms/config/` → `config/` (workspace root)
- `apps/cms/compiledCollections/` → `compiledCollections/` (workspace root)

### 2. **Created Files**

- `apps/shared-utils/compile.ts` - Monorepo-aware compilation logic with workspace root detection

### 3. **Updated Files**

#### **apps/cms/vite.config.ts**

```typescript
// Before
const paths = {
	configDir: path.resolve(__dirname, './config'),
	compiledCollections: path.resolve(__dirname, './compiledCollections')
};
import { compile } from './src/utils/compilation/compile';

// After
const workspaceRoot = path.resolve(__dirname, '../..');
const paths = {
	configDir: path.resolve(workspaceRoot, 'config'),
	compiledCollections: path.resolve(workspaceRoot, 'compiledCollections')
};
import { compile } from '@utils/compile';
```

#### **apps/cms/svelte.config.js**

```javascript
// Added alias
'@collections': '../../config/collections',
'@config': '../../config',
```

#### **apps/setup-wizard/svelte.config.js**

```javascript
// Added alias
'@config': '../../config',
```

#### **apps/cms/src/utils/setupCheck.ts**

```typescript
// Before
const configDir = join(process.cwd(), 'config');

// After
const workspaceRoot = join(process.cwd(), '..', '..');
const configDir = join(workspaceRoot, 'config');
```

#### **apps/setup-wizard/src/utils/setupCheck.ts**

```typescript
// Before
const configDir = join(process.cwd(), 'config');

// After
const workspaceRoot = join(process.cwd(), '..', '..');
const configDir = join(workspaceRoot, 'config');
```

#### **.gitignore**

```ignore
# Before
/apps/cms/config/private.ts
/apps/cms/config/backup/
/apps/cms/compiledCollections/*

# After
/config/private.ts
/config/backup/
/compiledCollections/*
```

---

## 🔑 Key Features of New Architecture

### 1. **Workspace Root Detection**

`apps/shared-utils/compile.ts` automatically finds the workspace root:

```typescript
async function findWorkspaceRoot(startDir: string = process.cwd()): Promise<string> {
	// Looks for nx.json or package.json with workspaces
	// Traverses up the directory tree until found
}
```

### 2. **Compilation Flow**

#### **CMS Compilation** (Development Mode)

- **When:** On app start + file changes (HMR)
- **Purpose:** Reflect real-time collection changes
- **Location:** `apps/cms/vite.config.ts`

```typescript
import { compile } from '@utils/compile';
await compile({
	userCollections: paths.userCollections,
	compiledCollections: paths.compiledCollections
});
```

#### **Setup Wizard Compilation** (Pre-Seed)

- **When:** Before seeding database with collections
- **Purpose:** Ensure compiled collections exist for database seeding
- **Location:** `apps/setup-wizard/src/routes/api/setup/seed.ts`

```typescript
import { compile } from '@utils/compile';
await compile(); // Uses workspace root automatically
```

### 3. **Path Resolution**

Both apps now resolve paths relative to workspace root:

```typescript
// CMS or Setup-Wizard
const workspaceRoot = join(process.cwd(), '..', '..');
const configPath = join(workspaceRoot, 'config/private.ts');
const compiledPath = join(workspaceRoot, 'compiledCollections');
```

### 4. **Environment Variables**

CMS sets `VITE_COLLECTIONS_FOLDER` for runtime access:

```typescript
// vite.config.ts
define: {
    'import.meta.env.VITE_COLLECTIONS_FOLDER': JSON.stringify(paths.compiledCollections)
}
```

---

## 🏗️ Architecture Benefits

### ✅ Monorepo Compliance

- **Shared Resources:** `config/` and `compiledCollections/` are truly shared
- **No Circular Dependencies:** Apps → shared-utils (never reverse)
- **Proper Boundaries:** Each app can compile independently

### ✅ Flexibility

- **CMS:** Compiles on every change (HMR enabled)
- **Setup-Wizard:** Pre-compiles before seeding
- **Compilation Logic:** Shared, monorepo-aware, testable

### ✅ Maintainability

- **Single Source of Truth:** One `compile.ts` in shared-utils
- **Clear Ownership:** Workspace root owns shared data
- **Easy Testing:** Workspace root detection works in any app

---

## 🔍 Verification Steps

### 1. **Check Directory Locations**

```bash
ls -la /path/to/SveltyCMS/config/
ls -la /path/to/SveltyCMS/compiledCollections/
```

Should show:

- `config/private.ts`, `config/roles.ts`, `config/collections/`
- `compiledCollections/Collections/`, `compiledCollections/Menu/`

### 2. **Verify Imports**

```bash
grep -r "from '@utils/compile'" apps/cms/
grep -r "from '@config" apps/
```

### 3. **Test CMS Development Mode**

```bash
cd apps/cms
bun run dev
# Should compile collections on start
# Edit a collection → should recompile automatically
```

### 4. **Test Setup Wizard**

```bash
cd apps/setup-wizard
bun run dev
# Should access shared config/private.ts
# Setup process should compile collections before seeding
```

---

## 📝 Migration Checklist

- [x] Move `apps/cms/config/` to workspace root
- [x] Move `apps/cms/compiledCollections/` to workspace root
- [x] Create `apps/shared-utils/compile.ts` with workspace detection
- [x] Update `apps/cms/vite.config.ts` imports and paths
- [x] Update `apps/cms/svelte.config.js` aliases
- [x] Update `apps/setup-wizard/svelte.config.js` aliases
- [x] Update `apps/cms/src/utils/setupCheck.ts` paths
- [x] Update `apps/setup-wizard/src/utils/setupCheck.ts` paths
- [x] Update `.gitignore` for new locations
- [x] Add `VITE_COLLECTIONS_FOLDER` environment variable
- [x] Verify no TypeScript errors
- [x] Test compilation in both apps

---

## 🚨 Breaking Changes

### For Developers

1. **Config Location Changed**
   - Old: `apps/cms/config/private.ts`
   - New: `config/private.ts` (workspace root)

2. **Compiled Collections Location Changed**
   - Old: `apps/cms/compiledCollections/`
   - New: `compiledCollections/` (workspace root)

3. **Import Changes**
   - Old: `import { compile } from './src/utils/compilation/compile'`
   - New: `import { compile } from '@utils/compile'`

### For CI/CD

Update any scripts that reference the old paths:

```bash
# Old
cd apps/cms && cat config/private.ts

# New
cd workspace-root && cat config/private.ts
```

---

## 📚 Related Documentation

- `NX_MONOREPO_ARCHITECTURE_FIXED.md` - Shared-utils dependency rules
- `SKELETON_V4_MIGRATION_TODO.md` - Skeleton v4 migration progress
- `apps/shared-utils/compile.ts` - Compilation logic source code
- `apps/cms/vite.config.ts` - CMS compilation integration

---

## 🎉 Summary

This migration establishes proper monorepo architecture where:

1. **Shared resources live at workspace root** (`config/`, `compiledCollections/`)
2. **Shared logic lives in shared-utils** (`compile.ts`)
3. **Apps consume shared resources** (via workspace-aware paths)
4. **No circular dependencies** (apps → shared-utils, never reverse)
5. **Both apps compile independently** (CMS: HMR, Setup-Wizard: pre-seed)

The architecture now follows NX best practices and scales better for future apps or libraries.
