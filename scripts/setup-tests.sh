#!/bin/bash

# SveltyCMS Blackbox Testing Suite - Setup Script
# This script automates the integration of the testing suite into your project

set -e

echo "🚀 SveltyCMS Blackbox Testing Suite Setup"
echo "=========================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Step 1: Check Node.js
log_info "Checking Node.js installation..."
if ! command -v node &> /dev/null; then
    log_error "Node.js is not installed. Please install Node.js 20+"
    exit 1
fi
NODE_VERSION=$(node --version)
log_success "Node.js $NODE_VERSION found"

# Step 2: Install dependencies
log_info "Installing dependencies..."
if npm ci > /dev/null 2>&1; then
    log_success "Dependencies installed"
else
    log_warning "npm ci failed, trying npm install..."
    npm install
    log_success "Dependencies installed with npm install"
fi

# Step 3: Install Playwright
log_info "Installing Playwright browsers..."
npx playwright install --with-deps > /dev/null 2>&1
log_success "Playwright browsers installed"

# Step 4: Create environment file
log_info "Creating .env.test file..."
if [ ! -f ".env.test" ]; then
    cat > .env.test << 'EOF'
DATABASE_URL=postgresql://test:test@localhost:5432/svelty_test
NODE_ENV=test
BASE_URL=http://localhost:5173
TEST_EMAIL=test@example.com
TEST_PASSWORD=password123
LOG_LEVEL=error
EOF
    log_success ".env.test created"
else
    log_warning ".env.test already exists, skipping"
fi

# Step 5: Check if PostgreSQL is running
log_info "Checking PostgreSQL..."
if command -v psql &> /dev/null; then
    if psql -U postgres -c "SELECT 1" > /dev/null 2>&1; then
        log_success "PostgreSQL is running"
    else
        log_warning "PostgreSQL service not responding"
        log_info "To start PostgreSQL: brew services start postgresql (macOS) or sudo systemctl start postgresql (Linux)"
    fi
else
    log_warning "PostgreSQL CLI not found, skipping check"
fi

# Step 6: Update package.json scripts
log_info "Verifying npm scripts are configured..."

# Check if scripts exist
if grep -q '"test:e2e":' package.json; then
    log_success "npm scripts already configured"
else
    log_warning "npm scripts need to be added manually"
    log_info "Add these to package.json scripts:"
    echo '  "test:e2e": "playwright test",'
    echo '  "test:e2e:local": "BASE_URL=http://localhost:5173 playwright test",'
    echo '  "test:e2e:headed": "playwright test --headed",'
    echo '  "test:e2e:debug": "PWDEBUG=1 playwright test",'
    echo '  "db:migrate": "node scripts/migrate.js",'
    echo '  "db:seed:test": "node scripts/seed-test.js",'
    echo '  "db:reset:test": "npm run db:migrate && npm run db:seed:test"'
fi

# Step 7: Summary
echo ""
echo "=========================================="
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo "=========================================="
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo "1. Review IMPLEMENTATION_GUIDE.md"
echo "2. Update test selectors to match your UI"
echo "3. Configure database scripts for your ORM"
echo "4. Run: npm run db:reset:test"
echo "5. Run: npm run dev (in one terminal)"
echo "6. Run: npm run test:e2e (in another terminal)"
echo ""
echo -e "${BLUE}Quick commands:${NC}"
echo "  npm run test:e2e          # Run all tests"
echo "  npm run test:e2e:headed   # Run with browser visible"
echo "  npm run test:e2e:debug    # Run in debug mode"
echo "  npm run db:reset:test     # Reset test database"
echo ""
echo -e "${BLUE}Documentation:${NC}"
echo "  README.md                    # Start here"
echo "  IMPLEMENTATION_GUIDE.md      # Step-by-step setup"
echo "  TESTING.md                   # Comprehensive guide"
echo "  FIX_BUILD_ISSUE.md          # Build issue solutions"
echo ""

log_info "Setup script complete!"
