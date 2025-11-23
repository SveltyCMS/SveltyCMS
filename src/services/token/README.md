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
  - Example: `{{entry.title}}`, `{{entry.price}}`, `{{entry.created}}`
  
- **Collection Tokens**: `{{collection.name}}`, `{{collection.label}}`, `{{collection.description}}` - Collection metadata
  - Example: `{{collection.name}}` → `"products"`
  
- **Site Tokens**: `{{site.site_name}}`, `{{site.site_url}}`, `{{site.site_description}}` - Site configuration
  - Example: `{{site.site_name}}` → `"My Store"`
  
- **User Tokens**: `{{user.email}}`, `{{user._id}}` - Current user data
  - Example: `{{user.email}}` → `"user@example.com"`
  
- **System Tokens**: System-wide values that are computed at runtime
  - `{{system.now}}` - Current date/time (Date object, use with date modifier)
  - `{{system.timestamp}}` - Unix timestamp (seconds since epoch)
  - `{{system.date}}` - Current date in YYYY-MM-DD format
  - `{{system.time}}` - Current time in HH:mm:ss format
  - `{{system.year}}` - Current year (4 digits)
  - `{{system.month}}` - Current month (1-12)
  - `{{system.day}}` - Current day of month (1-31)
  - `{{system.hour}}` - Current hour (0-23)
  - `{{system.minute}}` - Current minute (0-59)
  - `{{system.second}}` - Current second (0-59)
  
  Examples:
  - `{{system.now | date}}` → `"2024-01-15"`
  - `{{system.timestamp}}` → `"1705312200"`
  - `{{system.date}}` → `"2024-01-15"`
  - `{{system.year}}` → `"2024"`

### Available Modifiers

#### Text Modifiers

- `upper` - Convert to uppercase
  - Example: `{{entry.title | upper}}` → "HELLO WORLD"
- `lower` - Convert to lowercase
  - Example: `{{entry.title | lower}}` → "hello world"
- `capitalize` - Capitalize first letter of each word
  - Example: `{{entry.title | capitalize}}` → "Hello World"
- `truncate(length, suffix)` - Truncate to specified length
  - Example: `{{entry.description | truncate(50)}}` → "This is a very long description..."
  - Example: `{{entry.description | truncate(50, "…")}}` → "This is a very long description…"
- `slugify` - Convert to URL-friendly slug
  - Example: `{{entry.title | slugify}}` → "hello-world"

#### Date Modifiers

- `date(format)` - Format date using preset or custom format string
  - **Preset formats:**
    - `iso` or `iso8601` - ISO 8601 format: `2024-01-15T10:30:00.000Z`
    - `date` - Date only: `2024-01-15` (default)
    - `time` - Time only: `10:30:00`
    - `datetime` - Date and time: `2024-01-15 10:30:00`
    - `short` - Short date: `1/15/2024`
    - `long` - Long date: `January 15, 2024`
    - `full` - Full date and time: `Monday, January 15, 2024 at 10:30 AM`
    - `relative` - Relative time: `"2 hours ago"`, `"in 3 days"`
    - `timestamp` - Unix timestamp: `1705312200`
  - **Custom formats** use date-fns format tokens:
    - `yyyy` - 4-digit year
    - `MM` - 2-digit month (01-12)
    - `dd` - 2-digit day (01-31)
    - `HH` - 24-hour format (00-23)
    - `mm` - minutes (00-59)
    - `ss` - seconds (00-59)
  - Examples:
    - `{{entry.created | date}}` → `2024-01-15`
    - `{{entry.created | date("iso")}}` → `2024-01-15T10:30:00.000Z`
    - `{{entry.created | date("yyyy-MM-dd HH:mm")}}` → `2024-01-15 10:30`
    - `{{entry.created | date("relative")}}` → `"2 hours ago"`
    - `{{entry.created | date("timestamp")}}` → `1705312200`

#### Math Modifiers

- `add(value)` - Add a number to the value
  - Example: `{{entry.price | add(10)}}` → Adds 10 to the price
- `subtract(value)` - Subtract a number from the value
  - Example: `{{entry.price | subtract(5)}}` → Subtracts 5 from the price
- `multiply(value)` - Multiply the value by a number
  - Example: `{{entry.price | multiply(1.2)}}` → 20% increase
- `divide(value)` - Divide the value by a number
  - Example: `{{entry.total | divide(2)}}` → Divides by 2
- `round(decimals?)` - Round to nearest integer or specified decimal places
  - Example: `{{entry.price | round}}` → Rounds to nearest integer
  - Example: `{{entry.price | round(2)}}` → Rounds to 2 decimal places
- `ceil` - Round up to nearest integer
  - Example: `{{entry.price | ceil}}` → Rounds up
- `floor` - Round down to nearest integer
  - Example: `{{entry.price | floor}}` → Rounds down
- `abs` - Return absolute value
  - Example: `{{entry.difference | abs}}` → Always positive
- `min(value)` - Return minimum of value and parameter
  - Example: `{{entry.price | min(100)}}` → Returns smaller value
- `max(value)` - Return maximum of value and parameter
  - Example: `{{entry.price | max(10)}}` → Returns larger value
- `number(decimals?)` - Format number with thousand separators
  - Example: `{{entry.price | number}}` → `1,234,567`
  - Example: `{{entry.price | number(2)}}` → `1,234,567.89`

#### Path Modifiers

- `basename` - Extract filename from path
  - Example: `{{entry.image | basename}}` → `"image.jpg"` from `"/path/to/image.jpg"`
- `dirname` - Extract directory path
  - Example: `{{entry.image | dirname}}` → `"/path/to"` from `"/path/to/image.jpg"`
- `extension` - Extract file extension
  - Example: `{{entry.image | extension}}` → `"jpg"` from `"/path/to/image.jpg"`
- `filename` - Extract filename without extension
  - Example: `{{entry.image | filename}}` → `"image"` from `"/path/to/image.jpg"`
- `path(segments...)` - Join path segments
  - Example: `{{entry.base | path("sub", "file.txt")}}` → Joins paths together
- `cleanurl` - Remove query string and hash from URL
  - Example: `{{entry.url | cleanurl}}` → Removes `?query=1#hash`

#### Logical Modifiers

- `default(fallback)` - Provide default value if empty
  - Example: `{{entry.title | default("No Title")}}` → Uses "No Title" if entry.title is empty

#### Advanced Modifiers

- `image_style(styleName)` - Transform image URLs with style
  - Example: `{{entry.image | image_style("thumbnail")}}` → Applies thumbnail style
- `related(fieldName)` - Fetch related data (placeholder)
  - Example: `{{entry.author | related("name")}}` → Gets name from related entry

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

## Testing

The token system includes comprehensive tests covering:
- Basic token replacement
- All modifier types (text, date, math, path, logical, advanced)
- System tokens
- Error handling and edge cases
- Complex scenarios with multiple modifiers

Run tests with:
```bash
bun test tests/bun/services/token.test.ts
```

## Examples

### Real-World Use Cases

**SEO Meta Title:**
```
{{entry.title | capitalize}} - {{site.site_name}}
```

**URL Slug Generation:**
```
{{entry.title | slugify}}
```

**Formatted Price:**
```
${{entry.price | number(2)}}
```

**Relative Publication Date:**
```
Published {{entry.created | date("relative")}}
```

**Image URL with Style:**
```
{{entry.image | image_style("thumbnail")}}
```

**Conditional Content:**
```
{{entry.description | default("No description available")}}
```

**Complex Example:**
```
{{site.site_url}}/{{collection.name}}/{{entry.slug | slugify}}?date={{system.date}}
```
