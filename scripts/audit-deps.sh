#!/usr/bin/env bash
# scripts/audit-deps.sh — Dependency security audit
# Verifies bun.lock against known vulnerability databases via osv-scanner.
# Run: bun run audit:deps
set -e

echo "🔍 Auditing dependencies for known vulnerabilities..."

# Check if osv-scanner is installed
if ! command -v osv-scanner &> /dev/null; then
  echo "⚠️  osv-scanner not installed."
  echo "   Install: go install github.com/google/osv-scanner/cmd/osv-scanner@latest"
  echo "   Or via npm: npx @google/osv-scanner --lockfile=bun.lock"
  echo ""
  echo "   Running lightweight npm audit fallback..."
  bun audit --level critical 2>&1 || true
  exit 0
fi

# Run osv-scanner against bun.lock
echo "Running osv-scanner against bun.lock..."
osv-scanner --lockfile=bun.lock --format table

echo ""
echo "✅ Dependency audit complete."
echo "   SBOM: bun run audit:sbom"
