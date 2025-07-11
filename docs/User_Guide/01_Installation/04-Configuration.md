---
title: 'Configuration'
description: 'Configure SveltyCMS for your needs'
---

# Configuration Guide

SveltyCMS configuration is split into several key areas for better organization and security.

## Core Configuration Files

### 1. Environment Variables (.env)

Create a `.env` file in your project root with these essential variables:

```env
DATABASE_URL=mongodb://localhost:27017/sveltycms
SESSION_SECRET=your-secure-session-secret
ADMIN_EMAIL=admin@example.com
NODE_ENV=development
```

### 2. GUI Configuration (config/guiConfig.ts)

Controls the admin interface appearance and behavior:

```typescript
// config/guiConfig.ts
export default {
	site: {
		name: 'Your Site Name',
		description: 'Your site description',
		logo: '/path/to/logo.png'
	},
	theme: {
		primary: '#007bff',
		secondary: '#6c757d'
	}
};
```

### 3. Public Configuration (config/public.ts)

Contains publicly accessible configuration:

```typescript
// config/public.ts
export default {
	api: {
		baseUrl: '/api',
		version: 'v1'
	},
	features: {
		registration: true,
		passwordReset: true
	}
};
```

### 4. Private Configuration (config/private.ts)

Sensitive settings (ensure this is not exposed):

```typescript
// config/private.ts
export default {
	security: {
		passwordMinLength: 8,
		maxLoginAttempts: 5
	},
	email: {
		from: 'noreply@yourdomain.com'
	}
};
```

## Collection Configuration

Collections are defined in `config/collections/`:

```typescript
// config/collections/posts.ts
export default {
	name: 'posts',
	fields: [
		{
			name: 'title',
			type: 'string',
			required: true
		},
		{
			name: 'content',
			type: 'richtext'
		}
	],
	permissions: {
		create: ['admin', 'editor'],
		read: ['public'],
		update: ['admin', 'editor'],
		delete: ['admin']
	}
};
```

## Role Configuration (config/roles.ts)

Define user roles and permissions:

```typescript
// config/roles.ts
export default {
	admin: {
		name: 'Administrator',
		permissions: ['*']
	},
	editor: {
		name: 'Editor',
		permissions: ['create:post', 'update:post', 'read:*']
	}
};
```

## Next Steps

- [Running the CMS](./06-Running.md)
- [Authentication Setup](../auth/01-Authentication.md)
- [Working with Collections](../collections/01-Collections.md)
