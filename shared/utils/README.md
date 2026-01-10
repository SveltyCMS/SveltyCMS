# Utils Library

Shared utility functions for all SveltyCMS applications and libraries.

## Purpose

Common utilities that:
- Prevent code duplication
- Ensure consistency
- Provide type-safe helpers
- Simplify complex operations

## Structure

```
shared/utils/
├── src/
│   ├── index.ts           # Main exports
│   ├── string.ts          # String utilities
│   ├── date.ts            # Date/time utilities
│   ├── validation.ts      # Validation helpers
│   ├── formatting.ts      # Formatting utilities
│   ├── security.ts        # Security utilities
│   ├── file.ts            # File operations
│   └── async.ts           # Async helpers
├── project.json
├── tsconfig.json
└── README.md
```

## Usage

```typescript
import {
  slugify,
  formatDate,
  validate,
  sanitizeHtml,
  debounce
} from '@shared/utils';

// String operations
const slug = slugify('Hello World'); // 'hello-world'

// Date formatting
const formatted = formatDate(new Date(), 'YYYY-MM-DD');

// Validation
const isValid = validate.email('test@example.com');

// Security
const safe = sanitizeHtml('<script>alert("xss")</script>');

// Async helpers
const debouncedFn = debounce(() => console.log('Called'), 300);
```

## Categories

### String Utilities

```typescript
// Case conversion
camelCase(str: string): string
kebabCase(str: string): string
snakeCase(str: string): string
pascalCase(str: string): string

// Slugification
slugify(str: string): string

// Truncation
truncate(str: string, length: number): string

// Random generation
randomString(length: number): string
```

### Date/Time Utilities

```typescript
// Formatting
formatDate(date: Date, format: string): string
formatRelative(date: Date): string // '2 hours ago'

// Parsing
parseDate(str: string): Date

// Comparison
isToday(date: Date): boolean
isFuture(date: Date): boolean
isPast(date: Date): boolean

// Manipulation
addDays(date: Date, days: number): Date
subtractDays(date: Date, days: number): Date
```

### Validation

```typescript
// Email
validate.email(email: string): boolean

// URL
validate.url(url: string): boolean

// Phone
validate.phone(phone: string): boolean

// Password strength
validate.password(password: string): {
  valid: boolean;
  strength: 'weak' | 'medium' | 'strong';
  issues: string[];
}

// Custom regex
validate.pattern(value: string, pattern: RegExp): boolean
```

### Formatting

```typescript
// Numbers
formatNumber(num: number): string // 1000 -> '1,000'
formatCurrency(num: number, currency: string): string
formatBytes(bytes: number): string // 1024 -> '1 KB'

// Text
capitalize(str: string): string
titleCase(str: string): string
```

### Security

```typescript
// HTML sanitization
sanitizeHtml(html: string): string

// SQL escape (use ORM instead when possible)
escapeHtml(str: string): string

// File name sanitization
sanitizeFilename(filename: string): string

// XSS prevention
stripScripts(html: string): string
```

### File Operations

```typescript
// MIME type detection
getMimeType(filename: string): string

// File size validation
isValidFileSize(size: number, maxSize: number): boolean

// Extension checking
hasExtension(filename: string, extensions: string[]): boolean

// Path manipulation
getExtension(filename: string): string
getBasename(path: string): string
```

### Async Helpers

```typescript
// Debouncing
debounce<T>(fn: (...args: any[]) => T, delay: number): (...args: any[]) => void

// Throttling
throttle<T>(fn: (...args: any[]) => T, limit: number): (...args: any[]) => void

// Retry logic
retry<T>(fn: () => Promise<T>, retries: number): Promise<T>

// Delay
sleep(ms: number): Promise<void>

// Timeout
withTimeout<T>(promise: Promise<T>, ms: number): Promise<T>
```

### Array/Object Helpers

```typescript
// Deep clone
deepClone<T>(obj: T): T

// Deep merge
deepMerge<T>(...objects: Partial<T>[]): T

// Array unique
unique<T>(array: T[]): T[]

// Group by
groupBy<T>(array: T[], key: keyof T): Record<string, T[]>

// Chunk array
chunk<T>(array: T[], size: number): T[][]
```

## Type Safety

All utilities are fully typed:

```typescript
// Example: Type-safe groupBy
const users = [
  { id: 1, role: 'admin' },
  { id: 2, role: 'user' }
];

// TypeScript knows the structure
const grouped = groupBy(users, 'role');
// grouped: Record<string, Array<{ id: number; role: string }>>
```

## Testing

```bash
nx test utils
```

Each utility has comprehensive tests:
- Unit tests for all functions
- Edge cases covered
- Type tests for TypeScript

## Performance

- Tree-shakeable exports
- No dependencies on heavy libraries
- Optimized algorithms
- Memoization where appropriate

## Adding New Utilities

1. Create new file in `src/`
2. Export from `src/index.ts`
3. Add JSDoc comments
4. Write tests
5. Update this README

Example:

```typescript
/**
 * Converts a string to title case
 * @param str - The string to convert
 * @returns The title-cased string
 * @example
 * titleCase('hello world') // 'Hello World'
 */
export function titleCase(str: string): string {
  return str.replace(/\w\S*/g, (txt) => 
    txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
  );
}
```

## Dependencies

Minimal dependencies:
- date-fns (date utilities)
- validator (validation)
- dompurify (HTML sanitization)

## Best Practices

1. **Pure functions** - No side effects
2. **Type safety** - Full TypeScript support
3. **Documentation** - JSDoc for all functions
4. **Testing** - 100% coverage goal
5. **Performance** - Optimize hot paths
6. **Tree-shaking** - Named exports only
