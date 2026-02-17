# Contributing to SveltyCMS

First off, thank you for considering contributing to SveltyCMS! It's people like you that make this project such a great tool for the community.

---

## 📚 Documentation

Before you start, please familiarize yourself with our documentation:

- **[Installation Guide](docs/installation.mdx)** - How to set up your development environment
- **[Getting Started](docs/getting-started.mdx)** - Quick start guide for new contributors
- **[API Documentation](docs/api/)** - Complete API reference for all endpoints
- **[Widget System](docs/widgets/)** - How to create and customize widgets
- **[Troubleshooting](docs/troubleshooting.mdx)** - Common issues and solutions

---

## 🚀 How Can I Contribute?

### Reporting Bugs

Found a bug? Help us improve by reporting it!

**Before submitting a bug report:**

1. Check the [Troubleshooting Guide](docs/troubleshooting.mdx) for known issues
2. Search [existing issues](https://github.com/SveltyCMS/SveltyCMS/issues) to avoid duplicates
3. Ensure you're using the latest version

**When submitting a bug report, include:**

- **Environment details:**
  - OS (Windows/macOS/Linux)
  - Node.js version (`node --version`)
  - Package manager (npm/bun/yarn/pnpm)
  - Database type and version
- **Steps to reproduce** the issue
- **Expected behavior** vs **actual behavior**
- **Error messages** (full stack trace if available)
- **Screenshots** (if applicable)
- **Relevant logs** from `logs/app.log`

**Template:**

```markdown
**Environment:**

- OS: Ubuntu 22.04
- Node: v20.10.0
- Database: MongoDB 7.0

**Steps to Reproduce:**

1. Navigate to Settings → Collections
2. Click "Create Collection"
3. Fill in form and click Save

**Expected:** Collection should be created
**Actual:** Error message "Cannot read property 'name'"

**Error Log:**
```

TypeError: Cannot read properties of undefined (reading 'name')
at create (src/routes/api/collections/+server.ts:45)

```

```

---

### Suggesting Enhancements

Have an idea for a new feature or improvement?

**Before submitting:**

1. Check [existing feature requests](https://github.com/SveltyCMS/SveltyCMS/issues?q=is%3Aissue+is%3Aopen+label%3Aenhancement)
2. Review our [roadmap](https://github.com/SveltyCMS/SveltyCMS/projects)

**When suggesting an enhancement:**

- **Use a clear and descriptive title**
- **Provide a detailed description** of the proposed feature
- **Explain why this enhancement would be useful** to users
- **Describe alternatives** you've considered
- **Include mockups or examples** if applicable

---

### Pull Requests

Ready to contribute code? Awesome! Here's how:

#### 1. Setup Development Environment

```bash
# Fork and clone the repository
git clone https://github.com/YOUR-USERNAME/SveltyCMS.git
cd SveltyCMS

# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Configure your database in .env
# Then run the development server
npm run dev
```

See the [Installation Guide](docs/installation.mdx) for detailed setup instructions.

#### 2. Create a Branch

```bash
# Create a new branch from main
git checkout -b feature/my-awesome-feature

# Or for bug fixes
git checkout -b fix/issue-123
```

**Branch naming conventions:**

- `feature/` - New features or enhancements
- `fix/` - Bug fixes
- `docs/` - Documentation updates
- `refactor/` - Code refactoring
- `test/` - Adding or updating tests
- `chore/` - Maintenance tasks

#### 3. Make Your Changes

**Guidelines:**

- ✅ **One feature/fix per pull request**
- ✅ **Follow the existing code style** (Hybrid Biome/ESLint will help)
- ✅ **Write meaningful commit messages**
- ✅ **Add tests** for new features
- ✅ **Update documentation** if needed
- ✅ **Keep changes focused** and minimal

**Code Style:**

- Use TypeScript for all `.ts` files
- Follow Hybrid rules: `npm run lint` (Biome + ESLint)
- Fast Format code: `npm run format` (Biome)
- Use meaningful variable names
- Add JSDoc comments for complex functions
- Ensure database-agnostic patterns (see [API Documentation](docs/api/Database_Agnostic_Verification.mdx))

#### 4. Test Your Changes

```bash
# Run linter
npm run lint

# Run type checker
npm run check

# Run tests
npm test

# Run specific tests
npm test -- path/to/test.spec.ts
```

See our [Testing Guide](docs/TESTING_GUIDE.md) for more details.

#### 5. Commit Your Changes

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```bash
# Format: <type>(<scope>): <subject>

git commit -m "feat(collections): add duplicate collection feature"
git commit -m "fix(auth): resolve session timeout issue"
git commit -m "docs(api): update authentication endpoints"
```

**Commit types:**

- `feat` - New feature
- `fix` - Bug fix
- `docs` - Documentation only
- `style` - Code style/formatting
- `refactor` - Code restructuring
- `test` - Adding/updating tests
- `chore` - Maintenance tasks
- `perf` - Performance improvements

#### 6. Push and Create Pull Request

```bash
# Push your branch
git push origin feature/my-awesome-feature

# Create a PR on GitHub
# Use a clear title and description
```

**Pull Request Checklist:**

- [ ] Code follows the project's code style
- [ ] Self-review of code completed
- [ ] Comments added to complex code sections
- [ ] Documentation updated (if applicable)
- [ ] No new warnings or errors
- [ ] Tests added/updated and passing
- [ ] Database-agnostic pattern maintained
- [ ] PR description clearly explains changes

**PR Description Template:**

```markdown
## Description

Brief description of what this PR does.

## Type of Change

- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Related Issues

Closes #123

## Testing

- Tested on MongoDB
- Tested on MariaDB
- Added unit tests for new feature

## Screenshots (if applicable)

[Add screenshots here]

## Checklist

- [x] Code follows style guidelines
- [x] Self-review completed
- [x] Documentation updated
- [x] Tests pass
```

---

## 🏗️ Project Structure

Understanding the codebase:

```
SveltyCMS/
├── src/
│   ├── routes/              # SvelteKit routes
│   │   ├── api/             # API endpoints (see docs/api/)
│   │   └── (admin)/         # Admin UI routes
│   ├── databases/           # Database adapters
│   │   ├── auth/            # Authentication system
│   │   ├── mongodb/         # MongoDB adapter
│   │   ├── mariadb/         # MariaDB adapter
│   │   └── postgresql/      # PostgreSQL adapter
│   ├── widgets/             # Widget system (see docs/widgets/)
│   ├── components/          # Svelte components
│   ├── stores/              # Svelte stores
│   └── utils/               # Utility functions
├── docs/                    # Documentation
│   ├── api/                 # API documentation
│   ├── widgets/             # Widget documentation
│   └── contributing/        # Contribution guides
├── tests/                   # Test suites
└── config/                  # Configuration schemas
```

**Key files:**

- `src/hooks.server.ts` - Server hooks (auth, logging)
- `src/app.d.ts` - TypeScript definitions
- `svelte.config.js` - SvelteKit configuration
- `vite.config.ts` - Vite configuration

---

## 🧩 Contribution Areas

### API Development

Adding or updating API endpoints? See:

- [API Documentation](docs/api/) - Complete API reference
- [Database Agnostic Verification](docs/api/Database_Agnostic_Verification.mdx) - How to maintain database independence

**Key principles:**

1. All endpoints must use the database adapter pattern
2. Support all database types (MongoDB, MariaDB, PostgreSQL)
3. Include proper error handling
4. Add API documentation
5. Write tests for all endpoints

### Widget Development

Creating or updating widgets? See:

- [Widget System Architecture](docs/widgets/Widget_System_Architecture.mdx)
- [Widget Management System](docs/widgets/Widget_Management_System.mdx)
- [Creating Custom Widgets](docs/widgets/Widget_Architecture.md)

### Database Adapters

Working on database adapters? See:

- [Database Methods Architecture](docs/Dev_Guide/Database_Methods_Architecture.mdx)
- All adapters must implement the same interface
- Test against all supported databases

### Documentation

Improving documentation? See:

- [Documentation Standards](docs/contributing-docs.mdx)
- All `.mdx` files require frontmatter with specific fields
- Keep examples clear and concise
- Include code samples where applicable

---

## 🧪 Testing Guidelines

### Writing Tests

```typescript
// Example test structure
import { describe, it, expect } from 'vitest';

describe('Collection API', () => {
	it('should create a new collection', async () => {
		const response = await fetch('/api/collections', {
			method: 'POST',
			body: JSON.stringify({ name: 'test' })
		});

		expect(response.ok).toBe(true);
	});
});
```

### Running Tests

```bash
# All tests
npm test

# Watch mode
npm test -- --watch

# Specific file
npm test -- path/to/test.spec.ts

# Coverage report
npm test -- --coverage
```

See [Testing Guide](docs/TESTING_GUIDE.md) for comprehensive testing documentation.

---

## 📝 Documentation Standards

When updating documentation:

1. **Use MDX format** for all documentation files
2. **Include frontmatter** with required fields:
   ```mdx
   ---
   path: 'docs/your-doc'
   title: 'Your Title'
   description: 'Brief description'
   order: 1
   icon: 'mdi:icon-name'
   author: 'Your Name'
   created: '2025-01-01'
   updated: '2025-01-01'
   tags:
     - 'tag1'
     - 'tag2'
   ---
   ```
3. **Use clear headings** and structure
4. **Include code examples** where relevant
5. **Keep language clear** and concise
6. **Update the index** if adding new docs

---

## 🎨 Coding Standards

### TypeScript

- Use TypeScript for all new code
- Define proper types and interfaces
- Avoid `any` type when possible
- Use type guards for runtime checks

### Svelte

- Follow [Svelte best practices](https://svelte.dev/docs)
- Use Svelte 5 runes syntax
- Keep components focused and reusable
- Use proper prop typing

### Database Queries

All database queries must be database-agnostic:

```typescript
// ✅ Correct - Uses adapter pattern
import { getDB } from '$databases';

export async function GET({ locals }) {
	const db = getDB(locals.dbType);
	const items = await db.find('collection_name', {});
	return json(items);
}

// ❌ Wrong - Direct database access
import mongoose from 'mongoose';

export async function GET() {
	const items = await mongoose.model('Collection').find();
	return json(items);
}
```

---

## 🔐 Security Guidelines

- **Never commit secrets** or credentials
- **Validate all user input** on the server
- **Use parameterized queries** to prevent SQL injection
- **Sanitize output** to prevent XSS
- **Follow OWASP** best practices
- **Report security issues** privately to security@sveltycms.com

---

## 📦 Dependencies

When adding new dependencies:

1. **Justify the addition** - Is it really needed?
2. **Check license compatibility** - Must be MIT-compatible
3. **Verify maintenance** - Is the package actively maintained?
4. **Consider size** - Will it bloat the bundle?
5. **Use exact versions** in package.json

---

## 🤝 Code Review Process

### For Contributors

- Be responsive to feedback
- Don't take criticism personally
- Ask questions if feedback is unclear
- Update your PR based on reviews

### For Reviewers

- Be respectful and constructive
- Explain the reasoning behind suggestions
- Approve when all concerns are addressed
- Test the changes locally

---

## 🎯 Git Workflow

We use [GitHub Flow](https://guides.github.com/introduction/flow/):

1. **Branch** from `main`
2. **Commit** changes with clear messages
3. **Push** to your fork
4. **Create** a pull request
5. **Discuss** and review
6. **Merge** when approved

**Important:**

- Keep `main` stable and deployable
- All changes via pull requests
- Require at least one approval
- CI must pass before merge

---

## 💬 Communication

- **Questions?** Open a [Discussion](https://github.com/SveltyCMS/SveltyCMS/discussions)
- **Bug reports?** Open an [Issue](https://github.com/SveltyCMS/SveltyCMS/issues)
- **Feature requests?** Open an [Issue](https://github.com/SveltyCMS/SveltyCMS/issues) with `enhancement` label
- **Security issues?** Email security@sveltycms.com

---

## 📜 License

By contributing, you agree that your contributions will be licensed under the same license as the project (Business Source License 1.1).

---

## 🙏 Recognition

Contributors will be recognized in:

- README.md contributors section
- Release notes for significant contributions
- GitHub Contributors page

---

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](CODE-OF-CONDUCT.md). By participating, you are expected to uphold this code. Please report unacceptable behavior to conduct@sveltycms.com.

---

**Thank you for contributing to SveltyCMS! 🎉**
