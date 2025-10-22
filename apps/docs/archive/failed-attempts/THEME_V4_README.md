# @sveltycms/theme-v4

**Enterprise-focused theme package for SveltyCMS** - Tailwind v4 + Skeleton v4 compatible.

## 🎨 Enterprise Theme Strategy

**Primary: Blue** `#0078f0` (Trust & Professionalism)  
**Brand: Green** `#5fd317` (SveltyCMS Identity)

### Why This Matters

- **72% of SaaS companies use blue** (industry standard)
- **Matches enterprise expectations** (Drupal Gin, Payload CMS, GitHub)
- **Appeals to Fortune 500 customers** (trust, stability, reliability)
- **Keeps your unique identity** (green for branding, CTAs, success)

See [Theme Analysis](../../docs/architecture/THEME_ANALYSIS_ENTERPRISE.md) for full research.

## ✨ Features

- ✅ **OKLCH Colors** - Modern, perceptually uniform
- ✅ **Dark Mode Optimized** - Default for developers/enterprise
- ✅ **Tailwind v4 Ready** - CSS-first configuration
- ✅ **Skeleton v4 Compatible** - Modern Svelte UI framework
- ✅ **Reusable** - Setup wizard, main CMS, future apps

## 📦 Installation

```bash
# In your SvelteKit app
bun add @sveltycms/theme-v4@workspace:*
```

## 🚀 Quick Start

### 1. Import theme in app.css

```css
/* src/app.css */
@import '@sveltycms/theme-v4/base';
@import '@sveltycms/theme-v4/theme';
```

### 2. Add data-theme to HTML

```html
<!-- src/app.html -->
<html lang="en" data-theme="sveltycms"></html>
```

### 3. Use in components

```svelte
<!-- Primary = Blue (enterprise) -->
<button class="btn-primary">Save Changes</button>

<!-- Tertiary = Green (brand accent) -->
<button class="btn-tertiary">Create New</button>

<!-- Success = Emerald -->
<div class="alert-success">Success!</div>
```

## 🎨 Color System

| Color                  | Hex     | Use For                             |
| ---------------------- | ------- | ----------------------------------- |
| **Primary (Blue)**     | #0078f0 | Main UI, buttons, links, navigation |
| **Secondary (Gray)**   | #757575 | Borders, dividers, secondary text   |
| **Tertiary (Green)**   | #5fd317 | Logo, branding, CTAs, celebrations  |
| **Success (Emerald)**  | #10b981 | Success messages, confirmations     |
| **Warning (Amber)**    | #f59e0b | Warnings, cautions                  |
| **Error (Red)**        | #eb0000 | Errors, destructive actions         |
| **Surface (Charcoal)** | #242728 | Dark backgrounds, cards             |

## 🔄 What Changed from v0.1.0

### Before (v0.1.0)

- Primary: Green (brand-first)
- Tertiary: Blue (accent)

### After (v0.2.0 - Enterprise)

- Primary: Blue ← **SWAPPED!** (enterprise trust)
- Tertiary: Green ← **Brand accent** (distinctive)

**No code changes needed** if using semantic classes!

## 📖 Documentation

- [Enterprise Theme Analysis](../../docs/architecture/THEME_ANALYSIS_ENTERPRISE.md)
- [Reusable v4 Strategy](../../apps/REUSABLE_SKELETON_V4_STRATEGY.md)
- [Main CMS Migration](../../docs/MAIN_CMS_V4_MIGRATION_ROADMAP.md)

## 📄 License

MIT © SveltyCMS Team
