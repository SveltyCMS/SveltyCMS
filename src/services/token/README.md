# Token System

A powerful, extensible token system for SveltyCMS that allows content editors to insert dynamic, contextual data into input fields using a simple UI.

## Features

- **Token Replacement**: Replace `{{token}}` placeholders with actual values
- **Modifiers**: Apply transformations using pipe syntax: `{{token | modifier(param)}}`
- **Permission-Aware**: Tokens are filtered based on user permissions
- **Extensible**: Register custom tokens and modifiers
- **Performance**: Built-in caching for token discovery

## Usage

### Basic Token Replacement

```typescript
import { replaceTokens } from '@src/services/token';

const template = "Hello {{user.email}}, welcome to {{site.site_name}}!";
const context = {
  user: { email: 'user@example.com' },
  site: { site_name: 'My Site' }
};

const result = await replaceTokens(template, context);
// Result: "Hello user@example.com, welcome to My Site!"
```

### Using Modifiers

```typescript
const template = "{{entry.title | upper | truncate(50)}}";
const context = {
  entry: { title: 'This is a very long title that will be truncated' }
};

const result = await replaceTokens(template, context);
// Result: "THIS IS A VERY LONG TITLE THAT WILL BE..."
```

### Available Tokens

- **Entry Tokens**: `{{entry.fieldName}}` - Values from the current entry
- **Collection Tokens**: `{{collection.name}}`, `{{collection.label}}` - Collection metadata
- **Site Tokens**: `{{site.site_name}}`, `{{site.site_url}}` - Site configuration
- **User Tokens**: `{{user.email}}`, `{{user._id}}` - Current user data
- **System Tokens**: `{{system.now}}` - System globals

### Available Modifiers

#### Text Modifiers

- `upper` - Convert to uppercase
- `lower` - Convert to lowercase
- `capitalize` - Capitalize first letter of each word
- `truncate(length, suffix)` - Truncate to specified length
- `slugify` - Convert to URL-friendly slug

#### Date Modifiers

- `date(format)` - Format date using date-fns format string

#### Logical Modifiers

- `default(fallback)` - Provide default value if empty

#### Advanced Modifiers

- `image_style(styleName)` - Transform image URLs with style
- `related(fieldName)` - Fetch related data (placeholder)

## Extending the System

### Register Custom Modifier

```typescript
import { registerModifier } from '@src/services/token';
import type { ModifierFunction } from '@src/services/token';

const myModifier: ModifierFunction = (value: unknown, params?: string[]): string => {
  // Your transformation logic
  return String(value).toUpperCase();
};

registerModifier('myModifier', myModifier);
```

### Add Custom Tokens

```typescript
import { getAvailableTokens } from '@src/services/token';
import type { TokenDefinition } from '@src/services/token';

const customTokens: TokenDefinition[] = [
  {
    token: 'custom.myToken',
    name: 'My Custom Token',
    description: 'A custom token',
    category: 'system',
    path: ['custom', 'myToken']
  }
];

// Pass to getAvailableTokens via config
const tokens = getAvailableTokens(schema, user, {
  customTokens
});
```

## Integration with Widgets

### Input Widget

Enable token picker in Input widget:

```typescript
{
  label: "Meta Title",
  db_fieldName: "meta_title",
  widget: InputWidget,
  token: true  // Enable token picker
}
```

### Slug Widget

Use token pattern for auto-generation:

```typescript
{
  label: "URL Slug",
  db_fieldName: "slug",
  widget: SlugWidget,
  pattern: "{{entry.title | slugify}}",
  autoUpdate: true
}
```

## Performance

The token system includes built-in caching:

- Token lists are cached per collection + user role
- Cache TTL: 5 minutes
- Use `clearTokenCache()` to invalidate when needed

## Security

- Tokens are filtered based on field permissions
- Admin users see all tokens
- Non-admin users only see tokens for fields they have read access to
