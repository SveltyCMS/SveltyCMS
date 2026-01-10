# Components Library

Shared UI components for consistency across all SveltyCMS applications.

## Purpose

Reusable components that:
- Ensure visual consistency
- Reduce code duplication
- Provide accessible UI elements
- Enable rapid development

## Structure

```
shared/components/
├── src/
│   ├── index.ts              # Main exports
│   ├── system/               # System components
│   │   ├── Button.svelte
│   │   ├── Card.svelte
│   │   ├── Modal.svelte
│   │   └── Alert.svelte
│   ├── forms/                # Form components
│   │   ├── Input.svelte
│   │   ├── Select.svelte
│   │   ├── Checkbox.svelte
│   │   └── Radio.svelte
│   ├── layout/               # Layout components
│   │   ├── Container.svelte
│   │   ├── Grid.svelte
│   │   └── Stack.svelte
│   └── navigation/           # Navigation components
│       ├── Nav.svelte
│       ├── Breadcrumb.svelte
│       └── Tabs.svelte
├── project.json
├── tsconfig.json
└── README.md
```

## Usage

```svelte
<script>
  import { Button, Card, Input, Modal } from '@shared/components';
  
  let showModal = false;
</script>

<Card>
  <h2>Form Example</h2>
  <Input label="Email" type="email" />
  <Button on:click={() => showModal = true}>
    Submit
  </Button>
</Card>

<Modal bind:open={showModal}>
  <p>Form submitted!</p>
</Modal>
```

## Component Categories

### System Components

#### Button
```svelte
<Button variant="primary" size="md">Click me</Button>
<Button variant="secondary" outline>Secondary</Button>
<Button variant="danger" loading>Loading...</Button>
```

**Props:**
- `variant`: 'primary' | 'secondary' | 'success' | 'danger' | 'warning'
- `size`: 'sm' | 'md' | 'lg'
- `outline`: boolean
- `loading`: boolean
- `disabled`: boolean

#### Card
```svelte
<Card padding="md" hover>
  <svelte:fragment slot="header">
    <h3>Card Title</h3>
  </svelte:fragment>
  
  Card content here
  
  <svelte:fragment slot="footer">
    <Button>Action</Button>
  </svelte:fragment>
</Card>
```

#### Modal
```svelte
<Modal bind:open={isOpen} size="lg" closeOnEscape>
  <svelte:fragment slot="title">Modal Title</svelte:fragment>
  Modal content
  <svelte:fragment slot="footer">
    <Button on:click={() => isOpen = false}>Close</Button>
  </svelte:fragment>
</Modal>
```

#### Alert
```svelte
<Alert type="success" dismissible>
  Operation completed successfully!
</Alert>
<Alert type="error" icon>
  Something went wrong
</Alert>
```

### Form Components

#### Input
```svelte
<Input
  label="Email"
  type="email"
  bind:value={email}
  placeholder="you@example.com"
  required
  error={errors.email}
/>
```

#### Select
```svelte
<Select
  label="Country"
  bind:value={country}
  options={[
    { value: 'us', label: 'United States' },
    { value: 'uk', label: 'United Kingdom' }
  ]}
/>
```

#### Checkbox
```svelte
<Checkbox
  bind:checked={agreed}
  label="I agree to the terms"
/>
```

### Layout Components

#### Container
```svelte
<Container maxWidth="lg" padding="md">
  Content is centered and constrained
</Container>
```

#### Grid
```svelte
<Grid cols={3} gap="md">
  <div>Item 1</div>
  <div>Item 2</div>
  <div>Item 3</div>
</Grid>
```

#### Stack
```svelte
<Stack direction="vertical" gap="sm" align="center">
  <div>Vertically stacked</div>
  <div>With consistent spacing</div>
</Stack>
```

### Navigation Components

#### Nav
```svelte
<Nav
  items={[
    { label: 'Home', href: '/' },
    { label: 'About', href: '/about' }
  ]}
/>
```

#### Breadcrumb
```svelte
<Breadcrumb
  items={[
    { label: 'Home', href: '/' },
    { label: 'Products', href: '/products' },
    { label: 'Item' }
  ]}
/>
```

#### Tabs
```svelte
<Tabs
  bind:activeTab
  tabs={[
    { id: 'general', label: 'General' },
    { id: 'advanced', label: 'Advanced' }
  ]}
>
  <svelte:fragment slot="general">
    General content
  </svelte:fragment>
  <svelte:fragment slot="advanced">
    Advanced content
  </svelte:fragment>
</Tabs>
```

## Accessibility

All components follow WCAG 2.1 AA standards:
- Keyboard navigation
- Screen reader support
- ARIA attributes
- Focus management
- Color contrast

## Theming

Components use theme tokens from `@shared/theme`:

```svelte
<style>
  .button {
    background: var(--color-primary);
    color: var(--color-on-primary);
  }
</style>
```

## Customization

### Override Styles
```svelte
<Button class="custom-button">
  Custom styled
</Button>

<style>
  :global(.custom-button) {
    /* Custom styles */
  }
</style>
```

### Extend Components
```svelte
<!-- IconButton.svelte -->
<script>
  import { Button } from '@shared/components';
  export let icon: string;
</script>

<Button {...$$restProps}>
  <Icon name={icon} />
  <slot />
</Button>
```

## Testing

```bash
nx test components
```

Components are tested for:
- Rendering
- Props
- Events
- Slots
- Accessibility

## Adding New Components

1. Create component file in appropriate category
2. Export from `src/index.ts`
3. Add documentation
4. Write tests
5. Update this README

Template:

```svelte
<!-- src/system/NewComponent.svelte -->
<script lang="ts">
  /**
   * Component description
   */
  
  // Props
  export let variant: 'primary' | 'secondary' = 'primary';
  export let size: 'sm' | 'md' | 'lg' = 'md';
  
  // Events
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();
</script>

<div class="new-component {variant} {size}">
  <slot />
</div>

<style>
  .new-component {
    /* Styles */
  }
</style>
```

## Dependencies

- svelte
- @shared/theme (for styling)
- @shared/utils (for helpers)

## Best Practices

1. **Composition over complexity** - Keep components simple
2. **Props validation** - Use TypeScript
3. **Events** - Use standard event names
4. **Slots** - Provide flexibility
5. **Accessibility** - Always included
6. **Documentation** - JSDoc and examples
7. **Testing** - Test all states and interactions

## Performance

- Lazy loading for heavy components
- Minimal re-renders
- Virtual scrolling for lists
- Debounced inputs
- Optimized animations
