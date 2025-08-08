---
title: SveltyCMS Documentation
description: Complete documentation for SveltyCMS - a powerful, modern Headless CMS built with SvelteKit and Svelte 5. Designed for both users and developers.
type: user
icon: mdi:book-open-variant
folder: 01-getting-started
order: 10
created: 2025-08-05
updated: 2025-08-05
---

# SveltyCMS Documentation

Welcome to SveltyCMS - a powerful, modern Headless CMS built with SvelteKit and Svelte 5. Our documentation is designed with two clear goals:

## 🎯 Documentation Goals

### 👥 **For Users**: Understand Every Feature + Feel Confident About Security

- Complete feature guides with security confidence
- Built-in safety features explained
- Best practices for secure content management

### 🛠️ **For Developers**: Understand How SveltyCMS Works

- Deep dive into architecture and systems
- Implementation patterns and best practices
- Extension and customization guides

## 📚 Choose Your Path

### 👥 [User Guide](./User_Guide/README.md) - **Features & Security Confidence**

Perfect for content creators, editors, and administrators who need to:

- ✅ **Use Features Safely** - Complete guides with security best practices
- ✅ **Manage Content** - Create, edit, and publish with confidence
- ✅ **Understand Security** - Built-in protection features explained
- ✅ **Troubleshoot Issues** - Safe solutions to common problems

**Key Security Highlights:**

- 🛡️ Enterprise-grade authentication (JWT + OAuth)
- 🔐 Role-based permissions and access control
- 🔒 Encrypted data storage and transmission
- 📊 Audit logging and activity tracking

### 🛠️ [Developer Guide](./Dev_Guide/README.md) - **How It Works**

Essential for developers who need to understand:

- ⚙️ **System Architecture** - How components work together
- 🔧 **Setup & Configuration** - Automated CLI installer explained
- 🧩 **Extension Development** - Building custom functionality
- 📡 **API Integration** - REST and GraphQL implementation

**Core Systems Explained:**

- 🚀 Automated setup via vite.config.ts
- 🔐 JWT + OAuth authentication flow
- 🏗️ SvelteKit + Svelte 5 architecture
- 📊 Database abstraction and optimization

## 🚀 Quick Start

### For Users (Content Management)

```
1. 🌐 Access your CMS URL
2. 🔑 Log in securely
3. 📝 Start creating content
4. 🛡️ Enjoy built-in security
```

### For Developers (Technical Setup)

```bash
git clone https://github.com/SveltyCMS/SveltyCMS.git
cd SveltyCMS
bun install
bun run dev  # CLI installer launches automatically
```

## 🔧 Key Features & Security

- **🎨 Modern Interface**: Built with SvelteKit and Tailwind CSS
- **🚀 Automated Setup**: CLI installer handles all configuration
- **🔐 Security First**: JWT + OAuth with granular permissions
- **📱 Responsive**: Works seamlessly on all devices
- **🌍 i18n Ready**: Multi-language support built-in
- **⚡ Performance**: Optimized for speed and efficiency
- **🧩 Extensible**: Custom widgets, themes, and plugins

## 📖 Essential Documentation

### User Documentation (Security-Focused)

- [🚀 First Steps](./User_Guide/00_Getting_Started/First_Steps.md) - Get started safely
- [👥 User Registration](./User_Guide/User_Registration.md) - Secure account creation
- [🛡️ Admin Management](./User_Guide/Admin_User_Management.md) - Secure administration
- [❓ FAQ](./User_Guide/17_FAQ/README.md) - Common security questions

### Developer Documentation (How It Works)

- [⚙️ Installation & Setup](./Dev_Guide/00_Installation/README.md) - Automated installer explained
- [🔐 Authentication System](./Dev_Guide/01_Authentication/README.md) - Security implementation
- [📡 API Reference](./Dev_Guide/API_User_Token_Management.md) - Complete API docs
- [🧩 Svelte 5 Patterns](./Dev_Guide/Svelte5_Patterns.md) - Modern development patterns

## 🛡️ Security Promise

SveltyCMS is designed with security as a core principle:

- **🔒 Data Protection**: All data encrypted at rest and in transit
- **🛡️ Access Control**: Granular role-based permissions
- **📝 Audit Logging**: Complete activity tracking
- **🔍 Input Validation**: Automatic sanitization and validation
- **🚨 Security Updates**: Regular security patches and updates

## 🆘 Getting Help

- **[GitHub Issues](https://github.com/SveltyCMS/SveltyCMS/issues)** - Bug reports and feature requests
- **[GitHub Discussions](https://github.com/SveltyCMS/SveltyCMS/discussions)** - Community support
- **[Security Reports](mailto:security@sveltycms.dev)** - Responsible disclosure

## 📋 System Requirements

- **Browser**: Chrome, Firefox, Safari, Edge (latest versions)
- **JavaScript**: Required (security features depend on it)
- **Node.js**: 18+ for development
- **Database**: MongoDB (recommended) or PostgreSQL/SQLite

---

**New to SveltyCMS?** Start with [First Steps](./User_Guide/00_Getting_Started/First_Steps.md) for users or [Installation](./Dev_Guide/00_Installation/README.md) for developers.
