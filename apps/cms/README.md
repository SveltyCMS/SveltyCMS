# CMS Application

The main SveltyCMS headless CMS application.

## Purpose

The full-featured CMS for content management, including:
- Content editing and management
- Media library
- Collection builder
- Image editor
- User management
- API endpoints
- GraphQL server

## Future Modularization Plan

The CMS may be further split into micro-apps:
- **apps/cms-core**: Main CMS functionality
- **apps/cms-media**: Media management (if needed as separate workspace)
- **apps/cms-config**: Configuration tools (imageEditor, collectionBuilder)

## Structure

```
apps/cms/
├── src/
│   ├── routes/
│   │   ├── (app)/       # Main CMS routes
│   │   ├── api/         # API endpoints
│   │   ├── login/       # Authentication
│   │   └── files/       # File management
│   ├── components/      # CMS-specific components
│   └── lib/             # CMS utilities
├── static/              # Static assets
├── project.json         # Nx project configuration
├── vite.config.ts       # Vite configuration
├── svelte.config.js     # Svelte configuration
└── tsconfig.json        # TypeScript configuration
```

## Development

```bash
# Run development server
nx dev cms

# Build for production
nx build cms

# Preview production build
nx preview cms
```

## Features

### Content Management
- Rich text editor (TipTap)
- Collection-based content
- Draft and revision system
- Media management

### API
- REST API endpoints
- GraphQL server
- WebSocket support
- OAuth integration

### Configuration
- Collection builder
- Image editor
- Widget system
- Theme customization

## Conditional Database Loading

The CMS loads only the configured database driver:

```typescript
// Database adapter loaded based on configuration
const adapter = await loadDatabaseAdapter();
```

This ensures:
- MongoDB code is excluded if using Drizzle
- Drizzle code is excluded if using MongoDB
- Smaller production bundles
- Faster startup times

## Dependencies

- **Required**: All @shared libraries
- **Optional**: Database drivers (loaded conditionally)

## Performance

### Bundle Optimization
- Code splitting by route
- Lazy loading for heavy components
- Tree-shaking for unused exports
- Dynamic imports for optional features

### Caching Strategy
- Nx cache for builds
- SvelteKit adapter caching
- Database query caching
- Redis for session storage

## API Endpoints

### REST API
- `/api/collections` - Collection management
- `/api/media` - Media operations
- `/api/auth` - Authentication
- `/api/users` - User management

### GraphQL
- `/api/graphql` - GraphQL endpoint
- WebSocket subscriptions supported

## Environment Variables

Required:
- `DATABASE_URL` - Database connection string
- `SECRET_KEY` - Session secret

Optional:
- `REDIS_URL` - Redis connection
- `AWS_*` - AWS S3 configuration
- `CLOUDINARY_*` - Cloudinary configuration
- `MAPBOX_TOKEN` - Mapbox integration

## Deployment

Independent deployment from setup wizard:

```bash
# Build
nx build cms

# Deploy the dist/apps/cms directory
```

## Security

- Rate limiting
- CSRF protection
- XSS prevention
- SQL injection protection (via ORM)
- Content Security Policy

## Testing

```bash
# Unit tests
nx test cms

# Integration tests
nx test cms --configuration=integration

# E2E tests
nx test cms --configuration=e2e
```

## Bundle Size Target

Target: < 500KB initial (gzipped)
- Route-based code splitting
- Lazy-loaded features
- Optimized dependencies
