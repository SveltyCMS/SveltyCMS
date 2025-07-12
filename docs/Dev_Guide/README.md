# SveltyCMS Developer Guide

Welcome to the SveltyCMS Developer Guide. This documentation explains **how SveltyCMS works** under the hood and how to extend it.

## 🎯 Understanding SveltyCMS

### 🚀 Getting Started - How Setup Works

1. [Installation & Setup](./00_Installation/README.md)
   - **Automated CLI Installer** - How vite.config.ts triggers setup
   - **Configuration System** - Public/private config architecture
   - **Database Integration** - MongoDB, PostgreSQL, SQLite support

### 🔐 Security Architecture - How Authentication Works

2. [Authentication System](./01_Authentication/README.md)
   - **JWT Implementation** - Token generation and validation
   - **OAuth Integration** - Google OAuth flow
   - **Session Management** - Secure session handling

3. [Authorization System](./02_Authorization/README.md)
   - **Role-Based Access Control (RBAC)** - How permissions work
   - **Permission Guard** - Component-level security
   - **Field-Level Security** - Granular access control

### 🏗️ Core Architecture - How the System Works

4. [SvelteKit Architecture](./03_Code_Structure/README.md)
   - **Project Structure** - How files are organized
   - **Component System** - Svelte 5 patterns and runes
   - **Store Management** - State handling

5. [Configuration Management](./04_Config/README.md)
   - **Config File System** - How settings are managed
   - **Environment Variables** - Secure configuration
   - **Collection Definitions** - Dynamic content types

6. [Database Layer](./06_Database/README.md)
   - **Database Abstraction** - How data is stored
   - **Model Relationships** - How data connects
   - **Query Optimization** - Performance strategies

### 🧩 Content System - How Content Works

7. [Collections & Content](./05_Collections/README.md)
   - **Dynamic Collections** - How content types are created
   - **Field System** - Available field types and validation
   - **Content Relationships** - Linking content together

8. [Widget System](./07_Widgets/README.md)
   - **Widget Architecture** - How UI components work
   - **Custom Widget Development** - Building new widgets
   - **Widget API** - Integration patterns

9. [Media Management](./08_Media/README.md)
   - **File Upload System** - How files are processed
   - **Image Processing** - Automatic optimization
   - **Storage Backends** - File storage options

### ⚡ Advanced Systems - How Extensions Work

10. [System Core](./09_System/README.md)
    - **Event System** - How components communicate
    - **Cache Management** - Performance optimization
    - **Background Processing** - Async operations

11. [Extension Development](./12_Extensions/README.md)
    - **Plugin Architecture** - How extensions integrate
    - **Hook System** - Event-driven development
    - **API Extensions** - Extending functionality

### � Implementation References

12. [API Reference](./API_User_Token_Management.md)
    - **REST Endpoints** - Complete API documentation
    - **GraphQL Schema** - Query interface
    - **Authentication Headers** - Security implementation

13. [Svelte 5 Patterns](./Svelte5_Patterns.md)
    - **Modern Patterns** - Best practices with runes
    - **Migration Guide** - Upgrading from Svelte 4
    - **Performance Tips** - Optimization strategies

## 🛠️ Development Workflow

### Quick Setup

```bash
git clone https://github.com/SveltyCMS/SveltyCMS.git
cd SveltyCMS
bun install
bun run dev  # CLI installer launches automatically
```

### Key Concepts

- **Automatic Configuration**: CLI installer handles all setup via vite.config.ts
- **Type Safety**: Full TypeScript integration throughout
- **Component Architecture**: Svelte 5 with reactive runes
- **Security First**: Built-in authentication and authorization

### Development Tools

- **Package Manager**: npm, pnpm, or bun supported
- **Development Server**: Hot reload on `localhost:5173`
- **Database**: MongoDB recommended, SQLite for development
- **Code Quality**: ESLint, Prettier, TypeScript checking

## 🤝 Contributing

See our [Contributing Guidelines](../../CONTRIBUTING.md) for code standards and submission process.

## 🆘 Support

- [GitHub Issues](https://github.com/SveltyCMS/SveltyCMS/issues)
- [GitHub Discussions](https://github.com/SveltyCMS/SveltyCMS/discussions)
- [Developer Chat](https://discord.gg/sveltycms)
