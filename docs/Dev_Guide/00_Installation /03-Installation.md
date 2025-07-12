---
title: 'Installing SveltyCMS'
description: 'Step-by-step guide to install SveltyCMS on your system'
---

# Installation Guide

This guide will walk you through the process of installing SveltyCMS on your system.

## Quick Installation

```bash
# Clone the repository
git clone https://github.com/SveltyCMS/SveltyCMS.git
cd SveltyCMS

# Install dependencies
bun install
# or npm install

# Start development server (CLI installer launches automatically)
bun run dev
# or npm run dev
```

## Automated Setup Process

SveltyCMS features an intelligent CLI installer that:

1. **Detects Missing Configuration** - Automatically runs when config files are missing
2. **Interactive Setup** - Guides you through all configuration options
3. **Database Setup** - Configures your chosen database (MongoDB, PostgreSQL, SQLite)
4. **Admin Account Creation** - Creates your first administrator account
5. **Environment Configuration** - Sets up all necessary environment variables

### CLI Installer Features

- **Smart Detection**: Automatically launches when starting dev server without config
- **Multiple Database Support**: Choose from MongoDB, PostgreSQL, or SQLite
- **Security Configuration**: Sets up authentication, encryption, and security headers
- **Email Setup**: Configures SMTP for user invitations and notifications
- **OAuth Integration**: Optional Google OAuth setup
- **Multi-language Support**: Configure supported languages and default locale

## Manual Installation (Alternative)

If you prefer manual setup:

```bash
# Run the installer manually
bun run installer
# or npm run installer

# Follow the interactive prompts to configure your CMS
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

- [Configuration Guide](./04-Configuration.md)
- [Running SveltyCMS](./06-Running.md)
- [Troubleshooting](./07-Troubleshooting.md)
