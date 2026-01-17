# SveltyCMS Frontend - Live Preview Application

A standalone SvelteKit application for live preview of content using SveltyCMS REST API or GraphQL endpoints.

## Features

- 📱 **Live Preview**: Real-time content preview as you edit in the CMS
- 🔌 **API Integration**: Connects to SveltyCMS via REST API or GraphQL
- 🎨 **Customizable**: Build your own frontend design while using SveltyCMS as backend
- ⚡ **Fast & Lightweight**: Minimal bundle size for optimal performance
- 🔒 **Secure**: Read-only access to published content

## Quick Start

```bash
# Development
nx dev frontend

# Build
nx build frontend

# Preview
nx preview frontend
```

## API Configuration

### REST API
```javascript
// src/lib/config.ts
export const API_URL = 'http://localhost:5173/api';
```

### GraphQL
```javascript
// src/lib/config.ts
export const GRAPHQL_URL = 'http://localhost:5173/api/graphql';
```

## Example Usage

### Fetch Posts via REST
```typescript
import { API_URL } from '$lib/config';

const response = await fetch(`${API_URL}/collections/posts?limit=10`);
const posts = await response.json();
```

### Fetch Posts via GraphQL
```typescript
import { GRAPHQL_URL } from '$lib/config';

const query = `
  query {
    posts(limit: 10) {
      id
      title
      slug
      content
    }
  }
`;

const response = await fetch(GRAPHQL_URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query })
});
const { data } = await response.json();
```

## Live Preview Setup

The frontend app runs on a separate port (5174) from the CMS (5173), allowing you to:

1. Edit content in the CMS admin panel
2. See live updates in the frontend preview
3. Test responsive designs and layouts
4. Verify content rendering before publishing

## Deployment

Build the frontend separately for deployment to:
- Vercel / Netlify / Cloudflare Pages (SSR or static)
- Your own Node.js server
- Docker container

## Architecture

```
apps/frontend/
├── src/
│   ├── routes/          # SvelteKit routes
│   ├── lib/             # Shared utilities and API clients
│   │   ├── api/         # REST API client
│   │   ├── graphql/     # GraphQL client
│   │   └── config.ts    # Configuration
│   └── app.html         # HTML template
├── static/              # Static assets
├── svelte.config.js     # SvelteKit config
├── vite.config.ts       # Vite config
└── project.json         # Nx project config
```

## Customization

This is a minimal starter. Customize it to build:
- Marketing websites
- Blogs
- E-commerce frontends
- Mobile app backends
- Custom dashboards

## Learn More

- [SveltyCMS REST API Documentation](../../docs/api/rest-api.md)
- [SveltyCMS GraphQL Documentation](../../docs/api/graphql.md)
- [SvelteKit Documentation](https://kit.svelte.dev)
