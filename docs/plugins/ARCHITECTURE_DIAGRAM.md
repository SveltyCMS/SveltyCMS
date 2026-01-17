# Plugin System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          SveltyCMS Plugin System                            │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ 1. SERVER STARTUP                                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  hooks.server.ts → db.ts → initializePlugins()                             │
│                                    ↓                                        │
│                          ┌─────────────────────┐                           │
│                          │  Plugin Registry    │                           │
│                          │  ─────────────────  │                           │
│                          │  • pageSpeedPlugin  │                           │
│                          │  • (future plugins) │                           │
│                          └─────────────────────┘                           │
│                                    ↓                                        │
│                          ┌─────────────────────┐                           │
│                          │ Migration Runner    │                           │
│                          │  ─────────────────  │                           │
│                          │  Check DB for       │                           │
│                          │  applied migrations │                           │
│                          └─────────────────────┘                           │
│                                    ↓                                        │
│                          ┌─────────────────────┐                           │
│                          │ Execute Pending     │                           │
│                          │  ─────────────────  │                           │
│                          │  001_create_table   │                           │
│                          │  002_add_index      │                           │
│                          └─────────────────────┘                           │
│                                    ↓                                        │
│                          ┌─────────────────────┐                           │
│                          │ plugin_migrations   │ ← Track applied           │
│                          │ plugin_pagespeed_*  │ ← Plugin tables           │
│                          └─────────────────────┘                           │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ 2. SSR REQUEST (Entry List)                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  User visits: /en/blog                                                      │
│       ↓                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐          │
│  │ +page.server.ts                                              │          │
│  │                                                               │          │
│  │  1. Load entries from collection_blog                        │          │
│  │     WHERE tenantId = 'default'                               │          │
│  │                                                               │          │
│  │  2. Get plugin SSR hooks                                     │          │
│  │     pluginRegistry.getSSRHooks('blog')                       │          │
│  │                                                               │          │
│  │  3. Build plugin context                                     │          │
│  │     {                                                         │          │
│  │       user: currentUser,                                     │          │
│  │       tenantId: 'default',                                   │          │
│  │       language: 'en',        ← From route param              │          │
│  │       dbAdapter: dbAdapter,                                  │          │
│  │       collectionSchema: blogSchema                           │          │
│  │     }                                                         │          │
│  │                                                               │          │
│  │  4. Execute plugin hooks                                     │          │
│  │     await Promise.all(hooks.map(h => h(context, entries)))  │          │
│  │                                                               │          │
│  │  5. Merge plugin data                                        │          │
│  │     pluginData = {                                           │          │
│  │       'entry1': { performanceScore: 92, ... },               │          │
│  │       'entry2': { performanceScore: 78, ... }                │          │
│  │     }                                                         │          │
│  │                                                               │          │
│  │  6. Return to client                                         │          │
│  │     return {                                                 │          │
│  │       entries: [...],                                        │          │
│  │       pluginData: {...}  ← SSR payload                       │          │
│  │     }                                                         │          │
│  └──────────────────────────────────────────────────────────────┘          │
│       ↓                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐          │
│  │ EntryList.svelte                                             │          │
│  │                                                               │          │
│  │  Props:                                                       │          │
│  │    entries: [...]                                            │          │
│  │    pluginData: { entry1: {...}, entry2: {...} }             │          │
│  │                                                               │          │
│  │  No client-side fetching needed! ✅                          │          │
│  └──────────────────────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ 3. PLUGIN API REQUEST (Refresh PageSpeed)                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  User clicks "Refresh PageSpeed" button                                    │
│       ↓                                                                     │
│  POST /api/plugins/pagespeed                                               │
│  {                                                                          │
│    entryId: 'entry1',                                                       │
│    collectionId: 'blog',                                                    │
│    language: 'en',          ← Language-aware                               │
│    device: 'mobile'                                                         │
│  }                                                                          │
│       ↓                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐          │
│  │ /api/plugins/pagespeed/+server.ts                            │          │
│  │                                                               │          │
│  │  1. Authentication check                                     │          │
│  │     if (!user) throw 401                                     │          │
│  │                                                               │          │
│  │  2. Load entry from DB                                       │          │
│  │     entry = await db.findOne('collection_blog', {           │          │
│  │       _id: entryId,                                          │          │
│  │       tenantId: tenantId  ← Tenant isolation                │          │
│  │     })                                                        │          │
│  │                                                               │          │
│  │  3. Derive URL (SSRF protection)                            │          │
│  │     baseUrl = 'https://example.com'                          │          │
│  │     baseLocale = 'en'                                        │          │
│  │     language = 'en'                                          │          │
│  │                                                               │          │
│  │     url = deriveEntryUrl(...)                                │          │
│  │     // Result: https://example.com/blog/my-post              │          │
│  │                                                               │          │
│  │     validateUrl(url, baseUrl) ✅                             │          │
│  │                                                               │          │
│  │  4. Fetch from Google API                                   │          │
│  │     apiKey = getPrivateSettingSync('GOOGLE_PAGESPEED_...')  │          │
│  │     metrics = await fetch(googleAPI)                         │          │
│  │                                                               │          │
│  │  5. Store in plugin table                                   │          │
│  │     await db.insert('plugin_pagespeed_results', {           │          │
│  │       entryId,                                               │          │
│  │       collectionId,                                          │          │
│  │       tenantId,      ← Multi-tenant                         │          │
│  │       language,      ← Language-aware                       │          │
│  │       device,                                                │          │
│  │       ...metrics                                             │          │
│  │     })                                                        │          │
│  │                                                               │          │
│  │  6. Return metrics                                           │          │
│  │     return json({ success: true, data: metrics })            │          │
│  └──────────────────────────────────────────────────────────────┘          │
│       ↓                                                                     │
│  Client invalidates SSR (invalidateAll)                                    │
│       ↓                                                                     │
│  Page reloads with fresh plugin data                                       │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ 4. DATA FLOW                                                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Database Tables:                                                           │
│  ┌──────────────────────┐  ┌──────────────────────────────────────┐        │
│  │ plugin_migrations    │  │ plugin_pagespeed_results             │        │
│  ├──────────────────────┤  ├──────────────────────────────────────┤        │
│  │ pluginId             │  │ entryId                              │        │
│  │ migrationId          │  │ collectionId                         │        │
│  │ version              │  │ tenantId        ← Multi-tenant       │        │
│  │ appliedAt            │  │ language        ← Language-aware     │        │
│  │ tenantId             │  │ device                               │        │
│  └──────────────────────┘  │ url                                  │        │
│                             │ performanceScore                     │        │
│                             │ fcp, lcp, cls, tti, tbt, si         │        │
│                             │ fetchedAt                            │        │
│                             └──────────────────────────────────────┘        │
│                                                                             │
│  Cache Keys (Language-Aware):                                              │
│  • pagespeed:default:entry1:en:mobile    ← Base locale                     │
│  • pagespeed:default:entry1:de:mobile    ← Translated                      │
│  • pagespeed:default:entry1:en:desktop   ← Different device                │
│                                                                             │
│  URL Patterns (Language-Aware):                                            │
│  • Base Locale (en):  https://example.com/about-us                         │
│  • Translated (de):   https://example.com/de/uber-uns                      │
│  • Translated (fr):   https://example.com/fr/a-propos                      │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ 5. SECURITY LAYERS                                                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────┐            │
│  │ Layer 1: hooks.server.ts                                    │            │
│  │  • Authentication                                            │            │
│  │  • Rate limiting                                             │            │
│  │  • Firewall                                                  │            │
│  └─────────────────────────────────────────────────────────────┘            │
│       ↓                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐            │
│  │ Layer 2: Plugin Endpoint                                    │            │
│  │  • Tenant isolation check                                   │            │
│  │  • Permission validation                                    │            │
│  │  • Input validation                                          │            │
│  └─────────────────────────────────────────────────────────────┘            │
│       ↓                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐            │
│  │ Layer 3: Plugin Logic                                       │            │
│  │  • SSRF protection (URL validation)                         │            │
│  │  • Derived URLs only (no arbitrary URLs)                    │            │
│  │  • Private settings for secrets                             │            │
│  └─────────────────────────────────────────────────────────────┘            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│ 6. ADDING A NEW PLUGIN                                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. Create plugin directory:                                                │
│     src/plugins/my-plugin/                                                  │
│                                                                             │
│  2. Define plugin:                                                          │
│     export const myPlugin: Plugin = {                                       │
│       metadata: { id, name, version, ... },                                 │
│       migrations: [...],                                                    │
│       ssrHook: async (context, entries) => {...},                           │
│       ui: { columns: [...], actions: [...] }                                │
│     }                                                                        │
│                                                                             │
│  3. Create migrations:                                                      │
│     001_create_my_table.ts                                                  │
│     • Create plugin_my_data table                                           │
│     • Include tenantId, language fields                                     │
│                                                                             │
│  4. Implement SSR hook:                                                     │
│     • Query plugin_my_data for entries                                      │
│     • Filter by tenantId, language                                          │
│     • Return PluginEntryData[]                                              │
│                                                                             │
│  5. Create API endpoint:                                                    │
│     src/routes/api/plugins/my-plugin/+server.ts                             │
│     • Validate authentication                                               │
│     • Check tenant isolation                                                │
│     • Process and store data                                                │
│                                                                             │
│  6. Register plugin:                                                        │
│     src/plugins/index.ts                                                    │
│     export const availablePlugins = [                                       │
│       pageSpeedPlugin,                                                      │
│       myPlugin  // Add here                                                 │
│     ]                                                                        │
│                                                                             │
│  7. Restart server:                                                         │
│     Migrations run automatically ✅                                         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Key Takeaways

1. **Automatic Initialization**: Plugins register and migrate on server startup
2. **SSR-First**: No client-side data fetching - all data via SSR
3. **Language-Aware**: URL derivation, cache keys, and queries respect language
4. **Multi-Tenant**: All plugin tables include tenantId for isolation
5. **Secure**: Multiple security layers (SSRF, authz, private settings)
6. **Extensible**: Add plugins without modifying core code
