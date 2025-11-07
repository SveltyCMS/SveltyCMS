# Migration Strategy: Next → NX2

**Date:** November 7, 2025

## Goals

1. Preserve NX2 monorepo structure
2. Integrate next branch improvements
3. Fix architecture issues (private.ts sharing, pluggable drivers)
4. Maintain functionality
5. Update documentation

## Conflict Resolution

### File Structure

**Next:** `src/components/`, `src/routes/`, etc.  
**NX2:** `apps/cms/src/components/`, `apps/cms/src/routes/`, etc.

**Resolution:** Copy from `next/src/` → `apps/cms/src/`

### Setup Wizard

**Next:** Integrated in `src/routes/setup/`  
**NX2:** Separate app in `apps/setup-wizard/`

**Resolution:** Keep separate, migrate improvements to setup-wizard app

### Shared Code

**Next:** Some in `apps/`, most in `src/`  
**NX2:** Proper libraries in `apps/shared-utils/`

**Resolution:** Use NX2 libraries, move new shared code appropriately

## Migration Phases

### Phase 2: Core Code Migration (15-20 hours)

**2.1 Components** (2-3 hours)

- GlobalLoading.svelte (improved)
- MediaFolders.svelte (new)
- Other improved components

**2.2 Stores** (2-3 hours)

- globalSettings.svelte.ts (roles in DB)
- Other improved stores

**2.3 Utilities** (2-3 hours)

- logger.server.ts (new - server-side)
- logger.ts (modified - client-side)
- navigationUtils.ts (new)
- server/ directory (new)

**2.4 Hooks** (1-2 hours)

- handleFirewall.ts (new)
- Other improved hooks

**2.5 Routes** (3-4 hours)

- API improvements
- New endpoints
- Enhanced pages

**2.6 Widgets** (2-3 hours)

- Widget improvements
- New features

### Phase 3: New Features (18-27 hours)

**3.1 Roles in Database** (3-4 hours)

- Migrate database schemas
- Update role management
- Create migration scripts
- Test persistence

**3.2 Split Logger** (1-2 hours)

- Complete server/client separation
- Update all imports
- Test logging

**3.3 2FA** (4-6 hours)

- Migrate components
- Copy API endpoints
- Update auth flow
- Test functionality

**3.4 Cloud Storage** (4-6 hours)

- Migrate storage logic
- Copy adapters
- Update media service
- Test uploads

**3.5 Website Tokens** (2-3 hours)

- Migrate token management
- Copy API
- Update auth
- Test system

**3.6 MediaGallery Virtual Folders** (2-3 hours)

- Migrate folder logic
- Copy components
- Update gallery
- Test system

**3.7 Quantum-Resistant Crypto** (2-3 hours)

- Migrate crypto utilities
- Update encryption
- Test security

### Phase 4: Architecture Fixes (19-27 hours)

**4.1 Shared Config Library** (3-4 hours)

Create `apps/shared-config/`:

```
apps/shared-config/
├── src/
│   ├── private.ts
│   ├── public.ts
│   ├── loader.ts
│   └── types.ts
├── package.json
└── project.json
```

Tasks:

- Create library
- Move config logic
- Update setup-wizard
- Update cms
- Remove circular dependency

**4.2 Pluggable Database Drivers** (6-8 hours)

Create:

- `apps/db-interface/` - Interface
- `apps/db-driver-mongo/` - MongoDB
- `apps/db-driver-drizzle/` - Drizzle

Tasks:

- Create interface library
- Create driver libraries
- Update setup-wizard for selection
- Update cms to use interface
- Test switching
- Verify bundle optimization

**4.3 Extract API Logic** (4-6 hours)

Create `apps/api-logic/`:

- Move API logic from hooks
- Create thin wrapper in cms
- Test functionality

**4.4 Extract GraphQL Logic** (4-6 hours)

Create `apps/graphql-logic/`:

- Move GraphQL from routes
- Create thin wrapper
- Test queries

**4.5 Shared Tailwind Config** (2-3 hours)

Enhance `apps/shared-theme/`:

- Create tailwind.preset.js
- Move theme config
- Update cms and setup-wizard
- Test consistency

### Phase 5: Documentation (12-17 hours)

**5.1 Core Docs** (3-4 hours)

- Update README, CONTRIBUTING
- Update installation guides
- Update getting started

**5.2 API Docs** (4-6 hours)

- Migrate from next
- Update for monorepo
- Add new endpoints
- Fix links

**5.3 Architecture Docs** (2-3 hours)

- Update architecture
- Document monorepo
- Add migration guides
- Document features

**5.4 Developer Docs** (3-4 hours)

- Update widget guides
- Update component docs
- Update testing docs
- Add NX guides

### Phase 6: Testing (13-19 hours)

**6.1 Unit Testing** (4-6 hours)

- Test migrated components
- Test utilities
- Test stores
- Fix failures

**6.2 Integration Testing** (4-6 hours)

- Test setup-wizard flow
- Test cms functionality
- Test API endpoints
- Test GraphQL
- Test auth and 2FA
- Test media

**6.3 E2E Testing** (3-4 hours)

- Run Playwright tests
- Test user flows
- Test setup → cms
- Fix issues

**6.4 Bundle Analysis** (2-3 hours)

- Build production
- Run analyzer
- Verify driver selection
- Document size

### Phase 7: Cleanup (5-8 hours)

**7.1 Code** (2-3 hours)

- Remove duplicates
- Remove unused imports
- Clean comments
- Fix linting

**7.2 Dependencies** (1-2 hours)

- Remove unused
- Update outdated
- Verify tree
- Security audit

**7.3 Documentation** (2-3 hours)

- Remove outdated
- Fix links
- Update examples
- Add missing

## Timeline

| Phase   | Hours | Priority |
| ------- | ----- | -------- |
| Phase 2 | 15-20 | HIGH     |
| Phase 3 | 18-27 | MEDIUM   |
| Phase 4 | 19-27 | HIGH     |
| Phase 5 | 12-17 | HIGH     |
| Phase 6 | 13-19 | HIGH     |
| Phase 7 | 5-8   | MEDIUM   |

**Total:** 82-118 hours (10-15 working days)

## Risk Mitigation

**Breaking Changes**

- Test after each step
- Small, focused commits
- Backup branches
- Document changes

**Import Path Issues**

- Update systematically
- Use find/replace carefully
- Test imports
- Use TypeScript validation

**Dependency Conflicts**

- Check before migration
- Update carefully
- Test builds
- Use lock files

**Lost Functionality**

- Test all features
- Comprehensive test suite
- Document behavior
- Get client approval

## Success Criteria

### Must Have

- All next improvements migrated
- NX2 structure preserved
- All tests passing
- Production build working
- Documentation updated
- Client approval

### Should Have

- Pluggable database drivers
- Bundle size optimized
- Architecture issues resolved
- All new features working

## Decision Log

**Keep NX2 Structure** (Nov 7, 2025)  
Reason: Clean monorepo, better than next  
Impact: All code adapts to monorepo

**Migrate in Phases** (Nov 7, 2025)  
Reason: Reduce risk, easier testing  
Impact: Longer timeline, safer

**Fix Architecture Issues** (Nov 7, 2025)  
Reason: Client requirement, issue #283  
Impact: Additional work, necessary
