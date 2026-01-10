# Theme Library

Shared TailwindCSS and Skeleton UI theme configuration for all SveltyCMS applications.

## Purpose

Centralized theming ensures:
- Consistent design across applications
- Single source of truth for styling
- Easy theme updates
- Flexible framework updates (v4 → v5)

## Structure

```
shared/theme/
├── src/
│   ├── index.ts             # Main export
│   ├── tailwind.config.ts   # TailwindCSS configuration
│   ├── skeleton.config.ts   # Skeleton UI configuration
│   ├── colors.ts            # Color palette
│   ├── typography.ts        # Typography settings
│   └── components/          # Themed components
├── project.json
├── tsconfig.json
└── README.md
```

## Usage

### Import Theme Configuration

```typescript
// In app's tailwind.config.ts
import { tailwindConfig } from '@shared/theme';

export default {
  ...tailwindConfig,
  // App-specific overrides
}
```

### Use Theme Components

```svelte
<script>
  import { Button, Card } from '@shared/theme/components';
</script>

<Card>
  <Button variant="primary">Click me</Button>
</Card>
```

## Skeleton UI Version

Currently using: **Skeleton UI v4**

### Migration to v5

When Skeleton v5 is released, apps can migrate independently:

1. Update `shared/theme` to support both v4 and v5
2. Add version detection/selection
3. Migrate apps one at a time
4. Remove v4 support when all apps migrated

```typescript
// Example version-aware import
import { Button } from '@shared/theme/v5/components';
```

## Customization

### App-Specific Themes

Apps can extend the base theme:

```typescript
// apps/cms/tailwind.config.ts
import { tailwindConfig } from '@shared/theme';

export default {
  ...tailwindConfig,
  theme: {
    ...tailwindConfig.theme,
    extend: {
      colors: {
        // CMS-specific colors
      }
    }
  }
}
```

### Dark Mode

Dark mode support is built-in:

```typescript
// Toggle dark mode
import { toggleDarkMode } from '@shared/theme';
```

## Color Palette

```typescript
// Primary colors
primary: '#3b82f6'
secondary: '#8b5cf6'
accent: '#ec4899'

// Status colors
success: '#10b981'
warning: '#f59e0b'
error: '#ef4444'
info: '#3b82f6'
```

## Typography

- Font family: Inter (sans-serif)
- Base size: 16px
- Scale: 1.25 (Major Third)

## Components

### Available Components

- Buttons
- Cards
- Forms
- Modals
- Navigation
- Tables
- Alerts

### Adding New Components

1. Create component in `src/components/`
2. Export from `src/index.ts`
3. Document usage
4. Add tests

## Dependencies

- tailwindcss
- @tailwindcss/forms
- @tailwindcss/typography
- @skeletonlabs/skeleton
- @skeletonlabs/skeleton-svelte

## Build

```bash
nx build theme
```

## Testing

```bash
nx test theme
```

## Best Practices

1. **Keep it minimal** - Only include shared styles
2. **Use CSS custom properties** - For runtime theme switching
3. **Document overrides** - Clear documentation for customization
4. **Version carefully** - Coordinate breaking changes
5. **Test thoroughly** - Ensure changes don't break apps
