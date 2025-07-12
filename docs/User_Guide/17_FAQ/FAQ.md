---
title: 'Frequently Asked Questions'
description: 'Common questions and answers about SveltyCMS'
icon: 'mdi:frequently-asked-questions'
---

# Frequently Asked Questions (FAQ)

Common questions and answers about SveltyCMS, covering installation, configuration, usage, and troubleshooting.

## General Questions

### What is SveltyCMS?

SveltyCMS is a modern, TypeScript-based headless CMS built with SvelteKit. It provides a flexible, extensible platform for content management with features like:

- Type-safe content modeling
- GraphQL and REST APIs
- Plugin system
- Multi-language support
- Media management
- Role-based access control

### Why choose SveltyCMS?

- **Modern Stack**: Built with SvelteKit, TypeScript, and modern web technologies
- **Type Safety**: Full TypeScript support for type-safe content modeling
- **Flexibility**: Extensible plugin system and customizable workflows
- **Performance**: Optimized for speed with built-in caching and CDN support
- **Developer Experience**: Great DX with hot reloading and developer tools

### What's the difference between SveltyCMS and other CMSs?

- **Type Safety**: Built with TypeScript for better reliability
- **Modern Architecture**: Uses SvelteKit for better performance
- **Developer Focus**: Prioritizes developer experience
- **Flexibility**: More customizable than traditional CMSs
- **API-First**: Built as a headless CMS from the ground up

## Installation & Setup

### What are the system requirements?

- Node.js 18 or later
- MongoDB 5.0 or later
- 2GB RAM minimum
- 1GB disk space
- Modern web browser

### How do I install SveltyCMS?

```bash
# Create new project
npm create sveltycms@latest my-cms

# Install dependencies
cd my-cms
npm install

# Start development server
npm run dev
```

### How do I upgrade SveltyCMS?

```bash
# Update dependencies
npm update @sveltycms/core

# Run migrations
npx sveltycms migrate

# Clear cache
npx sveltycms cache clear
```

## Content Management

### How do I create a new content type?

```typescript
// content-types/article.ts
export default {
	name: 'article',
	fields: {
		title: { type: 'string', required: true },
		content: { type: 'richtext' },
		author: { type: 'reference', to: 'user' },
		tags: { type: 'array', of: { type: 'string' } }
	}
};
```

### How do I handle file uploads?

```typescript
// config/media.ts
export default {
	storage: {
		provider: 'local', // or 's3', 'cloudinary'
		path: 'uploads',
		allowedTypes: ['image/*', 'application/pdf'],
		maxSize: '10MB'
	}
};
```

### How do I implement content versioning?

Content versioning is built-in. Enable it in your content type:

```typescript
export default {
	name: 'article',
	versioning: {
		enabled: true,
		maxVersions: 10
	}
};
```

## Internationalization

### How do I enable multiple languages?

```typescript
// config/i18n.ts
export default {
	defaultLanguage: 'en',
	languages: ['en', 'de', 'fr'],
	fallbackLanguage: 'en'
};
```

### How do I translate content?

Content translation is handled per field:

```typescript
export default {
	name: 'article',
	fields: {
		title: {
			type: 'string',
			i18n: true // Enable translation
		}
	}
};
```

## Security

### How do I configure authentication?

```typescript
// config/auth.ts
export default {
	providers: {
		local: {
			enabled: true,
			// Enable 2FA
			twoFactor: {
				enabled: true,
				type: 'totp'
			}
		},
		oauth: {
			github: {
				clientId: process.env.GITHUB_CLIENT_ID,
				clientSecret: process.env.GITHUB_CLIENT_SECRET
			}
		}
	}
};
```

### How do I set up roles and permissions?

```typescript
// config/roles.ts
export default {
	roles: {
		editor: {
			permissions: ['content.read', 'content.create', 'content.update']
		}
	}
};
```

## Performance

### How do I optimize performance?

1. Enable caching:

```typescript
// config/cache.ts
export default {
	provider: 'redis',
	ttl: 3600,
	prefix: 'cms:'
};
```

2. Use CDN for media:

```typescript
// config/media.ts
export default {
	cdn: {
		enabled: true,
		provider: 'cloudfront',
		domain: 'https://cdn.example.com'
	}
};
```

### How do I monitor performance?

```typescript
// config/monitoring.ts
export default {
	metrics: {
		enabled: true,
		provider: 'prometheus'
	},
	tracing: {
		enabled: true,
		provider: 'opentelemetry'
	}
};
```

## Development

### How do I create a plugin?

Start with the plugin template:

```bash
npx create-sveltycms-plugin my-plugin
```

Basic plugin structure:

```typescript
// plugins/my-plugin/index.ts
export default {
	name: 'my-plugin',
	version: '1.0.0',
	install: (cms) => {
		// Plugin initialization
	}
};
```

### How do I extend the API?

Create custom endpoints:

```typescript
// plugins/my-plugin/api.ts
export const endpoints = {
	'GET /api/custom': async (ctx) => {
		// Handle request
		return { data: 'custom response' };
	}
};
```

### How do I add custom UI components?

```typescript
// plugins/my-plugin/components/Widget.svelte
<script lang="ts">
  export let data: any;
</script>

<div class="widget">
  <!-- Widget content -->
</div>
```

## Deployment

### How do I deploy to production?

1. Build the application:

```bash
npm run build
```

2. Set environment variables:

```bash
# .env.production
DATABASE_URL=mongodb://...
SESSION_SECRET=...
```

3. Start the server:

```bash
npm run start
```

### How do I deploy with Docker?

```dockerfile
# Dockerfile
FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm install
RUN npm run build
CMD ["npm", "run", "start"]
```

```bash
# Build and run
docker build -t sveltycms .
docker run -p 3000:3000 sveltycms
```

## Troubleshooting

### How do I debug issues?

1. Enable debug mode:

```bash
DEBUG=sveltycms:* npm run dev
```

2. Check logs:

```bash
tail -f logs/error.log
```

### How do I report bugs?

1. Check existing issues on GitHub
2. Create a new issue with:
   - Steps to reproduce
   - Expected behavior
   - Actual behavior
   - System information
   - Error logs

## Getting Help

### Where can I find more help?

- [Documentation](../index.md)
- [Discord Community](https://discord.gg/sveltycms)
- [GitHub Issues](https://github.com/SveltyCMS/SveltyCMS/issues)
- [Stack Overflow](https://stackoverflow.com/questions/tagged/sveltycms)

### How do I contribute?

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Write tests
5. Submit a pull request

## Best Practices

### What are some security best practices?

1. Keep dependencies updated
2. Use environment variables
3. Enable 2FA
4. Regular backups
5. Monitor logs

### What are some performance best practices?

1. Enable caching
2. Use CDN
3. Optimize images
4. Monitor metrics
5. Regular maintenance

## Need More Help?

If you can't find an answer to your question:

1. Check the [Documentation](../index.md)
2. Join our [Discord](https://discord.gg/sveltycms)
3. Open an [Issue](https://github.com/SveltyCMS/SveltyCMS/issues)
4. Contact [Support](mailto:support@sveltycms.com)
