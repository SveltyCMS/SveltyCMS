---
title: 'Installing SveltyCMS'
description: 'Step-by-step guide to install SveltyCMS on your system'
---

# Installation Guide

This guide will walk you through the process of installing SveltyCMS on your system.

## Quick Installation

```bash
# Create new SveltyCMS project
npm create sveltycms@latest my-cms-project

# Navigate to project directory
cd my-cms-project

# Install dependencies
npm install
```

## Project Structure

After installation, your project will have the following structure:

```
my-cms-project/
├── src/
│   ├── auth/           # Authentication related components
│   ├── collections/    # Collection definitions and handlers
│   ├── components/     # Reusable UI components
│   ├── databases/      # Database configurations
│   ├── messages/       # Internationalization messages
│   ├── routes/         # Application routes
│   ├── stores/         # Svelte stores
│   ├── themes/         # Theme configurations
│   └── utils/          # Utility functions
├── config/
│   ├── collections/    # Collection configurations
│   ├── guiConfig.ts    # GUI configuration
│   ├── private.ts      # Private configuration
│   ├── public.ts       # Public configuration
│   └── types.ts        # TypeScript type definitions
├── src/routes/setup/guiConfig.ts  # GUI configuration
├── static/            # Static assets
└── package.json
```

## Configuration

1. Create a `.env` file in your project root:

```env
DATABASE_URL=mongodb://localhost:27017/sveltycms
SESSION_SECRET=your-secure-session-secret
ADMIN_EMAIL=admin@example.com
```

2. Configure your database:
   - Start MongoDB service
   - Create a new database
   - Update DATABASE_URL in `.env` if needed

## Next Steps

- [Configuration Guide](./04-Configuration.mdx)
- [Running SveltyCMS](./06-Running.md)
- [Troubleshooting](./07-Troubleshooting.md)
