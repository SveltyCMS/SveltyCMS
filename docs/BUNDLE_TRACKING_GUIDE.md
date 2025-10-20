# Bundle Size Tracking - Usage Guide

## 📊 Current Bundle Stats System

SveltyCMS already has an excellent bundle tracking system:

- **Script**: `scripts/bundle-stats.js`
- **History File**: `.bundle-history.json`
- **Command**: `bun run build:stats`

---

## 🎯 Current Baseline (Pre-NX)

### Latest Bundle Stats (October 14, 2025)

```json
{
  "timestamp": "2025-10-14T13:35:38.184Z",
  "stats": {
    "totalSize": 1,946,262,      // 1.86 MB uncompressed
    "totalGzipSize": 618,304,    // 603.8 KB gzipped  ← BASELINE
    "chunkCount": 22,
    "largestChunk": 678,031      // 662 KB
  }
}
```

**Key Metrics**:

- 📦 **Bundle Size**: 603.8 KB gzipped
- 📝 **Chunks**: 22 chunks
- 📈 **Largest Chunk**: 662 KB
- 🗜️ **Compression**: 67.3% (1.86 MB → 603.8 KB)

---

## 🚀 How to Use During NX Migration

### Step 0: Capture Baseline

```bash
cd /var/www/vhosts/asset-trade.de/svelte.asset-trade.de/SveltyCMS

# Build and capture stats
bun run build:stats

# Save baseline report
bun run scripts/bundle-stats.js > docs/baseline-report.txt

# Extract baseline number
BASELINE=$(cat .bundle-history.json | jq -r '.[-1].stats.totalGzipSize')
echo "Baseline: ${BASELINE} bytes (603.8 KB)" > docs/BASELINE.txt
```

**Expected Output**:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
          📊 BUNDLE SIZE ANALYSIS REPORT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Summary:
  Total Chunks: 22
  Total Size:   1.86 MB
  Gzip:         603.80 KB (67.3% compression)
  Brotli:       537.21 KB (72.4% compression) ⚡ Recommended

Top 10 Largest Chunks:
  ✅  1. [chunk-name].js
     662.00 KB  → gzip: 215 KB (67.5%) → brotli: 190 KB (71.3%, -12%)
  ...
```

---

### After Each Migration Step

```bash
# 1. Build
bun x nx build cms

# 2. Run bundle stats (same script, works with NX!)
bun run scripts/bundle-stats.js > docs/step-X-report.txt

# 3. Compare with previous
cat .bundle-history.json | jq '.[-2:] | {
  previous: .[0].stats.totalGzipSize,
  current: .[1].stats.totalGzipSize,
  change: (.[1].stats.totalGzipSize - .[0].stats.totalGzipSize)
}'

# 4. Compare with baseline
BASELINE=618304
CURRENT=$(cat .bundle-history.json | jq -r '.[-1].stats.totalGzipSize')
REDUCTION=$(echo "scale=1; ($BASELINE - $CURRENT) * 100 / $BASELINE" | bc)
echo "Reduction: ${REDUCTION}%"

# 5. Record in log
echo "## Step X: [Description]
- Bundle: ${CURRENT} bytes
- Change from baseline: -${REDUCTION}%
- Status: ✅
---" >> docs/PERFORMANCE_LOG.md
```

---

## 📈 Expected Results by Step

### Step-by-Step Bundle Tracking

| Step   | Description        | Bundle (bytes) | Bundle (KB)  | Change     | Cumulative |
| ------ | ------------------ | -------------- | ------------ | ---------- | ---------- |
| **0**  | **Baseline**       | **618,304**    | **603.8 KB** | -          | -          |
| 1      | NX Init            | N/A            | N/A          | -          | -          |
| 2      | CMS Migrate        | 618,304        | 603.8 KB     | 0%         | 0%         |
| 3      | DB Drivers Created | 618,304        | 603.8 KB     | 0%         | 0%         |
| **4**  | **DB Alias**       | **~410,000**   | **~400 KB**  | **-33.7%** | **-33.7%** |
| 5      | API Logic          | ~389,000       | ~380 KB      | -5.0%      | -37.1%     |
| 6      | GraphQL Logic      | ~358,000       | ~350 KB      | -7.9%      | -42.0%     |
| **7**  | **Setup Extract**  | **~287,000**   | **~280 KB**  | **-20.0%** | **-53.6%** |
| 8      | Login Extract      | ~256,000       | ~250 KB      | -10.7%     | -58.6%     |
| 9      | Shared Libs        | ~256,000       | ~250 KB      | 0%         | -58.6%     |
| **10** | **Final**          | **~235,000**   | **~230 KB**  | **-8.0%**  | **-61.9%** |

---

## 🎯 Quick Commands Reference

### Basic Usage

```bash
# Build and analyze (current monolith)
bun run build:stats

# Build and analyze (NX workspace)
bun x nx build cms
bun run scripts/bundle-stats.js

# Visual analysis (opens HTML)
bun run build:analyze
```

### Comparison Commands

```bash
# Last 5 builds
cat .bundle-history.json | jq '.[-5:]'

# Compare last 2 builds
cat .bundle-history.json | jq '
  .[-2:] |
  {
    previous: {
      date: .[0].timestamp,
      size: .[0].stats.totalGzipSize
    },
    current: {
      date: .[1].timestamp,
      size: .[1].stats.totalGzipSize
    },
    diff: (.[1].stats.totalGzipSize - .[0].stats.totalGzipSize),
    percent: (((.[1].stats.totalGzipSize / .[0].stats.totalGzipSize) - 1) * 100)
  }
'

# Total improvement since baseline
BASELINE=618304
CURRENT=$(cat .bundle-history.json | jq -r '.[-1].stats.totalGzipSize')
echo "Baseline: ${BASELINE} bytes"
echo "Current:  ${CURRENT} bytes"
echo "Savings:  $((BASELINE - CURRENT)) bytes"
echo "Percent:  $(echo "scale=1; ($BASELINE - $CURRENT) * 100 / $BASELINE" | bc)%"
```

### Filtering & Analysis

```bash
# Only show sizes over time
cat .bundle-history.json | jq '.[] | {date: .timestamp, kb: (.stats.totalGzipSize / 1024)}'

# Average size over last 10 builds
cat .bundle-history.json | jq '.[-10:] | map(.stats.totalGzipSize) | add / length'

# Find biggest build
cat .bundle-history.json | jq 'max_by(.stats.totalGzipSize)'

# Find smallest build
cat .bundle-history.json | jq 'min_by(.stats.totalGzipSize)'
```

---

## 📊 Visualization Script

Create a simple progress tracker:

```bash
#!/bin/bash
# scripts/track-progress.sh

BASELINE=618304
CURRENT=$(cat .bundle-history.json | jq -r '.[-1].stats.totalGzipSize')
TARGET=235000

PROGRESS=$(echo "scale=1; ($BASELINE - $CURRENT) * 100 / ($BASELINE - $TARGET)" | bc)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎯 NX Migration Progress"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Baseline:  $(numfmt --to=iec-i --suffix=B $BASELINE)"
echo "Current:   $(numfmt --to=iec-i --suffix=B $CURRENT)"
echo "Target:    $(numfmt --to=iec-i --suffix=B $TARGET)"
echo ""
echo "Savings:   $((BASELINE - CURRENT)) bytes"
echo "Progress:  ${PROGRESS}%"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
```

Usage:

```bash
chmod +x scripts/track-progress.sh
./scripts/track-progress.sh
```

---

## 🎨 Visual Bundle Analysis

### Using Vite Bundle Visualizer

```bash
# Build with visual analysis
bun run build:analyze

# This will:
# 1. Build the project
# 2. Generate stats.html
# 3. Open in browser automatically
```

**What to Look For**:

- 🔍 **Large Dependencies**: Identify heavy npm packages
- 📦 **Duplicate Code**: Find code that should be shared
- 🗄️ **Unused Exports**: Dead code that can be removed
- 🔌 **Driver Packages**: Verify only selected driver present

### Critical Checks After Step 4 (Database Alias)

```bash
# Build with Mongo driver
bun x nx build cms
bun run build:analyze

# In the visualization, verify:
# ✅ mongodb package present
# ❌ drizzle-orm NOT present
# ❌ mysql2 NOT present
# ❌ postgres NOT present (unless using Drizzle)
```

---

## 📝 Recording Results

### Create Performance Log Template

```bash
cat > docs/PERFORMANCE_LOG.md << 'EOF'
# NX Migration Performance Log

## Baseline (Step 0)
- Date: 2025-10-14
- Bundle: 618,304 bytes (603.8 KB gzipped)
- Chunks: 22
- Build Time: ~45s
- Test Time: ~120s
- Status: ✅ Captured

---

## Step 1: NX Initialization
- Date: [DATE]
- Bundle: N/A (no build yet)
- Status: ✅ Infrastructure ready

---

## Step 2: CMS Migration (Full Copy)
- Date: [DATE]
- Bundle: [SIZE] bytes
- Change: 0% (expected, no optimization yet)
- Build Time: [TIME]
- Status: ✅ No regression

---

## Step 3: Database Drivers Created
- Date: [DATE]
- Bundle: [SIZE] bytes
- Change: 0% (expected, not integrated yet)
- Status: ✅ Drivers ready

---

## Step 4: Database Alias ⚡ (CRITICAL)
- Date: [DATE]
- Bundle: [SIZE] bytes
- Change: -33.7% (target)
- Build Time: [TIME]
- Verification:
  - [ ] Only mongodb in bundle (when mongo selected)
  - [ ] Only drizzle in bundle (when drizzle selected)
  - [ ] No unused drivers
- Status: ⏳ In progress

---

[Continue for steps 5-10...]
EOF
```

### Update After Each Step

```bash
# Automated update
STEP_NUM=4
STEP_NAME="Database Alias"
CURRENT=$(cat .bundle-history.json | jq -r '.[-1].stats.totalGzipSize')
BASELINE=618304
CHANGE=$(echo "scale=1; ($BASELINE - $CURRENT) * 100 / $BASELINE" | bc)

echo "## Step ${STEP_NUM}: ${STEP_NAME}
- Date: $(date +%Y-%m-%d)
- Bundle: ${CURRENT} bytes ($(echo "scale=1; $CURRENT / 1024" | bc) KB)
- Change: -${CHANGE}%
- Status: ✅ Complete
---" >> docs/PERFORMANCE_LOG.md
```

---

## 🎯 Success Criteria Checklist

### After Step 4 (Database Alias)

```bash
# Run verification
CURRENT=$(cat .bundle-history.json | jq -r '.[-1].stats.totalGzipSize')
BASELINE=618304
REDUCTION=$(echo "scale=1; ($BASELINE - $CURRENT) * 100 / $BASELINE" | bc)

if (( $(echo "$REDUCTION >= 30" | bc -l) )); then
  echo "✅ Step 4 SUCCESS: ${REDUCTION}% reduction (target: 33%)"
else
  echo "❌ Step 4 FAILED: Only ${REDUCTION}% reduction (target: 33%)"
  echo "Check: Are all database imports using @sveltycms/database alias?"
fi
```

### After Step 7 (Setup Extracted)

```bash
CURRENT=$(cat .bundle-history.json | jq -r '.[-1].stats.totalGzipSize')
BASELINE=618304
REDUCTION=$(echo "scale=1; ($BASELINE - $CURRENT) * 100 / $BASELINE" | bc)

if (( $(echo "$REDUCTION >= 50" | bc -l) )); then
  echo "✅ Step 7 SUCCESS: ${REDUCTION}% reduction (target: 53%)"
else
  echo "❌ Step 7 FAILED: Only ${REDUCTION}% reduction (target: 53%)"
  echo "Check: Is setup code fully removed from CMS?"
fi
```

### Final Check (Step 10)

```bash
CURRENT=$(cat .bundle-history.json | jq -r '.[-1].stats.totalGzipSize')
BASELINE=618304
TARGET=235000

REDUCTION=$(echo "scale=1; ($BASELINE - $CURRENT) * 100 / $BASELINE" | bc)

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎯 Final Results"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Baseline:  ${BASELINE} bytes (603.8 KB)"
echo "Current:   ${CURRENT} bytes ($(echo "scale=1; $CURRENT / 1024" | bc) KB)"
echo "Target:    ${TARGET} bytes (230 KB)"
echo "Reduction: ${REDUCTION}%"
echo ""

if (( $(echo "$CURRENT <= $TARGET" | bc -l) )); then
  echo "✅ MIGRATION SUCCESSFUL!"
  echo "   Achieved ${REDUCTION}% bundle size reduction!"
else
  echo "⚠️  Close to target (within 10%)"
  echo "   Further optimization possible"
fi
```

---

## 📊 Generate Final Report

```bash
#!/bin/bash
# scripts/generate-final-report.sh

cat > docs/BUNDLE_COMPARISON.md << 'EOF'
# Bundle Size Comparison Report

## Migration Results

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| **Total (gzipped)** | 603.8 KB | [CURRENT] KB | **-[X]%** |
| **Largest Chunk** | 662 KB | [X] KB | **-[X]%** |
| **Chunk Count** | 22 | [X] | **-[X]%** |

## Step-by-Step Progress

| Step | Bundle (KB) | Change | Cumulative |
|------|-------------|--------|------------|
| Baseline | 603.8 | - | - |
EOF

# Extract history and append to report
cat .bundle-history.json | jq -r '.[] |
  "\(.timestamp) | \(.stats.totalGzipSize / 1024 | floor) KB"
' >> docs/BUNDLE_COMPARISON.md

echo "Report generated: docs/BUNDLE_COMPARISON.md"
```

---

## 🎉 Quick Summary

### Essential Commands

```bash
# Capture baseline (Step 0)
bun run build:stats > docs/baseline-report.txt

# After each migration step
bun x nx build cms
bun run scripts/bundle-stats.js > docs/step-X-report.txt

# Track progress
cat .bundle-history.json | jq '.[-5:]'

# Visual analysis
bun run build:analyze

# Verify success
./scripts/track-progress.sh
```

### Key Files

- 📊 `.bundle-history.json` - Automated tracking (up to 30 builds)
- 📝 `scripts/bundle-stats.js` - Analysis script
- 📈 `docs/PERFORMANCE_LOG.md` - Manual tracking
- 🎯 `docs/BASELINE.txt` - Starting point reference

---

**Pro Tip**: Run `bun run build:stats` after EVERY code change during migration to catch regressions early!
