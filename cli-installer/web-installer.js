// SveltyCMS Web Installer: creates minimal config, starts dev server, launches setup wizard

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

function generateJWTSecret() {
  return crypto.randomBytes(64).toString('hex'); // 128-char random secret
}

function checkNodeVersion() {
  // Enforce Node.js version from package.json
  const packageJsonPath = path.resolve(process.cwd(), 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  const requiredVersionString = packageJson.engines.node;
  const requiredMajorVersion = parseInt(requiredVersionString.match(/\d+/)[0], 10);
  const currentMajorVersion = parseInt(process.version.slice(1).split('.')[0], 10);
  if (currentMajorVersion < requiredMajorVersion) {
    console.clear();
    intro(`${pc.bgRed(pc.white(pc.bold(' SveltyCMS Environment Error ')))}`);
    outro(`Node.js version ${requiredVersionString} is required, but you're using ${process.version}.\nPlease update Node.js and run the installer again.`);
    process.exit(1);
  }
}

function createMinimalConfig() {
  const configDir = path.resolve(process.cwd(), 'config');
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
  const privateConfigPath = path.join(configDir, 'private.ts');
  const templatePath = path.join(process.cwd(), 'templates', 'private.template.ts');
  if (!fs.existsSync(privateConfigPath)) {
    if (fs.existsSync(templatePath)) {
      fs.copyFileSync(templatePath, privateConfigPath);

    } else {
      console.error('❌ private.template.ts missing. Cannot create private config.');
      process.exit(1);
    }
  }
}

async function startDevServer() {
  const s = spinner();
  s.start('Starting development server...');
  try {
    exec('npm run dev', {
      cwd: process.cwd(),
      detached: true,
      stdio: 'ignore'
    });
    await new Promise(resolve => setTimeout(resolve, 3000));
    s.stop('✅ Development server started');
    return true;
  } catch (error) {
    s.stop('❌ Failed to start development server');
    console.error('Error:', error.message);
    return false;
  }
}

// Wait for setup wizard to be available
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
  const host = process.env.HOST || '127.0.0.1';
  const port = process.env.PORT || 5173;
  const setupUrl = `http://${host}:${port}/setup`;
  console.log('\n🌐 Waiting for setup wizard to be available...');
  const ready = await waitForSetupPage(setupUrl);
  if (ready) {
    console.log(`📋 Opening setup wizard: ${setupUrl}`);
    await open(setupUrl);
  } else {
    console.log('💡 Setup wizard not available. Please open your browser and navigate to:', setupUrl);
  }
}
}

// Remove all systemPreferences from MongoDB for a fresh install
async function clearGlobalSettings() {
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

  export async function main() {
    console.clear();
    checkNodeVersion();
    const isFresh = process.argv.includes('--fresh');
    if (isFresh) await clearGlobalSettings();
    intro(`${pc.bgBlue(pc.white(pc.bold(' SveltyCMS Web Installer ')))}`);
    note(`This installer will:
  1. Create minimal configuration files
  2. Start the development server
  3. Launch a web-based setup wizard
  4. Guide you through database configuration
  All settings will be stored in the database for easy management.`);
    const s = spinner();
    s.start('Setting up SveltyCMS...');
    try {
      createMinimalConfig();
      const serverStarted = await startDevServer();
      if (!serverStarted) {
        outro('❌ Failed to start development server. Please check your configuration.');
        process.exit(1);
      }
      s.stop('✅ Setup complete!');
      await openSetupWizard();
      const host = process.env.HOST || '127.0.0.1';
      const port = process.env.PORT || 5173;
      const setupUrl = `http://${host}:${port}/setup`;
      note(`🎉 SveltyCMS is ready!
  The web-based setup wizard will guide you through:
  • Database connection configuration
  • Initial admin user creation
  • System settings configuration
  • API keys and integrations
  You can access the setup wizard at: ${setupUrl}`);
      outro('🚀 Happy coding with SveltyCMS!');
    } catch (error) {
      s.stop('❌ Setup failed');
      console.error('Error:', error.message);
      process.exit(1);
    }
  }
  s.stop('✅ Setup complete!');
