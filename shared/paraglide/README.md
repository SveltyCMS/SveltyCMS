# Paraglide (i18n) Library

Global internationalization (i18n) configuration using Paraglide JS for SveltyCMS.

## Purpose

Centralized i18n that provides:
- Global language definitions
- Workspace-specific message files
- Type-safe translations
- Compile-time optimization
- Zero-runtime overhead

## Structure

```
shared/paraglide/
├── src/
│   ├── index.ts                  # Main exports
│   ├── runtime.ts                # Runtime functions
│   └── messages/                 # Generated message functions
├── messages/                      # Source message files
│   ├── en.json                   # English (base language)
│   ├── de.json                   # German
│   ├── fr.json                   # French
│   └── es.json                   # Spanish
├── project.inlang/
│   └── settings.json             # Paraglide configuration
├── project.json                  # Nx project configuration
├── tsconfig.json
└── README.md
```

Each workspace has its own messages folder:
```
apps/setup/messages/           # Setup-specific translations
apps/cms/messages/             # CMS-specific translations
shared/paraglide/messages/     # Global translations
```

## Configuration

### project.inlang/settings.json

```json
{
  "$schema": "https://inlang.com/schema/project-settings",
  "sourceLanguageTag": "en",
  "languageTags": ["en", "de", "fr", "es"],
  "modules": [
    "https://cdn.jsdelivr.net/npm/@inlang/message-lint-rule-empty-pattern@latest/dist/index.js",
    "https://cdn.jsdelivr.net/npm/@inlang/message-lint-rule-missing-translation@latest/dist/index.js",
    "https://cdn.jsdelivr.net/npm/@inlang/plugin-message-format@2/dist/index.js",
    "https://cdn.jsdelivr.net/npm/@inlang/plugin-m-function-matcher@0/dist/index.js"
  ],
  "plugin.inlang.messageFormat": {
    "pathPattern": "./messages/{languageTag}.json"
  }
}
```

## Message Files

### Global Messages (shared/paraglide/messages/)

```json
// messages/en.json
{
  "common": {
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "edit": "Edit",
    "close": "Close",
    "search": "Search",
    "loading": "Loading..."
  },
  "errors": {
    "generic": "An error occurred",
    "network": "Network error",
    "unauthorized": "Unauthorized access",
    "notFound": "Not found"
  },
  "validation": {
    "required": "This field is required",
    "email": "Invalid email address",
    "minLength": "Minimum {min} characters required",
    "maxLength": "Maximum {max} characters allowed"
  }
}
```

### Workspace-Specific Messages

```json
// apps/setup/messages/en.json
{
  "setup": {
    "welcome": "Welcome to SveltyCMS Setup",
    "chooseDatabase": "Choose your database",
    "mongodb": "MongoDB",
    "mariadb": "MariaDB",
    "postgresql": "PostgreSQL",
    "testConnection": "Test Connection",
    "connectionSuccess": "Connection successful!",
    "connectionFailed": "Connection failed: {error}"
  }
}
```

```json
// apps/cms/messages/en.json
{
  "cms": {
    "dashboard": "Dashboard",
    "collections": "Collections",
    "media": "Media Library",
    "users": "Users",
    "settings": "Settings",
    "newCollection": "New Collection",
    "editCollection": "Edit Collection",
    "deleteConfirm": "Are you sure you want to delete {name}?"
  }
}
```

## Compilation

Paraglide compiles messages at build time:

```bash
# Compile global messages
nx run paraglide:compile

# Compile workspace messages
cd apps/setup && paraglide-js compile --project ./project.inlang --outdir ./src/paraglide
cd apps/cms && paraglide-js compile --project ./project.inlang --outdir ./src/paraglide
```

This generates type-safe message functions:

```typescript
// Generated: shared/paraglide/src/messages/en.ts
export const m = {
  common_save: () => "Save",
  common_cancel: () => "Cancel",
  errors_generic: () => "An error occurred",
  validation_required: () => "This field is required",
  validation_minLength: (params: { min: number }) => 
    `Minimum ${params.min} characters required`
};
```

## Usage

### Basic Usage

```svelte
<script>
  import { m } from '@shared/paraglide';
</script>

<button>{m.common_save()}</button>
<button>{m.common_cancel()}</button>
```

### With Parameters

```svelte
<script>
  import { m } from '@shared/paraglide';
  
  const minLength = 8;
</script>

<p>{m.validation_minLength({ min: minLength })}</p>
<!-- Output: "Minimum 8 characters required" -->
```

### Language Switching

```typescript
import { setLanguageTag, languageTag } from '@shared/paraglide/runtime';

// Get current language
const current = languageTag(); // 'en'

// Change language
setLanguageTag('de');

// Messages automatically update
m.common_save(); // "Speichern" (in German)
```

### In SvelteKit

```typescript
// hooks.server.ts
import { setLanguageTag } from '@shared/paraglide/runtime';

export const handle = async ({ event, resolve }) => {
  const lang = event.cookies.get('language') || 'en';
  setLanguageTag(lang);
  
  return resolve(event);
};
```

### Reactive Language

```svelte
<script>
  import { m, languageTag } from '@shared/paraglide';
  
  // Reactive to language changes
  $: currentLang = languageTag();
</script>

<p>Current language: {currentLang}</p>
<button>{m.common_save()}</button>
```

## Workspace-Specific Messages

Each workspace can have additional messages:

```typescript
// apps/setup/src/lib/i18n.ts
import { m as globalM } from '@shared/paraglide';
import { m as setupM } from './paraglide';

// Combine global and setup messages
export const messages = {
  ...globalM,
  ...setupM
};
```

Usage:

```svelte
<script>
  import { messages as m } from '$lib/i18n';
</script>

<h1>{m.setup_welcome()}</h1>
<button>{m.common_save()}</button>
```

## Message Namespacing

Organize messages with namespaces:

```json
{
  "auth.login": "Log In",
  "auth.logout": "Log Out",
  "auth.signup": "Sign Up",
  "auth.forgotPassword": "Forgot Password?",
  
  "dashboard.title": "Dashboard",
  "dashboard.stats.users": "Total Users",
  "dashboard.stats.posts": "Total Posts"
}
```

Generated functions preserve namespacing:

```typescript
m.auth_login()
m.auth_logout()
m.dashboard_title()
m.dashboard_stats_users()
```

## Pluralization

Paraglide supports ICU message format:

```json
{
  "items": "{count, plural, =0 {No items} =1 {One item} other {# items}}"
}
```

Usage:

```svelte
{m.items({ count: 0 })}  <!-- "No items" -->
{m.items({ count: 1 })}  <!-- "One item" -->
{m.items({ count: 5 })}  <!-- "5 items" -->
```

## Machine Translation

Use Inlang CLI for machine translation:

```bash
# Translate missing messages
bun x @inlang/cli machine translate --project ./shared/paraglide/project.inlang

# Translate specific language
bun x @inlang/cli machine translate --project ./shared/paraglide/project.inlang --target-language de
```

## Type Safety

Paraglide provides full type safety:

```typescript
// ✅ Correct usage
m.validation_minLength({ min: 8 });

// ❌ TypeScript error: missing parameter
m.validation_minLength();

// ❌ TypeScript error: wrong parameter type
m.validation_minLength({ min: "eight" });

// ❌ TypeScript error: function doesn't exist
m.nonexistent_message();
```

## Performance Benefits

1. **Zero runtime overhead** - Messages compiled to functions
2. **Tree-shaking** - Unused messages removed
3. **Type-safe** - Catch errors at compile time
4. **Small bundle** - Only used messages included
5. **Fast** - No runtime parsing

## Best Practices

1. **Use namespaces** - Organize messages logically
2. **Keep messages in English** - Source language should be complete
3. **Parameterize dynamic content** - Use {param} syntax
4. **Avoid HTML in messages** - Use components instead
5. **Review translations** - Machine translation isn't perfect
6. **Document context** - Add comments for translators
7. **Test all languages** - Ensure UI works with all translations

## Adding a New Language

1. Add language tag to `settings.json`:
```json
{
  "languageTags": ["en", "de", "fr", "es", "ja"]
}
```

2. Create message file:
```bash
cp messages/en.json messages/ja.json
```

3. Translate messages or use machine translation:
```bash
bun x @inlang/cli machine translate --target-language ja
```

4. Compile:
```bash
nx run paraglide:compile
```

## VSCode Integration

Install the Inlang extension for:
- Inline translation preview
- Missing translation warnings
- Translation editing
- Autocomplete

## Migration from Other i18n Solutions

### From i18next

Before:
```javascript
import { t } from 'i18next';
t('common.save');
t('validation.minLength', { min: 8 });
```

After:
```typescript
import { m } from '@shared/paraglide';
m.common_save();
m.validation_minLength({ min: 8 });
```

Benefits:
- Type safety
- Better performance
- Smaller bundle
- Compile-time errors

## Troubleshooting

### Messages not updating

1. Recompile messages:
```bash
nx run paraglide:compile
```

2. Clear build cache:
```bash
nx reset
```

### Missing translations

Run lint to find missing translations:
```bash
bun x @inlang/cli lint --project ./shared/paraglide/project.inlang
```

### Type errors

Regenerate message types:
```bash
nx run paraglide:compile
```

## Testing

Test messages with different languages:

```typescript
import { m, setLanguageTag } from '@shared/paraglide';

test('messages in English', () => {
  setLanguageTag('en');
  expect(m.common_save()).toBe('Save');
});

test('messages in German', () => {
  setLanguageTag('de');
  expect(m.common_save()).toBe('Speichern');
});
```
