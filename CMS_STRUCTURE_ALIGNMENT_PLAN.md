# CMS Structure Alignment Plan - Next → NX2

**Date:** November 8, 2025  
**Client Request:** Apply folder structure and file naming from `next` branch to `nx2` branch  
**Priority:** HIGH - Team waiting for this

---

## 📋 Client Requirements

**From Client Message:**

1. "please pull next as lots was fixed for bettwe media, isodated, gallery and types fixing"
2. "So if step 1 structure cms (renamed file names @file app/cms/xxx, docs, test.... Is pushed ASAP then all other can work with this"

**What Client Wants:**

- ✅ Apply structural changes from `next` to `nx2`
- ✅ Rename files to match `next` branch
- ✅ Move folders to match `next` branch
- ✅ Update all import paths
- ✅ NO logic changes - just structure alignment
- ✅ Ensure no CMS ↔ Setup-wizard imports
- ✅ Push ASAP for team

---

## 🔍 Analysis: Next vs NX2 Structure

### Branch Structures:

**NEXT Branch (Monolithic):**

```
next/
├── src/
│   ├── components/
│   ├── content/
│   ├── databases/
│   ├── hooks/
│   ├── messages/
│   ├── routes/
│   ├── services/
│   ├── stores/
│   ├── themes/
│   ├── utils/
│   └── widgets/
├── config/
├── docs/
└── static/
```

**NX2 Branch (Monorepo):**

```
nx2/
├── apps/
│   ├── cms/
│   │   └── src/  ← Maps to next/src/
│   ├── setup-wizard/
│   ├── shared-config/
│   ├── shared-utils/
│   └── docs/
└── config/
```

**Mapping:** `next/src/` → `nx2/apps/cms/src/`

---

## 📊 Recent Changes in Next Branch

### Latest Commits:

1. **c69bd7df** - "remove media" (23 min ago)
2. **571e95df** - "Better Media handeling & Smarter MediaGallery, ISODates and types fixes" (3 hours ago)
3. **0ab1de11** - "better-svelte-email"

### Key Changes Found:

#### 1. Documentation Structure Changes

**Renamed/Moved:**

- `docs/cleanup/FUTURE_IMPROVEMENTS.md` → `docs/Todos/FUTURE_IMPROVEMENTS.md`
- `docs/guides/Image_Editor_Integration.md` → `docs/Todos/Image_Editor_Integration.md`
- `docs/guides/refactoring-the-image-editor.md` → `docs/Todos/refactoring-the-image-editor.md`

**New Files:**

- `docs/Todos/MEDIA_GALLERY_IMPROVEMENTS.md`
- `docs/guides/enterprise-media-gallery-implementation.mdx`
- `docs/guides/media-gallery-guide.mdx`
- `docs/guides/media-gallery-structure.mdx`

#### 2. New API Routes

**Added in next:**

- `src/routes/api/media/bulk-download/` (NEW)
- `src/routes/api/media/search/` (NEW)

**Only in nx2:**

- `src/routes/api/collections/[collectionId]/batch-delete/`
- `src/routes/api/dashboard/systemPreferences/`
- `src/routes/api/system/performance/`
- `src/routes/api/virtualFolder/`

#### 3. Modified Files (Content Changes)

These files have logic/content changes, not structural:

- Media components (LeftSidebar, WatermarkSelector, etc.)
- Database files (auth, schemas, dbInterface)
- Content manager
- Hooks (authentication, firewall, rate limit)
- Routes (layout, collection pages)

---

## 🎯 Action Plan

### Phase 1: Documentation Structure (Low Risk)

**Apply doc folder changes from next to nx2:**

1. Move/rename doc files:

   ```bash
   # In nx2 branch
   mkdir -p docs/Todos/
   mv docs/cleanup/FUTURE_IMPROVEMENTS.md docs/Todos/ (if exists)
   mv docs/guides/Image_Editor_Integration.md docs/Todos/ (if exists)
   mv docs/guides/refactoring-the-image-editor.md docs/Todos/ (if exists)
   ```

2. Add new doc files (copy from next)

### Phase 2: New API Routes (Medium Risk)

**Add missing API routes from next:**

1. Copy `src/routes/api/media/bulk-download/` from next to `apps/cms/src/routes/api/media/bulk-download/`
2. Copy `src/routes/api/media/search/` from next to `apps/cms/src/routes/api/media/search/`
3. Update imports in these files to match nx2 structure

### Phase 3: Content Updates (High Risk - Careful!)

**Update file contents (NOT structure) for:**

1. Media-related files (client mentioned "better media")
2. ISO date handling (client mentioned "isodated")
3. Gallery improvements (client mentioned "gallery")
4. Type fixes (client mentioned "types fixing")

**Files to update (content only, not rename):**

- `apps/cms/src/components/LeftSidebar.svelte`
- `apps/cms/src/components/WatermarkSelector.svelte`
- `apps/cms/src/components/collectionDisplay/EntryList_MultiButton.svelte`
- `apps/cms/src/content/ContentManager.ts`
- `apps/cms/src/content/types.ts`
- `apps/cms/src/databases/schemas.ts`
- `apps/cms/src/databases/dbInterface.ts`
- `apps/cms/src/databases/auth/*` (multiple files)
- `apps/cms/src/utils/serialize.ts`
- And more...

### Phase 4: Verify & Test

1. Check no CMS ↔ Setup-wizard imports
2. Run type check
3. Run build
4. Test both apps

---

## ⚠️ Important Notes

### What We're Doing:

- ✅ Applying structural changes (file/folder renames/moves)
- ✅ Copying new files from next
- ✅ Updating file contents with fixes from next
- ✅ Updating import paths

### What We're NOT Doing:

- ❌ Changing business logic unnecessarily
- ❌ Rewriting components
- ❌ Breaking existing functionality
- ❌ Creating new circular dependencies

---

## 🚨 Risks & Mitigation

### Risk 1: Breaking Changes

**Mitigation:**

- Test after each phase
- Keep backup branch
- Verify builds pass

### Risk 2: Import Path Issues

**Mitigation:**

- Carefully update all imports
- Use search/replace systematically
- Run type check frequently

### Risk 3: Circular Dependencies

**Mitigation:**

- Check for CMS ↔ Setup-wizard imports
- Use shared modules only
- Run circular dependency check

---

## 📝 Execution Steps

### Step 1: Backup ✅ DONE

```bash
git branch backup-before-structure-alignment-$(date +%Y%m%d-%H%M%S)
```

### Step 2: Fetch Latest Next ✅ DONE

```bash
git fetch upstream next
```

### Step 3: Compare Structures ✅ DONE

- Analyzed differences
- Created this plan

### Step 4: Apply Documentation Changes

- [ ] Move/rename doc files
- [ ] Add new doc files
- [ ] Update doc links

### Step 5: Add New API Routes

- [ ] Copy bulk-download route
- [ ] Copy search route
- [ ] Update imports

### Step 6: Update File Contents

- [ ] Media improvements
- [ ] ISO date fixes
- [ ] Gallery improvements
- [ ] Type fixes

### Step 7: Verify

- [ ] Check imports
- [ ] Run type check
- [ ] Run build
- [ ] Test apps

### Step 8: Commit & Push

- [ ] Create clear commit message
- [ ] Push to nx2
- [ ] Notify client

---

## 🎯 Success Criteria

- ✅ All structural changes from next applied to nx2
- ✅ No CMS ↔ Setup-wizard circular imports
- ✅ Type check passes
- ✅ Build succeeds
- ✅ Both apps run without errors
- ✅ Team can work with new structure

---

**Status:** 🔄 IN PROGRESS  
**Next:** Apply documentation changes
