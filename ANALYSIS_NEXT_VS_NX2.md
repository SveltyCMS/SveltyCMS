# Branch Comparison: Next vs NX2

**Date:** November 7, 2025

## Structure Differences

### Next Branch (Hybrid)

```
SveltyCMS/
├── src/              # Monolithic structure (main code)
├── apps/             # Partial NX structure
│   ├── cms/
│   ├── docs/
│   └── shared-theme/
├── config/
└── [root files]
```

### NX2 Branch (Full Monorepo)

```
SveltyCMS/
├── apps/
│   ├── cms/
│   ├── setup-wizard/
│   ├── docs/
│   ├── shared-utils/
│   ├── shared-theme/
│   ├── scripts/
│   └── tests/
├── config/
└── [root files]
```

**Key Difference:** Next has both old (`src/`) and new (`apps/`) structure. NX2 is fully migrated to monorepo.

## New Features in Next Branch

Based on recent commits (921352fc → 3eaa010c):

1. **Roles in Database** - Roles stored in DB instead of just config file
2. **2FA Implementation** - Two-factor authentication (in progress)
3. **Cloud Storage** - S3/Azure/GCS integration started
4. **Split Logger** - Separate server (`logger.server.ts`) and client (`logger.ts`) logging
5. **Navigation Improvements** - Enhanced navigation system
6. **Widget Enhancements** - Better widget functionality
7. **Translation Status** - i18n status tracking
8. **Quantum-Resistant Crypto** - Future-proof security
9. **SSR Improvements** - Better server-side rendering for entries
10. **Website Tokens** - API token management
11. **MediaGallery Virtual Folders** - Virtual folder system for media
12. **Prefresh** - Performance optimizations
13. **Firewall Hook** - New security hook

## New/Modified Files

### Components

- `MediaFolders.svelte` - NEW
- `GlobalLoading.svelte` - IMPROVED

### Hooks

- `handleFirewall.ts` - NEW

### Utils

- `logger.server.ts` - NEW (server-side only)
- `logger.ts` - MODIFIED (client-side only)
- `navigationUtils.ts` - NEW
- `server/` directory - NEW

### Database

- Roles schema changes
- Migration scripts for roles

## Migration Priorities

### High Priority

- Roles in Database
- GlobalLoading improvements
- Split server/client logger
- Navigation improvements
- Widget improvements
- Translation status
- SSR improvements

### Medium Priority

- 2FA implementation
- Cloud storage
- Website tokens
- MediaGallery virtual folders
- Quantum-resistant crypto

### Low Priority

- Prefresh optimizations
- Firewall hooks

## Critical Issues

### 1. Private.ts Sharing

Both setup-wizard and cms need `config/private.ts` - creates circular dependency.

**Solution:** Create `apps/shared-config/` library

### 2. Database Seeding

Setup-wizard seeds DB, CMS needs seeded DB - tight coupling.

**Solution:** Proper initialization flow with shared config

### 3. Global Settings Store

Both apps need global settings - duplicated logic.

**Solution:** Shared store library

## Migration Strategy

1. **Preserve NX2 Structure** - Keep clean monorepo
2. **Copy Improvements** - Migrate from `next/src/` to `apps/cms/src/`
3. **Fix Architecture** - Resolve coupling issues
4. **Update Documentation** - Reflect changes

## File Mapping

```
next/src/components/     → apps/cms/src/components/
next/src/stores/         → apps/cms/src/stores/
next/src/utils/          → apps/cms/src/utils/
next/src/hooks/          → apps/cms/src/hooks/
next/src/routes/         → apps/cms/src/routes/
next/src/widgets/        → apps/cms/src/widgets/
next/src/routes/setup/   → apps/setup-wizard/src/routes/
```

## Notes

- Next branch is in transition (hybrid structure)
- Some code exists in both `src/` and `apps/`
- Must carefully merge improvements
- Maintain NX monorepo structure from nx2
