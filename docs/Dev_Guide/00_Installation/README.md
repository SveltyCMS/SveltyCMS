# Installation & Setup

This section explains **how SveltyCMS setup works** - from the automated CLI installer to the underlying configuration system.

## How Setup Works

### 🚀 [Automated CLI Installer](./03-Installation.md)

**How vite.config.ts triggers setup**

- Automatic detection of missing config files
- Interactive setup process
- Database configuration
- Admin account creation

### ⚙️ [Configuration System](./04-Configuration.md)

**Public/private config architecture**

- Public vs private configuration
- Environment variable management
- Security settings
- Collection definitions

### 🗄️ [Database Integration](./Database_Integration.md)

**MongoDB, PostgreSQL, SQLite support**

- Database abstraction layer
- Connection management
- Migration strategies
- Performance optimization

### 📋 [Prerequisites](./05-Prerequisites.md)

**System requirements and dependencies**

- Node.js/Bun requirements
- Database setup
- Development tools
- Environment preparation

### 🚀 [Getting Started](./01-Getting-started.md)

**Quick start guide for developers**

- Repository setup
- First-time installation
- Development workflow
- Common setup issues

## Key Concepts

- **Automated Setup**: CLI installer handles all configuration automatically
- **Smart Detection**: Setup only runs when config files are missing
- **Database Agnostic**: Support for multiple database types
- **Secure by Default**: Automatic security configuration
- **TypeScript First**: Full type safety from installation

## Quick Setup

```bash
git clone https://github.com/SveltyCMS/SveltyCMS.git
cd SveltyCMS
bun install
bun run dev  # CLI installer launches automatically
```

The CLI installer will guide you through:

1. Database selection and configuration
2. Administrator account creation
3. Security settings (JWT secrets, encryption)
4. Optional email/OAuth setup
5. Site configuration and preferences
