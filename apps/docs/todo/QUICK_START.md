# Quick Start - SveltyCMS Documentation

## 🚀 Running the Documentation Site

### From Workspace Root (Recommended)

```bash
# Start the docs server
bun x nx run docs:dev

# Visit http://localhost:5174
```

### From apps/docs Directory

```bash
cd apps/docs
bun run dev
```

## 📝 Adding New Documentation

### 1. Create a New MDX File

Create a file in any directory under `apps/docs/`:

```bash
# Example: Add a new API doc
touch apps/docs/api/my-new-api.mdx
```

### 2. Add Frontmatter

```mdx
---
title: 'My New API'
description: 'Description of the API'
icon: 'mdi:api'
published: true
order: 5
---

# My New API

Your content here...

## Example

\`\`\`typescript
const example = "Hello World";
\`\`\`
```

### 3. Add to Sidebar Navigation

Edit `apps/docs/src/lib/components/Sidebar.svelte`:

```typescript
const sections: DocSection[] = [
	{
		title: 'API Reference',
		links: [
			// Add your new page
			{ title: 'My New API', href: '/api/my-new-api', icon: 'mdi:api' }
		]
	}
];
```

### 4. View Your Doc

Navigate to: http://localhost:5174/api/my-new-api

## 🎨 Using MDX Features

### Import Svelte Components

```mdx
---
title: 'Interactive Example'
---

<script>import MyWidget from '$lib/components/MyWidget.svelte';</script>

# Interactive Documentation

<MyWidget prop="value" />

Continue with regular markdown...
```

### Add Code Examples

````mdx
## TypeScript Example

```typescript
interface User {
	id: string;
	name: string;
}

const user: User = {
	id: '123',
	name: 'John'
};
```
````

### Add Links

```mdx
See the [API Reference](/api) for more details.

External link: [SvelteKit](https://kit.svelte.dev/)
```

## 🔧 Common Tasks

### Build for Production

```bash
bun x nx run docs:build
```

Output: `apps/docs/build/`

### Preview Production Build

```bash
bun x nx run docs:preview
```

### Type Check

```bash
bun x nx run docs:check
```

### Lint Markdown

```bash
bun x nx run docs:lint
```

## 📁 File Organization

```
apps/docs/
├── api/              # API documentation
├── architecture/     # Architecture guides
├── widgets/          # Widget documentation
├── database/         # Database guides
├── testing/          # Testing guides
├── guides/           # General guides
└── src/              # SvelteKit app (don't edit unless customizing)
```

## 🎯 Best Practices

1. **Use Frontmatter**: Always add title, description, and icon
2. **Keep URLs Clean**: Use kebab-case for filenames (my-doc.mdx)
3. **Organize by Topic**: Keep related docs in same folder
4. **Add to Sidebar**: Update navigation for important pages
5. **Test Locally**: Always preview before committing
6. **Use Code Blocks**: Add language for syntax highlighting

## 🆘 Troubleshooting

### Server Won't Start

```bash
# Clean and reinstall
cd apps/docs
rm -rf node_modules .svelte-kit
bun install
bun run dev
```

### Page Not Found

1. Check file exists in correct location
2. Check frontmatter has `published: true`
3. Check URL matches filename
4. Restart dev server

### Styling Issues

1. Check Tailwind classes are correct
2. Verify prose classes in article wrapper
3. Check dark mode with `dark:` prefix

## 🔗 Useful Links

- [Full Documentation](./README.md)
- [Integration Summary](./INTEGRATION_SUMMARY.md)
- [MDsveX Docs](https://mdsvex.pngwn.io/)
- [Skeleton UI](https://www.skeleton.dev/)

## 💡 Tips

- **Hot Reload**: Changes auto-reload in dev mode
- **Dark Mode**: Toggle in browser (uses system preference)
- **Icons**: Browse icons at [Iconify](https://icon-sets.iconify.design/)
- **Prose Styles**: Automatic with `prose` class
- **Mobile**: Fully responsive out of the box

Happy documenting! 📚✨
