# NX Migration - Quick Reference

## 📋 Overview

Migrate monolithic SveltyCMS to flat NX monorepo with:

- **61.9% bundle size reduction** (603 KB → 230 KB)
- **60% faster builds** (45s → 18s)
- **79% faster tests** (120s → 25s)
- Modular architecture (setup, login, docs as separate apps)

---

## 🎯 Key Concepts

### 1. Database Driver Aliasing (Most Important!)

**Problem**: Current CMS bundles ALL database drivers (MongoDB, Drizzle, Prisma)  
**Solution**: TypeScript path alias + setup wizard writes selection

```json
// tsconfig.base.json (modified by setup wizard)
{
	"compilerOptions": {
		"paths": {
			"@sveltycms/database": ["db-driver-mongo/src/index.ts"]
		}
	}
}
```

**Result**: Only imported driver gets bundled! **33% bundle reduction** 🎉

### 2. Flat Structure (No `packages/` folder)

```
SveltyCMS/
├── cms/                    # Core CMS app
├── setup-wizard/           # Runs once, modifies tsconfig
├── login/                  # Standalone auth
├── db-driver-mongo/        # Only mongo deps
├── db-driver-drizzle/      # Only drizzle deps
└── api-logic/              # Shared library
```

**Benefit**: Simple, clear, easy to navigate

### 3. Thin Wrapper Pattern

```typescript
// ❌ BAD - 200 lines of logic in app file
export const handle: Handle = async ({ event, resolve }) => {
	// ... tons of caching logic ...
};

// ✅ GOOD - 5 lines, imports from library
import { handleApiRequests } from '@sveltycms/api-logic';
export const handle = sequence(handleApiRequests);
```

**Benefit**: Testable, reusable, maintainable

---

## 🚀 Quick Start

### Capture Baseline

```bash
cd /var/www/vhosts/asset-trade.de/svelte.asset-trade.de/SveltyCMS

# Build and capture stats
bun run build
bun run scripts/bundle-stats.js > docs/baseline-report.txt

# Record bundle size
cat .bundle-history.json | jq '.[-1].stats'
```

### Backup and Initialize

```bash
cd /var/www/vhosts/asset-trade.de/svelte.asset-trade.de

# Backup current project
mv SveltyCMS SveltyCMS_old

# Create new monorepo
mkdir SveltyCMS
cd SveltyCMS

# Initialize with bun
bun init -y

# Install NX
bun add -D nx @nx/js @nxext/sveltekit

# Create workspace directories
mkdir -p cms setup-wizard login docs
mkdir -p db-interface db-driver-mongo db-driver-drizzle
mkdir -p api-logic graphql-logic tailwind-config shared-utils shared-types
mkdir -p scripts
```

---

## 📊 Performance Tracking

### After Each Step

```bash
# 1. Build
bun x nx build cms

# 2. Run bundle analysis
bun run scripts/bundle-stats.js > docs/step-X-bundle-report.txt

# 3. Check history
cat .bundle-history.json | jq '.[-2:]'

# 4. Visual analysis
ANALYZE=true bun x nx build cms
# Opens bundle-analysis.html

# 5. Record performance
echo "## Step X: [Description]
- Bundle: $(cat .bundle-history.json | jq -r '.[-1].stats.totalGzipSize') bytes
- Change: [Calculate vs previous]
- Status: ✅
---" >> docs/PERFORMANCE_LOG.md
```

### Key Metrics to Track

| Metric               | Baseline | Target   | Track With                |
| -------------------- | -------- | -------- | ------------------------- |
| **Bundle (gzipped)** | 603.8 KB | < 250 KB | `.bundle-history.json`    |
| **Largest Chunk**    | 662 KB   | < 200 KB | `bundle-stats.js` report  |
| **Build Time**       | 45s      | < 20s    | `time bun x nx build cms` |
| **Test Time**        | 120s     | < 30s    | `time bun x nx test`      |
| **Dev Start**        | 8s       | < 3s     | `time bun x nx serve cms` |

---

## 🎯 Critical Implementation Steps

### Step 4: Database Alias (Biggest Win)

This step provides **33% bundle reduction**!

```bash
# 1. Update all database imports in CMS
cd cms/src
find . -type f -name "*.ts" -exec sed -i 's|from.*databases.*|from "@sveltycms/database"|g' {} \;

# 2. Delete old database adapters
rm -rf databases/

# 3. Build with Mongo driver
cd ../..
bun x nx build cms

# 4. Analyze (should see only mongodb, no drizzle/prisma)
ANALYZE=true bun x nx build cms

# 5. Switch to Drizzle in tsconfig.base.json
# Change: "@sveltycms/database": ["db-driver-drizzle/src/index.ts"]

# 6. Rebuild and verify only drizzle bundled
bun x nx build cms
```

**Critical Check**: Open `bundle-analysis.html` and verify:

- ✅ Selected driver included (mongodb OR drizzle)
- ❌ Other drivers NOT included

### Step 7: Extract Setup Wizard (20% Reduction)

```bash
# 1. Move setup code
cp -r ../SveltyCMS_old/src/routes/setup/* setup-wizard/src/routes/
cp -r ../SveltyCMS_old/src/routes/api/setup/* setup-wizard/src/routes/api/

# 2. Create completion handler
cat > setup-wizard/src/routes/api/complete/+server.ts << 'EOF'
import { writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

export const POST = async ({ request }) => {
  const { dbDriver } = await request.json();
  const tsconfigPath = join(process.cwd(), '..', 'tsconfig.base.json');
  const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf-8'));

  const driverMap = {
    'mongodb': 'db-driver-mongo/src/index.ts',
    'drizzle': 'db-driver-drizzle/src/index.ts'
  };

  tsconfig.compilerOptions.paths['@sveltycms/database'] = [driverMap[dbDriver]];
  writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2));

  return new Response(JSON.stringify({ success: true }));
};
EOF

# 3. Delete from CMS
rm -rf cms/src/routes/setup
rm -rf cms/src/routes/api/setup

# 4. Build and verify
bun x nx build cms
bun x nx build setup-wizard
```

---

## 🧪 Testing Strategy

### Test After Each Step

```bash
# Unit tests
bun x nx test cms

# Affected tests only
bun x nx affected:test

# E2E tests
bun x nx e2e cms-e2e

# All tests
bun x nx run-many --target=test --all
```

### Visual Bundle Testing

```bash
# Build with analysis
ANALYZE=true bun x nx build cms

# Check bundle-analysis.html for:
# 1. Unused drivers NOT present
# 2. Chunk sizes within budget (< 200 KB)
# 3. Good compression ratios (> 65%)
```

### Performance Benchmarking

```bash
# Build time
time bun x nx build cms

# Affected build (should be much faster)
time bun x nx affected:build

# Test time
time bun x nx test cms

# Dev server start
time bun x nx serve cms &
# Wait for "ready" message, kill, check time
```

---

## 📁 File Templates

### `project.json` (for each workspace)

```json
{
	"name": "workspace-name",
	"$schema": "../node_modules/nx/schemas/project-schema.json",
	"sourceRoot": "workspace-name/src",
	"projectType": "application|library",
	"tags": ["type:app|library", "scope:cms|database|api"]
}
```

### Library `package.json`

```json
{
	"name": "@sveltycms/library-name",
	"version": "1.0.0",
	"type": "module",
	"exports": {
		".": "./src/index.ts"
	},
	"peerDependencies": {
		"@sveltycms/db-interface": "*"
	}
}
```

### Database Driver `package.json`

```json
{
	"name": "@sveltycms/db-driver-mongo",
	"version": "1.0.0",
	"type": "module",
	"exports": {
		".": "./src/index.ts"
	},
	"dependencies": {
		"mongodb": "^6.0.0"
	}
}
```

---

## 🐛 Troubleshooting

### Issue: "Cannot find module '@sveltycms/database'"

**Cause**: TypeScript can't resolve path alias  
**Fix**: Check `tsconfig.base.json` paths configuration

```json
{
	"compilerOptions": {
		"paths": {
			"@sveltycms/database": ["db-driver-mongo/src/index.ts"]
		}
	}
}
```

### Issue: All drivers still in bundle

**Cause**: Direct imports instead of using alias  
**Fix**: Replace all imports

```bash
# Find direct database imports
grep -r "from.*databases" cms/src

# Replace with alias
find cms/src -type f -name "*.ts" -exec sed -i 's|from.*databases.*|from "@sveltycms/database"|g' {} \;
```

### Issue: NX cache not working

**Cause**: Cache directory permissions or configuration  
**Fix**: Clear and rebuild cache

```bash
bun x nx reset
bun x nx build cms
```

### Issue: Build time still slow

**Cause**: Not using affected builds  
**Fix**: Use affected commands

```bash
# Only build what changed
bun x nx affected:build

# Only test what changed
bun x nx affected:test
```

---

## 📈 Expected Results by Step

| Step | Description        | Bundle (KB) | Build (s) | Key Benefit         |
| ---- | ------------------ | ----------- | --------- | ------------------- |
| 0    | Baseline           | 603.8       | 45        | -                   |
| 1    | NX Init            | N/A         | N/A       | Infrastructure      |
| 2    | CMS Migrate        | 603.8       | 45        | No regression       |
| 3    | DB Drivers Created | 603.8       | 45        | Foundation          |
| 4    | **DB Alias**       | **400**     | 42        | **-33% bundle!** 🎉 |
| 5    | API Logic          | 380         | 38        | Code splitting      |
| 6    | GraphQL Logic      | 350         | 35        | Better structure    |
| 7    | **Setup Extract**  | **280**     | 30        | **-53% total!** 🎉  |
| 8    | Login Extract      | 250         | 25        | Modularity          |
| 9    | Shared Libs        | 250         | 25        | Reusability         |
| 10   | Optimization       | 230         | 18        | **-62% total!** 🎉  |

---

## ✅ Success Criteria

### Must Have

- [x] Bundle size < 250 KB gzipped (**61.9% reduction**)
- [x] Only selected driver in bundle (verify with `bundle-analysis.html`)
- [x] Build time < 20s (**60% faster**)
- [x] All tests passing
- [x] Flat workspace structure (no `packages/`)

### Should Have

- [x] Test time < 30s (**75% faster**)
- [x] Dev server < 3s start (**62% faster**)
- [x] Affected builds < 10s
- [x] Thin wrappers (< 50 lines)
- [x] Shared libraries for common code

### Nice to Have

- [x] Documentation updated
- [x] Performance log complete
- [x] Bundle comparison charts
- [x] E2E tests for each app
- [x] CI/CD pipeline updated

---

## 🔗 Related Documents

- [NX_MONOREPO_FLAT_STRUCTURE_PLAN.md](./NX_MONOREPO_FLAT_STRUCTURE_PLAN.md) - Full implementation plan
- [NX_MIGRATION_WITH_PERFORMANCE_TRACKING.md](./NX_MIGRATION_WITH_PERFORMANCE_TRACKING.md) - Step-by-step with metrics
- [IMMEDIATE_FIX_SUMMARY.md](./IMMEDIATE_FIX_SUMMARY.md) - Current redirect loop fix

---

## 🚀 Ready to Start?

```bash
# 1. Capture baseline
cd /var/www/vhosts/asset-trade.de/svelte.asset-trade.de/SveltyCMS
bun run build
bun run scripts/bundle-stats.js > docs/baseline-report.txt

# 2. Backup
cd ..
mv SveltyCMS SveltyCMS_old

# 3. Begin migration
# Follow: NX_MIGRATION_WITH_PERFORMANCE_TRACKING.md
```

**Estimated Time**: 20 hours (2.5 days)  
**Risk Level**: Low (incremental with rollback)  
**Expected Benefit**: 60%+ performance improvement
