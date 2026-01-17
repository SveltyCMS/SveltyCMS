# Plugin System Implementation Summary

## Overview

A complete language-aware plugin system has been implemented for SveltyCMS. The system is production-ready and provides a secure, performant foundation for extending CMS functionality.

## What Was Implemented

### 1. Core Plugin Framework

**Files Created:**
- `src/plugins/types.ts` - Complete type definitions for plugins, migrations, hooks, and UI
- `src/plugins/registry.ts` - Singleton registry with plugin lifecycle management
- `src/plugins/index.ts` - Plugin initialization and exports

**Features:**
- ✅ Plugin registration and metadata management
- ✅ Migration tracking via `plugin_migrations` table
- ✅ SSR hook coordination for data enrichment
- ✅ DB-agnostic implementation using existing adapters
- ✅ Automatic initialization during server startup

### 2. Migration Framework

**Implementation:**
- Migration runner executes pending migrations in version order
- Tracks applied migrations in dedicated `plugin_migrations` collection
- Supports rollback hooks (optional)
- Handles multi-tenant isolation
- Integrated into `src/databases/db.ts` initialization sequence

**Safety Features:**
- Idempotent migrations (safe to run multiple times)
- Transactional execution where supported
- Detailed logging of migration progress
- Graceful error handling (doesn't crash server)

### 3. PageSpeed Insights Plugin

**Files Created:**
- `src/plugins/pagespeed/index.ts` - Plugin definition with SSR hook
- `src/plugins/pagespeed/types.ts` - PageSpeed-specific types
- `src/plugins/pagespeed/migrations.ts` - Table creation migration
- `src/plugins/pagespeed/service.ts` - Google API integration
- `src/plugins/pagespeed/urlUtils.ts` - Language-aware URL derivation
- `src/routes/api/plugins/pagespeed/+server.ts` - Secure API endpoint

**Features:**
- ✅ Fetches Core Web Vitals (LCP, FCP, CLS, TTI, TBT, SI, Performance Score)
- ✅ Language-aware URL derivation (base locale vs translated)
- ✅ SSRF protection via URL validation
- ✅ Result caching (24-hour TTL by default)
- ✅ Tenant isolation enforcement
- ✅ Secure API key storage in private settings

**URL Pattern Rules:**
```
Base Locale (en): https://example.com/about-us
Translated (de):  https://example.com/de/uber-uns
```

### 4. SSR Integration

**Modified Files:**
- `src/routes/(app)/[language]/[...collection]/+page.server.ts`
  - Added plugin SSR hook execution
  - Passes plugin context (user, tenant, language, dbAdapter, schema)
  - Collects plugin data indexed by entryId
  - Includes pluginData in SSR response

**Data Flow:**
1. Server receives SSR request for collection list
2. Plugin registry returns enabled hooks for collection
3. Hooks execute with language-aware context
4. Plugin data merged and returned with entries
5. EntryList receives pluginData prop

### 5. UI Components

**Files Created:**
- `src/components/plugins/PageSpeedScore.svelte` - Performance score display
  - Color-coded scores (green/yellow/red)
  - Compact and full view modes
  - Google PageSpeed Insights thresholds

**Modified Files:**
- `src/content/types.ts` - Added `pluginData` to EntryListProps

### 6. Configuration

**Modified Files:**
- `src/databases/schemas.ts` - Added `GOOGLE_PAGESPEED_API_KEY` to private settings

**Configuration Required:**
- `GOOGLE_PAGESPEED_API_KEY` - Google PageSpeed Insights API key (private)
- `SITE_URL` - Base URL for the website (public, already exists)
- `BASE_LOCALE` - Source language locale (public, already exists)

### 7. Testing & Documentation

**Files Created:**
- `tests/bun/plugins/urlUtils.test.ts` - Unit tests for URL derivation
  - Tests language prefix rules
  - Tests cache key generation
  - Tests SSRF validation
  - 17 comprehensive test cases

- `docs/plugins/README.md` - Plugin system overview
  - Architecture description
  - Built-in plugins documentation
  - Security guidelines
  - Troubleshooting guide

- `docs/plugins/developer-guide.md` - Developer guide
  - Step-by-step plugin creation
  - Migration best practices
  - API endpoint patterns
  - Complete examples

## Architecture Decisions

### 1. Language-Aware by Design

All plugin operations include language context:
- Cache keys include language parameter
- Database queries filter by language
- URL derivation follows CMS language prefix rules
- SSR hooks receive current language from route

### 2. Multi-Tenant by Default

All plugin tables must include `tenantId`:
- Enforced via migration patterns
- Defaults to 'default' when MULTI_TENANT disabled
- Query filters always include tenantId
- Authorization checks validate tenant isolation

### 3. Migration-Based Schema Management

Plugins don't modify core tables:
- Each plugin has dedicated tables
- Migrations create/modify plugin tables
- Version tracking prevents duplicate execution
- Clean plugin removal possible

### 4. SSR-First, No Client Fetching

Plugin data flows through SSR:
- No client-side API calls in EntryList
- Data pre-loaded during server rendering
- Reduces client JavaScript bundle
- Improves initial page load performance

### 5. Nx-Monorepo Friendly

Clean code boundaries enable future migration:
```
Future Structure:
apps/cms/
  src/routes/...
libs/plugins/
  pagespeed/
  seo/
  analytics/
```

## Security Implementation

### SSRF Protection

```typescript
// Derive URL from entry data (never accept arbitrary URLs)
const url = deriveEntryUrl(baseUrl, language, baseLocale, entry, schema);

// Validate URL matches base domain
if (!validateUrl(url, baseUrl)) {
  throw error(400, 'Invalid URL');
}
```

### Authorization

```typescript
// Check authentication
if (!user) throw error(401, 'Unauthorized');

// Validate tenant isolation
if (entry.tenantId !== tenantId) {
  throw error(403, 'Access denied: tenant mismatch');
}
```

### Private Settings

```typescript
// API keys stored server-only
const apiKey = getPrivateSettingSync('GOOGLE_PAGESPEED_API_KEY');
```

## Performance Optimizations

1. **Batch Queries**: Plugin hooks query all entries in single database call
2. **Caching**: Results cached in database with configurable TTL
3. **Lazy Loading**: Plugins only fetch when enabled for collection
4. **Parallel Execution**: Multiple plugin hooks run concurrently
5. **SSR Efficiency**: No client-side data fetching overhead

## API Usage

### Fetch PageSpeed Insights

```bash
POST /api/plugins/pagespeed
Content-Type: application/json

{
  "entryId": "entry123",
  "collectionId": "collection456",
  "language": "en",
  "device": "mobile",
  "forceRefresh": false
}
```

**Response:**
```json
{
  "success": true,
  "cached": false,
  "data": {
    "performanceScore": 92,
    "fcp": 1200,
    "lcp": 2100,
    "cls": 0.05,
    "tti": 3400,
    "tbt": 150,
    "si": 2500,
    "url": "https://example.com/about-us",
    "fetchedAt": "2026-01-17T07:00:00.000Z"
  }
}
```

## Database Schema

### plugin_migrations

```typescript
{
  _id: string;
  pluginId: "pagespeed";
  migrationId: "001_create_pagespeed_results_table";
  version: 1;
  appliedAt: Date;
  tenantId: "default";
}
```

### plugin_pagespeed_results

```typescript
{
  _id: string;
  entryId: "entry123";
  collectionId: "collection456";
  tenantId: "default";
  language: "en";
  device: "mobile" | "desktop";
  url: "https://example.com/page";
  performanceScore: 92;
  fcp: 1200;        // First Contentful Paint (ms)
  lcp: 2100;        // Largest Contentful Paint (ms)
  cls: 0.05;        // Cumulative Layout Shift
  tti: 3400;        // Time to Interactive (ms)
  tbt: 150;         // Total Blocking Time (ms)
  si: 2500;         // Speed Index (ms)
  fetchedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}
```

## Testing the Plugin System

### 1. Server Startup

```bash
npm run dev

# Check logs for:
# 🔌 Initializing plugin system...
# ✅ Plugin registered: pagespeed v1.0.0
# 📦 Running migration: pagespeed/001_create_pagespeed_results_table
# ✅ plugin_pagespeed_results table created
# ✅ Plugin system initialized
```

### 2. Verify Database Tables

```javascript
// MongoDB
db.plugin_migrations.find()
db.plugin_pagespeed_results.find()

// MariaDB
SELECT * FROM plugin_migrations;
SELECT * FROM plugin_pagespeed_results;
```

### 3. Test API Endpoint

```bash
# Requires authentication cookie
curl -X POST http://localhost:5173/api/plugins/pagespeed \
  -H "Content-Type: application/json" \
  -d '{
    "entryId": "YOUR_ENTRY_ID",
    "collectionId": "YOUR_COLLECTION_ID",
    "language": "en",
    "device": "mobile"
  }'
```

### 4. Test SSR Integration

Visit collection list page and check:
1. Page loads without errors
2. Check browser network tab - no client-side plugin API calls
3. View page source - pluginData should be in SSR payload

## Known Limitations

### 1. Full EntryList UI Integration

The plugin data is passed to EntryList but not yet displayed in table columns. This would require:
- Modifying EntryList table rendering to add plugin columns
- Adding refresh action buttons per entry
- Implementing invalidateAll() on refresh

**Reason Not Implemented**: EntryList has complex table logic (drag-drop, filters, sorting, column visibility). Adding plugin columns requires careful integration to avoid breaking existing functionality.

**Workaround**: Plugin data is available in component props and can be accessed via custom components.

### 2. Per-Collection Plugin Settings UI

Plugins can be enabled/disabled per collection via `enabledCollections` array, but there's no admin UI to configure this.

**Workaround**: Edit plugin definition in `src/plugins/<plugin>/index.ts`.

### 3. Localization

Plugin labels use static strings instead of Paraglide message keys.

**Workaround**: Add i18n support as needed per plugin.

## Future Enhancements

1. **Plugin Marketplace**: Registry of community plugins
2. **Plugin Settings UI**: Admin panel for configuration
3. **Plugin Dependencies**: Declare dependencies between plugins
4. **Plugin Webhooks**: Trigger external systems on CMS events
5. **Plugin Widgets**: Custom field types via plugins
6. **Plugin Analytics**: Usage tracking and performance metrics

## Migration Guide

When moving to Nx monorepo:

1. Move core plugin system to `libs/plugin-core/`
2. Move individual plugins to `libs/plugins/<name>/`
3. Update import paths to use workspace aliases
4. No code changes required (already architected for this)

## Conclusion

The plugin system provides a robust, secure foundation for extending SveltyCMS. It follows established patterns, maintains performance, and can scale to support many plugins without architectural changes.

Key achievements:
- ✅ Zero breaking changes to existing code
- ✅ Fully type-safe implementation
- ✅ Production-ready security practices
- ✅ Comprehensive documentation
- ✅ Example plugin demonstrates all features
- ✅ Extensible architecture for future plugins

The system is ready for use and can be extended with additional plugins following the documented patterns.
