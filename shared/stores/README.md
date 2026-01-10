# Stores Library

Shared state management for SveltyCMS applications using Svelte stores.

## Purpose

Centralized state management for:
- Cross-workspace state sharing
- Global application state
- Reactive data synchronization
- Persistent state

## Structure

```
shared/stores/
├── src/
│   ├── index.ts              # Main exports
│   ├── user.ts               # User state
│   ├── theme.ts              # Theme preferences
│   ├── language.ts           # Language state
│   ├── notifications.ts      # Notifications
│   ├── config.ts             # Configuration
│   └── types.ts              # TypeScript types
├── project.json
├── tsconfig.json
└── README.md
```

## Usage

```typescript
import { userStore, themeStore, languageStore } from '@shared/stores';

// Subscribe to stores
const unsubscribe = userStore.subscribe(user => {
  console.log('User:', user);
});

// Update stores
userStore.set({ id: '123', name: 'John' });

// Use in Svelte components
$: console.log('Current user:', $userStore);
```

## Store Types

### User Store

Manages authenticated user state:

```typescript
// src/user.ts
import { writable } from 'svelte/store';
import type { User } from './types';

function createUserStore() {
  const { subscribe, set, update } = writable<User | null>(null);
  
  return {
    subscribe,
    login: (user: User) => set(user),
    logout: () => set(null),
    update: (updates: Partial<User>) => update(u => u ? { ...u, ...updates } : null),
    refresh: async () => {
      const user = await fetchCurrentUser();
      set(user);
    }
  };
}

export const userStore = createUserStore();
```

Usage:

```svelte
<script>
  import { userStore } from '@shared/stores';
</script>

{#if $userStore}
  <p>Welcome, {$userStore.name}!</p>
  <button on:click={() => userStore.logout()}>Logout</button>
{:else}
  <p>Please log in</p>
{/if}
```

### Theme Store

Manages theme preferences:

```typescript
// src/theme.ts
import { writable } from 'svelte/store';
import { browser } from '$app/environment';

type Theme = 'light' | 'dark' | 'auto';

function createThemeStore() {
  // Initialize from localStorage or system preference
  const stored = browser ? localStorage.getItem('theme') as Theme : 'auto';
  const { subscribe, set } = writable<Theme>(stored || 'auto');
  
  return {
    subscribe,
    set: (theme: Theme) => {
      if (browser) {
        localStorage.setItem('theme', theme);
        applyTheme(theme);
      }
      set(theme);
    },
    toggle: () => {
      subscribe(current => {
        const next = current === 'light' ? 'dark' : 'light';
        if (browser) {
          localStorage.setItem('theme', next);
          applyTheme(next);
        }
        set(next);
      })();
    }
  };
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  
  if (theme === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', prefersDark);
  } else {
    root.classList.toggle('dark', theme === 'dark');
  }
}

export const themeStore = createThemeStore();
```

### Language Store

Manages current language:

```typescript
// src/language.ts
import { writable, derived } from 'svelte/store';
import { browser } from '$app/environment';

type Language = 'en' | 'de' | 'fr' | 'es';

function createLanguageStore() {
  const stored = browser ? localStorage.getItem('language') as Language : 'en';
  const { subscribe, set } = writable<Language>(stored || 'en');
  
  return {
    subscribe,
    set: (lang: Language) => {
      if (browser) {
        localStorage.setItem('language', lang);
        document.documentElement.lang = lang;
      }
      set(lang);
    }
  };
}

export const languageStore = createLanguageStore();

// Derived store for RTL detection
export const isRTL = derived(languageStore, $lang => 
  ['ar', 'he', 'fa'].includes($lang)
);
```

### Notifications Store

Manages toast notifications:

```typescript
// src/notifications.ts
import { writable } from 'svelte/store';

interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  message: string;
  duration?: number;
}

function createNotificationStore() {
  const { subscribe, update } = writable<Notification[]>([]);
  
  return {
    subscribe,
    add: (notification: Omit<Notification, 'id'>) => {
      const id = Math.random().toString(36);
      const newNotification = { ...notification, id };
      
      update(notifications => [...notifications, newNotification]);
      
      // Auto-remove after duration
      const duration = notification.duration || 5000;
      setTimeout(() => {
        update(notifications => 
          notifications.filter(n => n.id !== id)
        );
      }, duration);
      
      return id;
    },
    remove: (id: string) => {
      update(notifications => 
        notifications.filter(n => n.id !== id)
      );
    },
    clear: () => {
      update(() => []);
    },
    // Convenience methods
    success: (message: string, duration?: number) => 
      this.add({ type: 'success', message, duration }),
    error: (message: string, duration?: number) => 
      this.add({ type: 'error', message, duration }),
    warning: (message: string, duration?: number) => 
      this.add({ type: 'warning', message, duration }),
    info: (message: string, duration?: number) => 
      this.add({ type: 'info', message, duration })
  };
}

export const notificationStore = createNotificationStore();
```

Usage:

```typescript
import { notificationStore } from '@shared/stores';

// Show success message
notificationStore.success('Settings saved!');

// Show error with custom duration
notificationStore.error('Failed to save', 10000);
```

### Config Store

Manages application configuration:

```typescript
// src/config.ts
import { writable, derived } from 'svelte/store';

interface Config {
  database: {
    type: 'mongodb' | 'sql';
    driver?: 'mariadb' | 'postgres' | 'mysql';
  };
  features: {
    media: boolean;
    graphql: boolean;
    email: boolean;
  };
  limits: {
    maxFileSize: number;
    maxUsers: number;
  };
}

function createConfigStore() {
  const { subscribe, set, update } = writable<Config | null>(null);
  
  return {
    subscribe,
    load: async () => {
      const config = await fetch('/api/config').then(r => r.json());
      set(config);
    },
    update: async (updates: Partial<Config>) => {
      await fetch('/api/config', {
        method: 'PATCH',
        body: JSON.stringify(updates)
      });
      update(c => c ? { ...c, ...updates } : null);
    }
  };
}

export const configStore = createConfigStore();

// Derived store for database type
export const isDatabaseMongoDB = derived(
  configStore,
  $config => $config?.database.type === 'mongodb'
);

export const isDatabaseSQL = derived(
  configStore,
  $config => $config?.database.type === 'sql'
);
```

## Persistent Stores

For stores that should persist across sessions:

```typescript
// src/utils/persistent.ts
import { writable } from 'svelte/store';
import { browser } from '$app/environment';

export function persistent<T>(key: string, initialValue: T) {
  // Load from localStorage
  const stored = browser ? localStorage.getItem(key) : null;
  const data = stored ? JSON.parse(stored) : initialValue;
  
  const store = writable<T>(data);
  
  // Save to localStorage on changes
  if (browser) {
    store.subscribe(value => {
      localStorage.setItem(key, JSON.stringify(value));
    });
  }
  
  return store;
}

// Usage
export const preferences = persistent('preferences', {
  sidebarCollapsed: false,
  defaultView: 'grid'
});
```

## Derived Stores

Create computed values from other stores:

```typescript
import { derived } from 'svelte/store';
import { userStore, configStore } from '@shared/stores';

// Is user an admin?
export const isAdmin = derived(
  userStore,
  $user => $user?.role === 'admin'
);

// Can user access feature?
export const canUseMedia = derived(
  [userStore, configStore],
  ([$user, $config]) => {
    return $user && $config?.features.media;
  }
);
```

## Custom Stores

Create custom stores with special behavior:

```typescript
// src/customStores/asyncStore.ts
import { writable } from 'svelte/store';

export function asyncStore<T>(fetcher: () => Promise<T>) {
  const { subscribe, set } = writable<{
    loading: boolean;
    data: T | null;
    error: Error | null;
  }>({
    loading: true,
    data: null,
    error: null
  });
  
  async function load() {
    set({ loading: true, data: null, error: null });
    try {
      const data = await fetcher();
      set({ loading: false, data, error: null });
    } catch (error) {
      set({ loading: false, data: null, error: error as Error });
    }
  }
  
  // Auto-load
  load();
  
  return {
    subscribe,
    reload: load
  };
}

// Usage
export const collectionsStore = asyncStore(() => 
  fetch('/api/collections').then(r => r.json())
);
```

## Testing

```bash
nx test stores
```

Test stores in isolation:

```typescript
import { get } from 'svelte/store';
import { userStore } from '@shared/stores';

test('userStore login sets user', () => {
  const user = { id: '123', name: 'John' };
  userStore.login(user);
  
  expect(get(userStore)).toEqual(user);
});

test('userStore logout clears user', () => {
  userStore.login({ id: '123', name: 'John' });
  userStore.logout();
  
  expect(get(userStore)).toBeNull();
});
```

## Best Practices

1. **Keep stores focused** - Single responsibility
2. **Type safety** - Use TypeScript
3. **Avoid over-subscription** - Unsubscribe when done
4. **Use derived stores** - For computed values
5. **Persist wisely** - Only persist necessary data
6. **Validate data** - Before setting store values
7. **Document stores** - Clear usage examples

## Performance

- Stores are reactive and efficient
- Only subscribers are notified of changes
- Use derived stores to avoid redundant calculations
- Batch updates when possible

## Migration from Local State

Before (local state):
```svelte
<script>
  let user = null;
  
  onMount(async () => {
    user = await fetchUser();
  });
</script>
```

After (shared store):
```svelte
<script>
  import { userStore } from '@shared/stores';
  
  onMount(() => userStore.refresh());
</script>

{#if $userStore}
  <p>{$userStore.name}</p>
{/if}
```
