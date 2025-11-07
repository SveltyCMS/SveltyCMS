# SveltyCMS Migration Tasks: Next Branch → NX2 Monorepo

**Date Started:** November 7, 2025  
**Client Request:** Migrate improvements from `next` branch to `nx2` monorepo structure  
**Goal:** Combine advanced features from `next` with clean NX monorepo architecture

---

## 📋 **PHASE 1: ANALYSIS & PLANNING**

### 1.1 Analyze Next Branch Improvements

- [x] Checkout `next` branch and document structure
- [x] List all new features/improvements in `next` branch
- [x] Identify components that need migration
- [x] Document API changes and new endpoints
- [x] List database schema changes
- [x] Identify new dependencies
- **✅ COMPLETE** - See `ANALYSIS_NEXT_VS_NX2.md` for details

### 1.2 Analyze Current NX2 Structure

- [x] Document current `nx2` monorepo structure
- [x] List all apps and their purposes
- [x] Identify shared libraries
- [x] Document current dependencies
- [x] Map out current architecture
- **✅ COMPLETE** - See `ANALYSIS_NX2_STRUCTURE.md` for details

### 1.3 Identify Conflicts & Issues

- [x] Find conflicting implementations between branches
- [x] Identify the `private.ts` sharing problem
- [x] Document setup-wizard ↔ cms dependencies
- [x] List breaking changes that need resolution
- [x] Create migration strategy for conflicts
- **✅ COMPLETE** - See `MIGRATION_STRATEGY.md` for details

---

## 📋 **PHASE 2: CODE MIGRATION (Next → NX2)**

### 2.1 Core CMS Features

- [ ] Migrate improved components from `next/src/components/`
- [ ] Update routes with new features from `next/src/routes/`
- [ ] Migrate enhanced stores from `next/src/stores/`
- [ ] Update utilities with improvements from `next/src/utils/`
- [ ] Migrate new widgets from `next/src/widgets/`

### 2.2 Database & Authentication

- [ ] Migrate database improvements
- [ ] Update authentication logic
- [ ] Migrate new database schemas
- [ ] Update migration scripts
- [ ] Migrate roles in database feature

### 2.3 API & GraphQL

- [ ] Migrate API endpoint improvements
- [ ] Update GraphQL schema and resolvers
- [ ] Migrate new API features
- [ ] Update API documentation

### 2.4 UI/UX Improvements

- [ ] Migrate GlobalLoading improvements
- [ ] Update navigation enhancements
- [ ] Migrate widget improvements
- [ ] Update translation status features
- [ ] Migrate theme improvements

### 2.5 New Features from Next Branch

- [ ] Migrate 2FA (Two-Factor Authentication) start
- [ ] Migrate cloud storage features
- [ ] Migrate Quantum-Resistant features
- [ ] Migrate Prefresh improvements
- [ ] Migrate website tokens feature
- [ ] Migrate split server/client logger
- [ ] Migrate mediaGallery SystemVirtualFolders
- [ ] Migrate SSR for entrylist/fields with better types

---

## 📋 **PHASE 3: ARCHITECTURE FIXES**

### 3.1 Resolve Shared Configuration Issues

- [ ] Create shared config library for `private.ts`
- [ ] Move `private.ts` to proper shared location
- [ ] Update setup-wizard to use shared config
- [ ] Update cms to use shared config
- [ ] Remove circular dependencies

### 3.2 Database Abstraction

- [ ] Create `db-interface` library (as per issue #283)
- [ ] Create pluggable database drivers
- [ ] Update setup-wizard to configure driver selection
- [ ] Update cms to use abstract database interface
- [ ] Ensure only selected driver is bundled

### 3.3 Shared Libraries

- [ ] Create/update `shared-utils` library
- [ ] Create/update `shared-theme` library
- [ ] Create `api-logic` library
- [ ] Create `graphql-logic` library
- [ ] Update all apps to use shared libraries

### 3.4 Global Settings Store

- [ ] Create shared global settings library
- [ ] Update setup-wizard to seed global settings
- [ ] Update cms to consume global settings
- [ ] Remove duplication between apps

---

## 📋 **PHASE 4: DOCUMENTATION MIGRATION**

### 4.1 Analyze Documentation

- [ ] List all documentation in `next` branch
- [ ] Identify outdated documentation in `nx2`
- [ ] Create documentation migration plan
- [ ] Identify documentation gaps

### 4.2 Migrate Core Documentation

- [ ] Migrate/update README.md
- [ ] Migrate/update CONTRIBUTING.md
- [ ] Migrate/update installation guides
- [ ] Migrate/update getting started guides
- [ ] Update architecture documentation

### 4.3 Migrate API Documentation

- [ ] Migrate API endpoint documentation
- [ ] Update GraphQL documentation
- [ ] Migrate database documentation
- [ ] Update authentication documentation

### 4.4 Migrate Developer Documentation

- [ ] Migrate widget development guides
- [ ] Update component documentation
- [ ] Migrate testing documentation
- [ ] Update deployment guides

### 4.5 Update Apps/Docs Structure

- [ ] Organize documentation in `apps/docs/`
- [ ] Update MDX files for monorepo structure
- [ ] Fix all internal links and references
- [ ] Update code examples for monorepo
- [ ] Create monorepo-specific guides

---

## 📋 **PHASE 5: TESTING & VALIDATION**

### 5.1 Build & Serve Tests

- [ ] Test `nx run cms:dev` works correctly
- [ ] Test `nx run setup-wizard:dev` works correctly
- [ ] Test `nx run docs:dev` works correctly
- [ ] Test all NX commands work properly

### 5.2 Feature Testing

- [ ] Test all migrated features work
- [ ] Test setup wizard flow end-to-end
- [ ] Test CMS functionality after setup
- [ ] Test database connections
- [ ] Test authentication flows
- [ ] Test 2FA functionality
- [ ] Test cloud storage features

### 5.3 Integration Testing

- [ ] Test setup-wizard → cms integration
- [ ] Test shared config works correctly
- [ ] Test global settings store
- [ ] Test database driver selection
- [ ] Test API endpoints
- [ ] Test GraphQL queries

### 5.4 Bundle Analysis

- [ ] Run production build: `nx build cms`
- [ ] Analyze bundle with vite-bundle-visualizer
- [ ] Verify only selected database driver is included
- [ ] Verify unused dependencies are excluded
- [ ] Document bundle size improvements

---

## 📋 **PHASE 6: CLEANUP & OPTIMIZATION**

### 6.1 Code Cleanup

- [ ] Remove duplicate code
- [ ] Remove unused dependencies
- [ ] Clean up commented code
- [ ] Update import paths
- [ ] Fix linting issues

### 6.2 Documentation Cleanup

- [ ] Remove outdated documentation
- [ ] Fix broken links
- [ ] Update all code examples
- [ ] Add missing documentation
- [ ] Create migration guide for contributors

### 6.3 Final Validation

- [ ] Run `nx affected:test`
- [ ] Run `nx affected:build`
- [ ] Run `nx affected:lint`
- [ ] Verify all acceptance criteria from issue #283
- [ ] Create final migration report

---

## 📋 **PHASE 7: CLIENT HANDOFF**

### 7.1 Documentation

- [ ] Create comprehensive migration summary
- [ ] Document all changes made
- [ ] Create upgrade guide for existing installations
- [ ] Document new features and improvements

### 7.2 Communication

- [ ] Prepare demo of migrated features
- [ ] Document known issues (if any)
- [ ] Create list of follow-up tasks
- [ ] Prepare handoff meeting notes

---

## 🎯 **ACCEPTANCE CRITERIA (from Issue #283)**

- [ ] ✅ Project structure is flat (no packages/ folder)
- [ ] ✅ `bun install` completes successfully from root
- [ ] ✅ Setup-wizard can be served and modifies `tsconfig.base.json`
- [ ] ✅ CMS app can be served and is fully functional after setup
- [ ] ✅ CMS hooks.server.ts and GraphQL are thin wrappers
- [ ] ✅ Both cms and setup-wizard render shared Skeleton/Tailwind theme
- [ ] ✅ **CRITICAL:** Production build only includes selected database driver
- [ ] ✅ `nx affected:test` and `nx affected:build` run successfully

---

## 📊 **PROGRESS TRACKING**

**Phase 1 (Analysis):** ✅ 100% Complete  
**Phase 2 (Code Migration):** 0% Complete  
**Phase 3 (Architecture):** 0% Complete  
**Phase 4 (Documentation):** 0% Complete  
**Phase 5 (Testing):** 0% Complete  
**Phase 6 (Cleanup):** 0% Complete  
**Phase 7 (Handoff):** 0% Complete

**Overall Progress:** 14% Complete (1/7 phases)

---

## 📝 **NOTES & DECISIONS**

### Key Decisions Made:

- Using NX monorepo structure from nx2 branch
- Migrating features from next branch
- Following issue #283 specifications for flat structure
- Implementing pluggable database drivers

### Blockers:

- None yet

### Questions for Client:

- None yet

---

## 🔗 **REFERENCES**

- **Issue #283:** Refactor SveltyCMS into an Optimized, Flat Nx Monorepo
- **Next Branch:** Latest commit: `921352fc` - "chore:smarter GlobalLoading, Roles in Database, cloudStorage, Prefresh, start 2fa"
- **NX2 Branch:** Latest commit: `0f0a8250` - "docs with mdx"
- **Client Message:** "Please have another look at the next branch... full rethinking needs to be archived"

---

**Last Updated:** November 7, 2025  
**Status:** Planning Phase
