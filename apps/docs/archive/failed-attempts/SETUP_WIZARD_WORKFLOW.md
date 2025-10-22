# Setup Wizard Workflow

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        Fresh Install                             │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────┐
│ User runs:       │
│ nx dev setup     │
│    -wizard       │
└────────┬─────────┘
         │
         v
┌──────────────────────────────────────────┐
│ Setup Wizard (vite.config.ts)            │
│ ┌──────────────────────────────────────┐ │
│ │ Check: config/private.ts exists?     │ │
│ └──────────────────┬───────────────────┘ │
│                    │                      │
│            ┌───────┴────────┐             │
│            │ NO (missing)   │             │
│            v                │             │
│ ┌──────────────────────┐   │             │
│ │ Create BLANK config  │   │             │
│ │ with empty values:   │   │             │
│ │ - DB_HOST: ''        │   │             │
│ │ - JWT_SECRET_KEY: '' │   │             │
│ │ - etc.               │   │             │
│ └──────────┬───────────┘   │             │
│            │                │             │
│            v                v             │
│ ┌─────────────────────────────┐          │
│ │ Open browser:               │          │
│ │ http://localhost:5174/setup │          │
│ └──────────────┬──────────────┘          │
└────────────────┼─────────────────────────┘
                 │
                 v
┌─────────────────────────────────────────┐
│ User sees Setup Wizard UI               │
│ ┌─────────────────────────────────────┐ │
│ │ Step 1: Welcome                     │ │
│ │ Step 2: Database Config             │ │
│ │ Step 3: Test DB Connection          │ │
│ │ Step 4: Create Admin Account        │ │
│ │ Step 5: System Settings             │ │
│ │ Step 6: Review & Complete           │ │
│ └─────────────────┬───────────────────┘ │
└───────────────────┼─────────────────────┘
                    │
                    v
┌─────────────────────────────────────────────────┐
│ User clicks "Complete Setup"                    │
│                                                 │
│ POST /api/setup/complete                        │
│ ┌─────────────────────────────────────────────┐ │
│ │ 1. WRITE config/private.ts with VALUES:     │ │
│ │    - DB_HOST: 'localhost'                   │ │
│ │    - DB_NAME: 'SveltyCMS'                   │ │
│ │    - JWT_SECRET_KEY: '<random 32 bytes>'    │ │
│ │    - ENCRYPTION_KEY: '<random 32 bytes>'    │ │
│ │                                             │ │
│ │ 2. SEED database:                           │ │
│ │    - Default theme                          │ │
│ │    - System preferences                     │ │
│ │    - Collections                            │ │
│ │    - Admin user                             │ │
│ │                                             │ │
│ │ 3. CREATE admin session                     │ │
│ │                                             │ │
│ │ 4. REDIRECT to main CMS                     │ │
│ └─────────────────┬───────────────────────────┘ │
└───────────────────┼─────────────────────────────┘
                    │
                    v
┌─────────────────────────────────────────┐
│ http://localhost:5173/login             │
│                                         │
│ Main CMS detects:                       │
│ ✓ config/private.ts exists              │
│ ✓ Has valid values                      │
│ ✓ Database connected                    │
│                                         │
│ → User logs in with admin credentials   │
│ → CMS runs normally                     │
└─────────────────────────────────────────┘
```

## Existing Install Flow

```
┌──────────────────┐
│ User runs:       │
│ nx dev sveltycms │
└────────┬─────────┘
         │
         v
┌─────────────────────────────────────┐
│ Main CMS (hooks/handleSetup.ts)    │
│ ┌─────────────────────────────────┐ │
│ │ Check: config/private.ts?       │ │
│ └──────────┬──────────────────────┘ │
│            │                         │
│    ┌───────┴────────┐                │
│    │ EXISTS + VALID │                │
│    v                │                │
│ ┌──────────────┐   │                │
│ │ Run normally │   │                │
│ │ → /login     │   │                │
│ └──────────────┘   │                │
│                    │                │
│    ┌───────────────┘                │
│    │ MISSING or EMPTY               │
│    v                                │
│ ┌────────────────────────────────┐  │
│ │ REDIRECT to setup wizard:      │  │
│ │ http://localhost:5174          │  │
│ │ (must be running separately)   │  │
│ └────────────────────────────────┘  │
└─────────────────────────────────────┘
```

## Key Points

1. **Setup Wizard Creates Blank Config**:
   - When started, checks if `config/private.ts` exists
   - If missing, creates it with **empty** values
   - This allows Vite to compile without errors

2. **Setup Wizard Fills Config**:
   - User enters database credentials
   - User creates admin account
   - Wizard writes **real values** to config
   - Seeds database with initial data

3. **Main CMS Validates Config**:
   - Checks if config exists
   - Checks if values are **not empty**
   - If empty → redirects to setup wizard
   - If valid → runs normally

4. **Separation Benefits**:
   - Setup code (~96 KB gzipped) not in main CMS bundle
   - Setup wizard only loaded during first install
   - Main CMS optimized for production use

## Development Commands

### Fresh Install

```bash
# 1. Start setup wizard (creates blank config, opens browser)
nx dev setup-wizard

# 2. Complete setup in browser

# 3. Start main CMS (detects valid config, runs normally)
nx dev sveltycms
```

### Existing Install

```bash
# Just start main CMS (config already exists)
nx dev sveltycms
```

## Production Deployment

```bash
# Build both apps
nx build setup-wizard
nx build sveltycms

# Deploy to different ports/subdomains:
# - Main CMS: https://your-domain.com (port 5173)
# - Setup: https://setup.your-domain.com (port 5174)
```

## Environment Variables

```bash
# Main CMS: Set setup wizard URL for redirection
SETUP_WIZARD_URL=http://localhost:5174  # Development
SETUP_WIZARD_URL=https://setup.your-domain.com  # Production
```
