# MariaDB Adapter Implementation Plan

## Overview
Complete Drizzle ORM-based MariaDB adapter for SveltyCMS

## Implementation Files Needed

### Core (Required for Setup & Init)
1. `mariadbAdapter.ts` - Main adapter class (~800 lines)
   - Connection management with mysql2
   - Drizzle DB initialization
   - IDBAdapter interface implementation
   - Method delegation to modules

2. `methods/authMethods.ts` (~600 lines)
   - User CRUD
   - Session management
   - Token management
   - Role management

3. `methods/systemMethods.ts` (~400 lines)
   - System preferences
   - Themes
   - Widgets
   - Virtual folders
   - Website tokens

4. `methods/contentMethods.ts` (~500 lines)
   - Content nodes
   - Drafts
   - Revisions

5. `methods/mediaMethods.ts` (~300 lines)
   - Media files
   - Media folders

6. `methods/crudMethods.ts` (~300 lines)
   - Generic CRUD operations
   - Batch operations

7. `seed.ts` (~200 lines)
   - Initial data seeding
   - Admin user creation
   - Default roles/theme/folder

### Supporting Files
8. `connection.ts` - Connection pool management
9. `migrations.ts` - Migration runner
10. `queryBuilder.ts` - Query builder (simplified)

## Total Estimated Lines: ~3100 lines

## Implementation Order
1. Connection & utils (foundation)
2. Auth methods (critical for setup)
3. System methods (themes, preferences, folders)
4. Content & media methods
5. CRUD & batch operations
6. Seeding
7. Integration with db.ts
8. Setup wizard integration

## Testing Strategy
- Use setup wizard to test connection
- Initialize CMS to test all methods
- Verify date conversions (ISODateString)
- Verify multi-tenant support
