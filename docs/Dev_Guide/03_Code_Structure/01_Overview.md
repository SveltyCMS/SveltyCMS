---
title: 'Code Structure Overview'
description: 'Overview of SvelteCMS codebase organization and architecture'
icon: 'mdi:folder-tree'
published: true
order: 1
---

# SvelteCMS Code Structure

This document provides a comprehensive overview of the SvelteCMS codebase organization and architecture.

## Directory Structure

```
SvelteCMS/
├── config/                 # Core configuration (collections, roles, settings)
│   ├── collections/        # Collection definitions
│   ├── public.ts           # Public, non-sensitive settings
│   └── private.ts          # Private, sensitive settings (gitignored)
├── src/                    # Source code
│   ├── auth/               # Authentication system (logic, adapters)
│   ├── components/         # Reusable Svelte components
│   ├── content/            # Content management (ContentManager)
│   ├── databases/          # Database adapters and initialization (db.ts)
│   ├── hooks/              # SvelteKit server hooks
│   ├── routes/             # SvelteKit routes (UI and API)
│   ├── stores/             # Svelte stores (including globalSettings.ts)
│   ├── utils/              # Utility functions
│   └── widgets/            # CMS widget implementations
├── static/                 # Static assets
├── tests/                  # Test files
└── ...                     # Other project files
```

## Core Components

### 1. Database Layer (`/src/databases/`)

The database layer provides a flexible interface (`dbInterface.ts`) for different database backends. The core `db.ts` file handles the dynamic loading of the appropriate adapter based on the environment configuration.

```typescript
interface DatabaseAdapter {
	connect(): Promise<DatabaseResult<void>>;
	// ... CRUD methods for collections, media, widgets etc.
}
```

Supported adapters:

- MongoDB Adapter (`/src/databases/mongodb/`)
- (Future) SQL-based adapters

### 2. Authentication System (`/src/auth/`)

Handles user authentication and authorization. It uses its own adapter interface (`authDBInterface.ts`) which is implemented for each database type (e.g., `/src/auth/mongoDBAuth/`).

- Session management
- Role-based access control
- OAuth integration
- Custom authentication providers

### 3. Component Library (`/src/lib/components/`)

Reusable UI components following atomic design principles:

- Atoms (basic UI elements)
- Molecules (component combinations)
- Organisms (complex UI sections)
- Templates (page layouts)

### 4. Configuration System (`/config/` and `/src/stores/globalSettings.ts`)

Manages CMS configuration through a combination of static files and a reactive store system:

- `/config/public.ts`: Defines the shape and default values for public, non-sensitive settings.
- `/config/private.ts`: Defines the shape and default values for private, sensitive settings (e.g., API keys, database credentials). This file is in `.gitignore`.
- `/src/stores/globalSettings.ts`: A reactive Svelte store that loads settings from the database at startup, providing a unified and type-safe way to access configuration throughout the application.

### 5. Content Management (`/src/content/`)

The `ContentManager` is the core service responsible for:

- Loading collection schemas from `/config/collections/`.
- Dynamically creating database models for each collection.
- Providing an API for content operations.

### 6. Widget System (`/src/widgets/`)

Extensible widget framework:

- Form inputs
- Content displays
- Media handlers
- Custom widgets

## Key Design Patterns

### 1. Dependency Injection

```typescript
// Example of dependency injection in service initialization
class ContentService {
	constructor(
		private db: DatabaseAdapter,
		private cache: CacheService,
		private events: EventEmitter
	) {}
}
```

### 2. Repository Pattern

```typescript
// Example repository implementation
class ContentRepository {
	constructor(private db: DatabaseAdapter) {}

	async findById(id: string): Promise<Content | null> {
		return this.db.query('SELECT * FROM content WHERE id = ?', [id]);
	}
}
```

### 3. Event-Driven Architecture

```typescript
// Event handling example
class ContentManager {
	async createContent(data: ContentData): Promise<Content> {
		const content = await this.repository.create(data);
		await this.events.emit('content:created', content);
		return content;
	}
}
```

### 4. Plugin System

```typescript
// Plugin registration
interface Plugin {
	name: string;
	version: string;
	initialize: (cms: CMS) => Promise<void>;
}

class PluginManager {
	async register(plugin: Plugin): Promise<void> {
		// Plugin registration logic
	}
}
```

## State Management

SvelteCMS uses a combination of:

1. Svelte stores for local state
2. Server-side state management
3. Cache layers for performance

Example store implementation:

```typescript
// Content store
import { writable } from 'svelte/store';

interface ContentState {
	items: Content[];
	loading: boolean;
	error: Error | null;
}

export const contentStore = writable<ContentState>({
	items: [],
	loading: false,
	error: null
});
```

## Routing Architecture

SvelteKit-based routing structure:

```
routes/
├── admin/
│   ├── content/
│   ├── users/
│   └── settings/
├── api/
│   ├── v1/
│   └── webhooks/
└── [slug]/
```

## Testing Strategy

1. **Unit Tests**
   - Component testing
   - Service testing
   - Utility function testing

2. **Integration Tests**
   - API endpoint testing
   - Database operations
   - Plugin interactions

3. **E2E Tests**
   - User flows
   - Admin operations
   - Content management

## Performance Considerations

1. **Code Splitting**
   - Route-based splitting
   - Component lazy loading
   - Dynamic imports

2. **Caching Strategy**
   - Content caching
   - API response caching
   - Static asset caching

3. **Database Optimization**
   - Query optimization
   - Index management
   - Connection pooling

## Security Measures

1. **Authentication**
   - JWT implementation
   - Session management
   - CSRF protection

2. **Authorization**
   - Role-based access
   - Permission system
   - Content restrictions

3. **Data Protection**
   - Input validation
   - Output sanitization
   - SQL injection prevention

## Build and Deployment

1. **Build Process**
   - TypeScript compilation
   - Asset optimization
   - Bundle generation

2. **Deployment Options**
   - Docker containerization
   - Cloud platform deployment
   - Traditional hosting

## Development Workflow

1. **Local Development**

   ```bash
   npm install        # Install dependencies
   npm run dev        # Start development server
   npm run build     # Build for production
   npm run preview   # Preview production build
   ```

2. **Code Quality**
   - ESLint configuration
   - Prettier formatting
   - TypeScript strict mode
   - Git hooks (husky)

## Contributing Guidelines

1. **Code Style**
   - Follow TypeScript best practices
   - Use Svelte component conventions
   - Maintain consistent naming

2. **Git Workflow**
   - Feature branch workflow
   - Pull request requirements
   - Commit message format

3. **Documentation**
   - Code documentation
   - API documentation
   - User documentation
