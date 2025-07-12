---
title: 'Configuration'
description: 'Configure SveltyCMS for your needs'
---

# Configuration Guide

SveltyCMS features an automated CLI installer that handles most configuration automatically. This guide covers both the automated setup and manual configuration options.

## Automated Configuration (Recommended)

### CLI Installer Setup

The CLI installer automatically runs when you start the development server without configuration files:

```bash
bun run dev  # CLI installer launches automatically
```

**The installer will guide you through:**

1. **Database Configuration**
   - MongoDB (recommended)
   - PostgreSQL
   - SQLite (for development)

2. **Administrator Account**
   - Email address
   - Username
   - Secure password

3. **Site Settings**
   - Site name and description
   - Default language
   - Theme preferences

4. **Security Configuration**
   - Session secrets
   - Encryption keys
   - CORS settings

5. **Email Setup (Optional)**
   - SMTP configuration
   - Email templates

6. **OAuth Integration (Optional)**
   - Google OAuth setup
   - Provider configuration

### Generated Configuration Files

After installation, these files are automatically created:

- `config/private.ts` - Sensitive settings (passwords, API keys)
- `config/public.ts` - Public configuration (features, API endpoints)
- `config/guiConfig.ts` - Interface customization
- `config/roles.ts` - User roles and permissions

## Manual Configuration (Advanced Users)

If you prefer manual setup or need to modify existing configuration:

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
