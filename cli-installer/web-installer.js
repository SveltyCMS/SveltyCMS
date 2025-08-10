/**
 * @file cli-installer/web-installer.js
 * @description Web-based installer for SveltyCMS
 *
 * This new approach:
 * 1. Generates minimal config files (only database + JWT)
 * 2. Starts the dev server
 * 3. Launches a web-based setup wizard
 * 4. Guides users through configuration via GUI
 */

import { intro, note, outro, spinner } from '@clack/prompts';
import { exec } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import open from 'open';
import path from 'path';
import pc from 'picocolors';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);

// Default minimal configuration
const defaultPrivateConfig = `/**
 * PRIVATE configuration for the application
 *
 * Only essential startup values. All other settings are database-driven.
 */

import { createPrivateConfig } from './types.ts';

export const privateEnv = createPrivateConfig({
    // --- Database Configuration ---
    DB_TYPE: 'mongodb',
    DB_HOST: 'localhost',
    DB_PORT: 27017,
    DB_NAME: 'SveltyCMS',
    DB_USER: '',
    DB_PASSWORD: '',

    // --- JWT Secret ---
    JWT_SECRET_KEY: '${generateJWTSecret()}',

    // Add any other startup-only secrets here if needed
});
`;

const defaultPublicConfig = `/**
 * PUBLIC configuration for the application
 *
 * Only keep static values required at startup. All runtime-editable settings are now stored in the database.
 */

import { createPublicConfig } from './types.ts';

export const publicEnv = createPublicConfig({
    // If you have any essential static public config, add here. Otherwise, leave empty.
});
`;

function generateJWTSecret() {
  return crypto.randomBytes(64).toString('hex');
}

function checkNodeVersion() {
  const packageJsonPath = path.resolve(process.cwd(), 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const requiredVersionString = packageJson.engines.node;
  const requiredMajorVersion = parseInt(requiredVersionString.match(/\d+/)[0], 10);
  const currentMajorVersion = parseInt(process.version.slice(1).split('.')[0], 10);

  if (currentMajorVersion < requiredMajorVersion) {
    console.clear();
    intro(`${pc.bgRed(pc.white(pc.bold(' SveltyCMS Environment Error ')))}`);
    outro(
      `Node.js version ${requiredVersionString} is required, but you're using ${process.version}.\nPlease update Node.js and run the installer again.`
    );
    process.exit(1);
  }
}

function createMinimalConfig() {
  const configDir = path.resolve(process.cwd(), 'config');

  // Ensure config directory exists
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  // Create minimal private config
  const privateConfigPath = path.join(configDir, 'private.ts');
  if (!fs.existsSync(privateConfigPath)) {
    fs.writeFileSync(privateConfigPath, defaultPrivateConfig);
    console.log('✅ Created minimal private configuration');
  }

  // Create minimal public config
  const publicConfigPath = path.join(configDir, 'public.ts');
  if (!fs.existsSync(publicConfigPath)) {
    fs.writeFileSync(publicConfigPath, defaultPublicConfig);
    console.log('✅ Created minimal public configuration');
  }
}

async function startDevServer() {
  const s = spinner();
  s.start('Starting development server...');

  try {
    // Start the dev server in the background
    exec('npm run dev', {
      cwd: process.cwd(),
      detached: true,
      stdio: 'ignore'
    });

    // Wait a bit for the server to start
    await new Promise(resolve => setTimeout(resolve, 3000));

    s.stop('✅ Development server started');
    return true;
  } catch (error) {
    s.stop('❌ Failed to start development server');
    console.error('Error:', error.message);
    return false;
  }
}

async function waitForSetupPage(url, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      await new Promise((resolve, reject) => {
        http.get(url, res => {
          if (res.statusCode === 200) resolve(true);
          else reject();
        }).on('error', reject);
      });
      return true;
    } catch {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return false;
}

async function openSetupWizard() {
  const setupUrl = 'http://localhost:5173/setup';
  console.log('\n🌐 Waiting for setup wizard to be available...');
  const ready = await waitForSetupPage(setupUrl);
  if (ready) {
    console.log(`📋 Opening setup wizard: ${setupUrl}`);
    await open(setupUrl);
  } else {
    console.log('💡 Setup wizard not available. Please open your browser and navigate to:', setupUrl);
  }
}

// Utility to clear global settings for a fresh install
async function clearGlobalSettings() {
  // Example: Remove settings from MongoDB (adjust for your DB)
  try {
    const { MongoClient } = await import('mongodb');
    const client = new MongoClient('mongodb://localhost:27017');
    await client.connect();
    const db = client.db('SveltyCMS');
    await db.collection('systemPreferences').deleteMany({});
    await client.close();
    console.log('🧹 Cleared global settings for fresh install');
  } catch (err) {
    console.warn('⚠️ Could not clear global settings:', err.message);
  }
}

export async function main() {
  console.clear();

  // Check Node.js version
  checkNodeVersion();

  // Detect --fresh argument
  const isFresh = process.argv.includes('--fresh');
  if (isFresh) {
    await clearGlobalSettings();
  }

  intro(`${pc.bgBlue(pc.white(pc.bold(' SveltyCMS Web Installer ')))}`);

  note(`
This installer will:
1. Create minimal configuration files
2. Start the development server
3. Launch a web-based setup wizard
4. Guide you through database configuration

All settings will be stored in the database for easy management.
    `);

  const s = spinner();
  s.start('Setting up SveltyCMS...');

  try {
    // Step 1: Create minimal config files
    createMinimalConfig();

    // Step 2: Start dev server
    const serverStarted = await startDevServer();

    if (!serverStarted) {
      outro('❌ Failed to start development server. Please check your configuration.');
      process.exit(1);
    }

    s.stop('✅ Setup complete!');

    // Step 3: Open setup wizard
    await openSetupWizard();

    note(`
🎉 SveltyCMS is ready!

The web-based setup wizard will guide you through:
• Database connection configuration
• Initial admin user creation
• System settings configuration
• API keys and integrations

You can access the setup wizard at: http://localhost:5173/setup
        `);

    outro('🚀 Happy coding with SveltyCMS!');

  } catch (error) {
    s.stop('❌ Setup failed');
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
