# SveltyCMS Token System

A powerful, extensible token replacement system for SveltyCMS that enables dynamic content insertion using a simple `{{token}}` syntax.

## Overview

The Token System allows content editors to insert dynamic, contextual data into input fields using tokens. It's perfect for creating consistent, SEO-friendly content like URL slugs, meta titles, and email templates without manual effort.

### Key Features

- 🔒 **Secure & Permission-Aware**: Built with security in mind, respects user permissions
- 🔄 **Dynamic Token Discovery**: Automatically discovers available tokens from schemas
- 🎨 **20+ Built-in Modifiers**: Transform token values (uppercase, slug, truncate, etc.)
- 📦 **Multiple Token Scopes**: Entry, Collection, Site, User, and System tokens
- 🧩 **Extensible**: Easy to add custom modifiers and token sources
- ⚡ **Performance Optimized**: Efficient nested data access and caching

## Quick Start

### Basic Usage

```typescript
import { replaceTokens } from '@src/services/tokens';

// Replace tokens in a template
const result = replaceTokens(
  'Hello {{user.name}}, welcome to {{site.name}}!',
  {
    user: { name: 'John' },
    siteConfig: { name: 'My Site' }
  }
);

console.log(result.result);
// Output: "Hello John, welcome to My Site!"
```

### With Modifiers

```typescript
import { replaceTokens } from '@src/services/tokens';

// Generate SEO-friendly URL slug
const result = replaceTokens(
  '{{entry.title|slug}}',
  {
    entry: { title: 'How to Build a CMS in 2024' }
  }
);

console.log(result.result);
// Output: "how-to-build-a-cms-in-2024"
```

### Discover Available Tokens

```typescript
import { getAvailableTokens } from '@src/services/tokens';

// Get all tokens for current context
const tokens = getAvailableTokens({
  collection: mySchema,
  user: currentUser,
  siteConfig: publicConfig
});

// Filter by scope
const entryTokens = getAvailableTokens(context, { scope: 'entry' });

// Search for specific tokens
const nameTokens = getAvailableTokens(context, { search: 'name' });
```

## Token Scopes

### 1. Entry Tokens (`entry.*`)

Access field data from the current collection entry.

```typescript
{{entry._id}}           // Entry ID
{{entry.status}}        // Entry status (draft, publish, etc.)
{{entry.title}}         // Any field from your schema
{{entry.createdAt}}     // Creation timestamp
{{entry.updatedAt}}     // Last update timestamp
{{entry.createdBy}}     // User who created the entry
{{entry.author.name}}   // Nested field access
```

### 2. Collection Tokens (`collection.*`)

Access metadata about the current collection.

```typescript
{{collection.name}}        // Collection name
{{collection.label}}       // Display label
{{collection.slug}}        // URL slug
{{collection.description}} // Collection description
```

### 3. Site Tokens (`site.*`)

Access site-wide configuration values.

```typescript
{{site.name}}          // Site name
{{site.tagline}}       // Site tagline
{{site.url}}           // Site URL
{{site.social.twitter}} // Nested config values
```

### 4. User Tokens (`user.*`)

Access current user information (permission-aware).

```typescript
{{user.id}}    // User ID
{{user.name}}  // User name
{{user.email}} // User email (requires permission)
{{user.role}}  // User role
```

### 5. System Tokens (`system.*`)

Built-in system values always available.

```typescript
{{system.now}}       // Current date/time (ISO format)
{{system.timestamp}} // Current Unix timestamp
{{system.year}}      // Current year
{{system.language}}  // Current content language
```

## Built-in Modifiers

Modifiers transform token values. Chain multiple modifiers with `|`.

### Text Case

```typescript
{{entry.title|uppercase}}    // HELLO WORLD
{{entry.title|lowercase}}    // hello world
{{entry.title|capitalize}}   // Hello World
```

### String Formatting

```typescript
{{entry.title|trim}}                    // Remove whitespace
{{entry.description|truncate:50}}       // Limit to 50 chars + "..."
{{entry.description|truncate:50:…}}     // Custom suffix
{{entry.content|strip}}                 // Remove HTML tags
{{entry.title|urlencode}}               // URL encode
```

### Slug Generation

```typescript
{{entry.title|slug}}        // hello-world
{{entry.title|kebabcase}}   // hello-world
{{entry.title|snakecase}}   // hello_world
{{entry.title|camelcase}}   // helloWorld
{{entry.title|pascalcase}}  // HelloWorld
```

### String Manipulation

```typescript
{{entry.title|replace:" ":"_"}}         // Replace spaces with underscores
{{entry.title|append:" - My Site"}}     // Add suffix
{{entry.title|prepend:"Article: "}}     // Add prefix
{{entry.subtitle|default:"No subtitle"}} // Fallback value
```

### Date Formatting

```typescript
{{entry.publishedAt|date}}                   // 2024-01-15 (default)
{{entry.publishedAt|date:"YYYY-MM-DD"}}      // 2024-01-15
{{entry.publishedAt|date:"MM/DD/YYYY"}}      // 01/15/2024
{{entry.createdAt|date:"YYYY-MM-DD HH:mm"}}  // 2024-01-15 10:30
```

### Chaining Modifiers

```typescript
// Multiple transformations in sequence
{{entry.title|trim|uppercase|append:"!"}}
// "  hello  " → "hello" → "HELLO" → "HELLO!"

{{entry.title|lowercase|slug}}
// "Hello World!" → "hello world!" → "hello-world"
```

## Common Use Cases

### 1. SEO Meta Title

```typescript
const metaTitle = replaceTokens(
  '{{entry.title}} | {{site.name}}',
  context
);
// "My Article | My Blog"
```

### 2. URL Slug Generation

```typescript
const slug = replaceTokens(
  '{{entry.title|slug}}',
  { entry: { title: 'How to Build a CMS' } }
);
// "how-to-build-a-cms"
```

### 3. Email Templates

```typescript
const email = replaceTokens(
  'Hi {{user.name}}, your article "{{entry.title}}" was published!',
  context
);
```

### 4. Social Media Sharing

```typescript
const tweet = replaceTokens(
  '{{entry.title|truncate:100}} {{site.url}}/{{entry.slug}}',
  context
);
```

### 5. File Naming

```typescript
const filename = replaceTokens(
  '{{system.year}}-{{entry.slug}}.pdf',
  context
);
// "2024-my-article.pdf"
```

## Advanced Usage

### Custom Error Handling

```typescript
const result = replaceTokens(template, context, {
  throwOnMissing: true,  // Throw error if token not found
  preserveUnresolved: true, // Keep {{token}} if not resolved
  onError: (error, token) => {
    console.error(`Failed to resolve token: ${token}`, error);
  }
});
```

### Maximum Recursion Depth

```typescript
const result = replaceTokens(template, context, {
  maxDepth: 5  // Prevent infinite loops
});
```

### Checking for Tokens

```typescript
import { hasTokens, extractTokens } from '@src/services/tokens';

// Check if string contains tokens
if (hasTokens('Hello {{user.name}}')) {
  // Do something
}

// Extract all token expressions
const tokens = extractTokens('{{entry.title}} by {{user.name}}');
// Returns: ['entry.title', 'user.name']
```

### Validating Token Syntax

```typescript
import { validateTokenSyntax } from '@src/services/tokens';

const result = validateTokenSyntax('entry.title|uppercase');
if (!result.valid) {
  console.error(result.error);
}
```

## Token Registry API

### Get Available Tokens

```typescript
import { getAvailableTokens, getTokensByScope, findToken } from '@src/services/tokens';

// Get all available tokens
const allTokens = getAvailableTokens(context);

// Filter by scope
const entryTokens = getAvailableTokens(context, { scope: 'entry' });
const multiScope = getAvailableTokens(context, { scope: ['entry', 'user'] });

// Search tokens
const searchResults = getAvailableTokens(context, { search: 'title' });

// Exclude system tokens
const nonSystemTokens = getAvailableTokens(context, { includeSystem: false });

// Group by scope
const grouped = getTokensByScope(context);
console.log(grouped.entry);  // All entry tokens
console.log(grouped.user);   // All user tokens

// Find specific token
const token = findToken('entry.title', context);
if (token) {
  console.log(token.label);        // "Title"
  console.log(token.description);  // Field description
  console.log(token.available);    // true/false
}
```

### Token Definition Structure

```typescript
interface TokenDefinition {
  key: string;              // "entry.title"
  scope: TokenScope;        // "entry"
  label: string;            // "Title"
  description?: string;     // "The article title"
  type: string;             // "string" | "number" | "boolean" | "date" | "object" | "array"
  requiresPermission?: string; // Permission required to use
  available: boolean;       // Whether available in current context
  previewValue?: string;    // Preview value for UI
  field?: FieldInstance;    // Associated field if applicable
}
```

## Type Definitions

### TokenContext

```typescript
interface TokenContext {
  entry?: CollectionEntry;           // Current entry data
  collection?: Schema;               // Collection schema
  collectionName?: string;           // Collection name
  siteConfig?: Record<string, unknown>; // Site configuration
  user?: {                           // Current user
    id?: string;
    email?: string;
    name?: string;
    role?: string;
    [key: string]: unknown;
  };
  contentLanguage?: string;          // Content language
  tenantId?: string;                 // Multi-tenant ID
  [key: string]: unknown;            // Additional context
}
```

### TokenReplacementResult

```typescript
interface TokenReplacementResult {
  result: string;           // Final replaced string
  replaced: string[];       // Successfully replaced tokens
  unresolved: string[];     // Unresolved tokens
  errors: Array<{
    token: string;
    message: string;
  }>;
}
```

## Creating Custom Modifiers

```typescript
import type { ModifierDefinition } from '@src/services/tokens/types';

// Define your custom modifier
const customModifier: ModifierDefinition = {
  name: 'reverse',
  description: 'Reverses the string',
  execute: (value: unknown): string => {
    return String(value ?? '').split('').reverse().join('');
  },
  example: '{{entry.title|reverse}}'
};

// Register it (extend builtInModifiers)
import { builtInModifiers } from '@src/services/tokens/modifiers';
builtInModifiers.reverse = customModifier;
```

## Security Considerations

1. **Permission Checking**: Tokens with `requiresPermission` are filtered based on user permissions
2. **Injection Prevention**: All token values are stringified, preventing code injection
3. **Depth Limits**: Maximum recursion depth prevents infinite loops
4. **Scope Isolation**: Tokens can only access data from their defined scope

## Performance Tips

1. **Cache Token Registry**: Call `getAvailableTokens()` once and reuse the result
2. **Limit Scope**: Only request tokens for needed scopes
3. **Batch Operations**: Process multiple templates in a single pass when possible
4. **Pre-validate**: Use `validateTokenSyntax()` before runtime replacement

## Testing

The token system includes comprehensive test coverage:

```bash
# Run token system tests
npm run test tests/bun/services/tokens/
```

Test files:
- `TokenService.test.ts` - Core replacement logic (50+ tests)
- `TokenRegistry.test.ts` - Token discovery (40+ tests)
- `modifiers.test.ts` - All built-in modifiers (40+ tests)

## API Reference

### Core Functions

#### `replaceTokens(template, context, options?)`

Replace all tokens in a template string.

**Parameters:**
- `template: string` - Template with `{{token}}` placeholders
- `context: TokenContext` - Context data for replacement
- `options?: TokenReplacementOptions` - Optional configuration

**Returns:** `TokenReplacementResult`

#### `getAvailableTokens(context, options?)`

Get all available tokens for the given context.

**Parameters:**
- `context: TokenContext` - Current context
- `options?: GetTokensOptions` - Filter/search options

**Returns:** `TokenDefinition[]`

#### `hasTokens(template)`

Check if a string contains any tokens.

**Returns:** `boolean`

#### `extractTokens(template)`

Extract all token expressions from a template.

**Returns:** `string[]`

#### `validateTokenSyntax(expression)`

Validate token syntax.

**Returns:** `{ valid: boolean; error?: string }`

### Modifier Functions

#### `getModifier(name)`

Get a modifier by name.

**Returns:** `ModifierDefinition | undefined`

#### `getAllModifiers()`

Get all available modifiers.

**Returns:** `ModifierDefinition[]`

#### `applyModifier(name, value, params?)`

Apply a modifier to a value.

**Returns:** `string`

## Examples

See the `tests/bun/services/tokens/` directory for comprehensive usage examples.

## Contributing

To add new features to the token system:

1. Add types to `types.ts` if needed
2. Implement functionality in appropriate service file
3. Add comprehensive tests
4. Update this documentation

## License

Part of SveltyCMS - MIT License
