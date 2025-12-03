# SveltyCMS Documentation

This is the documentation site for SveltyCMS, built with **SvelteKit** and **MDX** support.

## Features

- 📝 **MDX Support**: Write documentation with Markdown and JSX components
- 🎨 **Skeleton UI**: Beautiful dark-mode documentation interface
- 🔍 **Syntax Highlighting**: Code blocks with highlight.js
- 🚀 **Fast Navigation**: SvelteKit's instant page transitions
- 📱 **Responsive**: Works on all devices

## Development

### Install Dependencies

```bash
bun install
```

### Run Dev Server

```bash
# Using NX (from workspace root)
bun x nx run docs:dev

# Or directly
cd apps/docs
bun run dev
```

The docs will be available at http://localhost:5174

### Build for Production

```bash
# Using NX
bun x nx run docs:build

# Or directly
cd apps/docs
bun run build
```

### Preview Production Build

```bash
bun x nx run docs:preview
```

## Project Structure

```
apps/docs/
├── src/
│   ├── routes/
│   │   ├── +layout.svelte        # Main layout with sidebar
│   │   ├── +page.svelte          # Home page
│   │   └── [...docs]/            # Dynamic docs routes
│   │       ├── +page.server.ts   # Server-side doc loading
│   │       └── +page.svelte      # Doc rendering
│   ├── lib/
│   │   ├── components/
│   │   │   ├── Header.svelte     # Top navigation
│   │   │   ├── Sidebar.svelte    # Left sidebar menu
│   │   │   └── Footer.svelte     # Footer
│   │   └── layouts/
│   │       └── MdsvexLayout.svelte # MDX layout
│   ├── app.html                   # HTML template
│   ├── app.postcss                # Global styles
│   └── app.d.ts                   # TypeScript types
├── api/                           # API docs (MDX)
├── architecture/                  # Architecture docs (MDX)
├── widgets/                       # Widget docs (MDX)
├── database/                      # Database docs (MDX)
├── testing/                       # Testing docs (MDX)
├── svelte.config.js               # SvelteKit config with mdsvex
├── vite.config.ts                 # Vite config
├── tailwind.config.ts             # Tailwind config
├── tsconfig.json                  # TypeScript config
└── package.json                   # Dependencies
```

## Writing Documentation

### MDX Files

Create `.mdx` or `.md` files anywhere in the docs folder:

```mdx
---
title: 'My Documentation Page'
description: 'A detailed guide'
icon: 'mdi:rocket-launch'
---

# My Documentation Page

Write your content here with **markdown** and _MDX_ features.

## Code Examples

\`\`\`typescript
const hello = "world";
console.log(hello);
\`\`\`

## Using Components

You can import and use Svelte components in MDX files!
```

### Frontmatter

Each doc should have frontmatter:

- `title`: Page title (required)
- `description`: Short description (optional)
- `icon`: Iconify icon name (optional)
- `order`: Display order (optional)
- `published`: Boolean visibility flag (optional)

## Navigation

The sidebar is configured in `src/lib/components/Sidebar.svelte`. Update the `sections` array to add or modify navigation links.

## Styling

- **Tailwind CSS**: Utility-first CSS framework
- **Skeleton Labs**: UI component library with dark mode
- **Typography Plugin**: Beautiful prose styles for markdown
- **Custom Styles**: In `src/app.postcss`

## MDX Configuration

MDX is configured in `svelte.config.js`:

- **Extensions**: `.md` and `.mdx`
- **Layout**: Default layout in `src/lib/layouts/MdsvexLayout.svelte`
- **Plugins**: Add remark/rehype plugins as needed

## Integration with docs.SveltyCMS

This setup is compatible with the existing [docs.SveltyCMS](https://github.com/SveltyCMS/docs.SveltyCMS) repository structure. You can:

1. Keep existing `.md` files (they work as-is)
2. Upgrade to `.mdx` for component support
3. Use the same frontmatter format
4. Maintain the same URL structure

## NX Commands

All available commands:

```bash
# Development
bun x nx run docs:dev

# Build
bun x nx run docs:build

# Preview
bun x nx run docs:preview

# Type checking
bun x nx run docs:check

# Lint markdown
bun x nx run docs:lint
```

## Tech Stack

- **SvelteKit 2.x**: Full-stack framework
- **Svelte 5**: Reactive UI framework
- **MDX**: Markdown + JSX
- **Skeleton Labs**: UI components
- **Tailwind CSS**: Styling
- **Vite 6**: Build tool
- **TypeScript**: Type safety
- **Bun**: Package manager & runtime

## License

MIT - See the main SveltyCMS repository for details.
