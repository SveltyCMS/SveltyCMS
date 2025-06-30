# Svelte 5 Migration Guide: Custom Store to Runes (SSR-Safe)

This guide explains how to migrate from the custom `store()` function to Svelte 5 runes while maintaining SSR compatibility.

## ⚠️ Important: SSR Compatibility & $ Prefix Error

**Svelte 5 runes like `$state`, `$derived`, and `$effect` are NOT available in SSR (Server-Side Rendering) context.** This is a critical limitation when migrating in SvelteKit applications.

**The `$` prefix is reserved in Svelte and cannot be used in regular TypeScript files (`.ts` files).** Svelte 5 runes can only be used inside Svelte components (`.svelte` files).

### SSR-Safe Migration Strategy

1. **Server-side files (`.ts` files)**: Use regular variables and objects
2. **Client-side components (`.svelte` files)**: Use Svelte 5 runes for reactivity
3. **Hybrid approach**: Create client-side store wrappers

## Migration Patterns

### 1. Basic Store Creation

**Before (Custom Store):**
```typescript
import { store } from '@utils/reactivity.svelte';

const myStore = store<Map<string, any>>(new Map());
```

**After (SSR-Safe):**
```typescript
// Server-side (SSR compatible) - .ts files
const myStore = new Map<string, any>();

// Client-side component (.svelte files)
<script>
  import { $state } from 'svelte';
  const myStore = $state<Map<string, any>>(new Map());
</script>
```

### 2. Store Updates

**Before (Custom Store):**
```typescript
// Direct assignment
myStore.set(newValue);

// Update with function
myStore.update(current => ({ ...current, newProperty: value }));
```

**After (SSR-Safe):**
```typescript
// Server-side
myStore.clear();
for (const [key, value] of newData) {
    myStore.set(key, value);
}

// Client-side
myStore = newValue;
myStore = { ...myStore, newProperty: value };
```

### 3. Store Access

**Before (Custom Store):**
```typescript
// Get current value
const currentValue = myStore.get();

// Check if Map/Set has key
if (myStore.has(key)) { ... }
```

**After (SSR-Safe):**
```typescript
// Server-side
const currentValue = myStore;
if (myStore.has(key)) { ... }

// Client-side
const currentValue = myStore;
if (myStore.has(key)) { ... }
```

### 4. Derived Stores

**Before (Custom Store):**
```typescript
const derivedStore = store(() => myStore.value.someProperty);
```

**After (SSR-Safe):**
```typescript
// Server-side
const derivedStore = myStore.someProperty;

// Client-side
<script>
  import { $derived } from 'svelte';
  const derivedStore = $derived(myStore.someProperty);
</script>
```

### 5. Store Subscriptions

**Before (Custom Store):**
```typescript
const unsubscribe = myStore.subscribe(value => {
    console.log('Store changed:', value);
});
```

**After (SSR-Safe):**
```typescript
// Client-side only
<script>
  import { $effect } from 'svelte';

  $effect(() => {
      console.log('Store changed:', myStore);
  });
</script>
```

## File-by-File Migration

### 1. Collection Store (`src/stores/collectionStore.svelte.ts`) ✅

**Problem**: `$` prefix error in `.ts` file
**Solution**: Split into server and client parts

**Server-side (`src/stores/collectionStore.svelte.ts`):**
```typescript
// SSR compatible - no Svelte 5 runes
export const collections: { [uuid: string]: Schema } = {};
export const collectionsById = new Map<string, Schema>();
export const currentCollectionId: string | null = null;
```

**Client-side (`src/stores/collectionStoreClient.svelte.ts`):**
```typescript
// Client-side reactive - uses Svelte 5 runes
import { $state, $derived } from 'svelte';
export const collections = $state<{ [uuid: string]: Schema }>({});
export const totalCollections = $derived(Object.keys(collections).length);
```

### 2. Widgets Index (`src/widgets/index.ts`) ✅

**Changes Made:**
- Removed `$state` import (SSR incompatible)
- Changed to regular Map/Set for SSR compatibility
- Created separate client-side store wrapper

**Server-side (SSR compatible):**
```typescript
// State management - using regular variables for SSR compatibility
export const widgetFunctions = new Map<string, WidgetFunction>();
const activeWidgetList = new Set<string>();
```

**Client-side wrapper (`src/stores/widgetStore.svelte.ts`):**
```typescript
import { $state, $derived } from 'svelte';
export const widgetFunctions = $state<Map<string, WidgetFunction>>(new Map());
export const activeWidgetList = $state<Set<string>>(new Set());
```

### 3. UI Store (`src/stores/UIStore.svelte.ts`)

**Migration Strategy:**
- Keep server-side logic with regular variables
- Create client-side reactive wrapper
- Use `browser` check for client-only code

```typescript
// Server-side compatible
const uiState = getDefaultState(initialSize, mode === 'view' || mode === 'media');

// Client-side component
<script>
  import { $state, $derived } from 'svelte';
  const uiState = $state<UIState>(getDefaultState(initialSize, mode === 'view' || mode === 'media'));
</script>
```

## SSR-Safe Migration Checklist

- [ ] Identify server-side vs client-side files
- [ ] Remove `$state`, `$derived`, `$effect` from server-side files
- [ ] Use regular variables/objects for server-side state
- [ ] Create client-side store wrappers for reactivity
- [ ] Use `browser` check for client-only code
- [ ] Test both SSR and client-side functionality
- [ ] Ensure no runes are imported in server-side files
- [ ] Check that `.ts` files don't use `$` prefixed imports

## Common SSR Issues and Solutions

### Issue 1: `$state is not a function` in SSR
**Solution:** Move reactive state to client-side components only

### Issue 2: `The $ prefix is reserved` error
**Solution:** Don't use Svelte 5 runes in `.ts` files, only in `.svelte` files

### Issue 3: Hydration mismatch
**Solution:** Use `browser` check for client-only logic

### Issue 4: Server-side state not reactive
**Solution:** Create client-side wrappers that sync with server state

## Best Practices for SSR-Safe Migration

1. **Separate Concerns**: Keep server logic separate from client reactivity
2. **Use Browser Checks**: Wrap client-only code in `browser` checks
3. **Create Wrappers**: Build client-side stores that wrap server data
4. **Test Both Environments**: Verify SSR and client-side work correctly
5. **Gradual Migration**: Migrate one file at a time, testing each
6. **File Extensions**: Use `.svelte` files for Svelte 5 runes, `.ts` for server logic

## Example: Hybrid Approach

```typescript
// server.ts (SSR compatible)
export const serverState = new Map<string, any>();

// client.svelte (Client-side reactive)
<script>
  import { $state, $effect } from 'svelte';
  import { serverState } from './server';
  
  const clientState = $state(new Map());
  
  // Sync server state to client
  $effect(() => {
    clientState.clear();
    for (const [key, value] of serverState) {
      clientState.set(key, value);
    }
  });
</script>
```

## Testing Migration

After migrating each file:

1. **SSR Test**: Verify server-side rendering works
2. **Client Test**: Verify client-side reactivity works
3. **Hydration Test**: Check for hydration mismatches
4. **Console Check**: Look for SSR-related errors
5. **Performance Test**: Ensure no performance regressions

## Files to Migrate (SSR-Safe)

Based on the codebase search, these files need SSR-safe migration:

- `src/stores/UIStore.svelte.ts` - Split into server/client parts
- `src/stores/collectionStore.svelte.ts` - Use regular objects for SSR ✅
- `src/stores/themeStore.svelte.ts` - Create client-side wrapper
- `src/stores/screenSizeStore.svelte.ts` - Client-side only
- `src/stores/imageEditorStore.svelte.ts` - Client-side only
- `src/stores/store.svelte.ts` - Split server/client logic

## Rollback Plan

If you encounter SSR issues:

1. **Restore server-side files** to use regular variables
2. **Keep client-side components** with runes
3. **Test SSR functionality** thoroughly
4. **Gradually migrate** one file at a time

## Benefits of Migration

1. **Native Performance**: Svelte 5 runes are optimized at the framework level
2. **Simpler API**: No need for custom wrapper functions
3. **Better TypeScript Support**: Native runes have better type inference
4. **Future-Proof**: Aligned with Svelte 5's direction
5. **Reduced Bundle Size**: No custom store implementation needed

## Migration Checklist

- [ ] Replace `import { store } from '@utils/reactivity.svelte'` with `import { $state, $derived, $effect } from 'svelte'`
- [ ] Convert `store<T>(initialValue)` to `$state<T>(initialValue)`
- [ ] Convert `store(() => expression)` to `$derived(expression)`
- [ ] Replace `.set()` calls with direct assignment
- [ ] Replace `.update()` calls with direct assignment or native methods
- [ ] Replace `.get()` calls with direct access
- [ ] Replace `.subscribe()` calls with `$effect()`
- [ ] Update any code that accesses `.value` property
- [ ] Test all reactive behavior after migration

## Common Pitfalls

1. **Map/Set Updates**: Use native methods like `.clear()`, `.set()`, `.add()` instead of `.set()` wrapper
2. **Object Updates**: Use spread operator for immutable updates
3. **Derived Values**: Use `$derived` instead of `store(() => ...)`
4. **Effects**: Use `$effect` instead of `.subscribe()`

## Testing Migration

After migrating each file:

1. Check that reactive updates still work
2. Verify that derived values update correctly
3. Test that effects trigger appropriately
4. Ensure no console errors related to missing methods
5. Run your test suite if available

## Complete Migration Example

Here's a complete example of migrating a store:

**Before:**
```typescript
import { store } from '@utils/reactivity.svelte';

const userStore = store({ name: '', email: '' });
const isLoggedIn = store(() => !!userStore.value.name);

userStore.subscribe(user => {
    console.log('User changed:', user);
});

userStore.update(user => ({ ...user, name: 'John' }));
```

**After:**
```typescript
import { $state, $derived, $effect } from 'svelte';

const userStore = $state({ name: '', email: '' });
const isLoggedIn = $derived(!!userStore.name);

$effect(() => {
    console.log('User changed:', userStore);
});

userStore = { ...userStore, name: 'John' };
```

## Files to Migrate

Based on the codebase search, these files need migration:

- `src/stores/UIStore.svelte.ts`
- `src/stores/collectionStore.svelte.ts`
- `src/stores/themeStore.svelte.ts`
- `src/stores/screenSizeStore.svelte.ts`
- `src/stores/imageEditorStore.svelte.ts`
- `src/stores/store.svelte.ts`
- Any other files using `store()` from `@utils/reactivity.svelte` 