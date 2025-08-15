#!/usr/bin/env node

/**
 * @file scripts/refactor-settings.js
 * @description Refactoring script to migrate from global settings to proper SvelteKit environment variable usage
 *
 * This script:
 * 1. Replaces getGlobalSetting calls with proper imports
 * 2. Separates private and public settings
 * 3. Uses proper SvelteKit environment variable imports
 * 4. Follows security best practices
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define the source directory
const srcDir = path.join(__dirname, '..', 'src');

// Files to exclude from processing
const excludePatterns = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '*.test.js',
  '*.test.ts',
  '*.spec.js',
  '*.spec.ts',
  'refactor-settings.js'
];

// Settings that should be private (server-only)
const PRIVATE_SETTINGS = [
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'JWT_SECRET_KEY',
  'ENCRYPTION_KEY',
  'SESSION_SECRET',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_API_KEY',
  'TWITCH_TOKEN',
  'SECRET_MAPBOX_API_TOKEN',
  'REDIS_HOST',
  'REDIS_PORT',
  'REDIS_PASSWORD',
  'USE_REDIS',
  'LOG_LEVEL',
  'LOG_LEVELS',
  'LOG_RETENTION_DAYS',
  'LOG_ROTATION_SIZE',
  'MULTI_TENANT'
];

// Settings that should be public (client-accessible)
const PUBLIC_SETTINGS = [
  'SITE_NAME',
  'HOST_DEV',
  'HOST_PROD',
  'DEFAULT_CONTENT_LANGUAGE',
  'AVAILABLE_CONTENT_LANGUAGES',
  'BASE_LOCALE',
  'LOCALES',
  'MEDIA_FOLDER',
  'MAX_FILE_SIZE',
  'BODY_SIZE_LIMIT',
  'PASSWORD_LENGTH',
  'DEMO',
  'SEASONS',
  'SEASON_REGION',
  'USE_GOOGLE_OAUTH',
  'PKG_VERSION',
  'SETUP_COMPLETED',
  'MEDIA_OUTPUT_FORMAT_QUALITY',
  'MEDIASERVER_URL',
  'IMAGE_SIZES',
  'EXTRACT_DATA_PATH',
  'USE_ARCHIVE_ON_DELETE',
  'USE_MAPBOX',
  'MAPBOX_API_TOKEN'
];

// Function to check if a file should be excluded
function shouldExcludeFile(filePath) {
  return excludePatterns.some(pattern => {
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace('*', '.*'));
      return regex.test(path.basename(filePath));
    }
    return filePath.includes(pattern);
  });
}

// Function to determine if a setting is private or public
function isPrivateSetting(settingName) {
  return PRIVATE_SETTINGS.includes(settingName);
}

// Function to determine if a setting is public
function isPublicSetting(settingName) {
  return PUBLIC_SETTINGS.includes(settingName);
}

// Function to get the appropriate import and function for a setting
function getSettingFunction(settingName) {
  if (isPrivateSetting(settingName)) {
    return {
      import: "import { getPrivateSetting } from '@src/lib/settings.server';",
      function: 'getPrivateSetting'
    };
  } else if (isPublicSetting(settingName)) {
    return {
      import: "import { getPublicSetting } from '@src/lib/settings.server';",
      function: 'getPublicSetting'
    };
  } else {
    // Default to public for unknown settings
    return {
      import: "import { getPublicSetting } from '@src/lib/settings.server';",
      function: 'getPublicSetting'
    };
  }
}

// Function to process a single file
function processFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    let newContent = content;

    // Find all getGlobalSetting calls
    const globalSettingRegex = /getGlobalSetting\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
    let match;
    const imports = new Set();
    const replacements = [];

    while ((match = globalSettingRegex.exec(content)) !== null) {
      const fullMatch = match[0];
      const settingName = match[1];
      const { import: importStatement, function: functionName } = getSettingFunction(settingName);

      imports.add(importStatement);
      replacements.push({
        from: fullMatch,
        to: `${functionName}('${settingName}')`
      });
    }

    // Apply replacements
    replacements.forEach(({ from, to }) => {
      newContent = newContent.replace(new RegExp(escapeRegExp(from), 'g'), to);
    });

    // Add imports if needed
    if (imports.size > 0) {
      // Check if file already has imports from settings.server
      const hasSettingsImport = /import.*from.*['"`]@src\/lib\/settings\.server['"`]/.test(newContent);

      if (!hasSettingsImport) {
        // Find the last import statement
        const importRegex = /import.*from.*['"`][^'"`]+['"`];?\s*\n/g;
        const importMatches = [...newContent.matchAll(importRegex)];

        if (importMatches.length > 0) {
          const lastImport = importMatches[importMatches.length - 1];
          const insertIndex = lastImport.index + lastImport[0].length;

          const importStatements = Array.from(imports).join('\n');
          newContent = newContent.slice(0, insertIndex) + '\n' + importStatements + '\n' + newContent.slice(insertIndex);
        } else {
          // No imports found, add at the beginning
          const importStatements = Array.from(imports).join('\n');
          newContent = importStatements + '\n\n' + newContent;
        }
      }
    }

    // Write the modified content back to the file
    if (newContent !== content) {
      fs.writeFileSync(filePath, newContent, 'utf8');
      console.log(`✅ Updated: ${filePath}`);
      modified = true;
    }

    return modified;
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return false;
  }
}

// Function to escape regex special characters
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Function to recursively process directories
function processDirectory(dirPath) {
  const items = fs.readdirSync(dirPath);
  let totalModified = 0;

  for (const item of items) {
    const fullPath = path.join(dirPath, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      if (!shouldExcludeFile(fullPath)) {
        totalModified += processDirectory(fullPath);
      }
    } else if (stat.isFile()) {
      if (!shouldExcludeFile(fullPath)) {
        const ext = path.extname(fullPath);
        if (['.js', '.ts', '.svelte'].includes(ext)) {
          if (processFile(fullPath)) {
            totalModified++;
          }
        }
      }
    }
  }

  return totalModified;
}

// Main execution
console.log('🔄 Starting settings refactoring...');
console.log('📁 Processing directory:', srcDir);

const startTime = Date.now();
const modifiedFiles = processDirectory(srcDir);
const endTime = Date.now();

console.log('\n📊 Refactoring Summary:');
console.log(`✅ Modified files: ${modifiedFiles}`);
console.log(`⏱️  Time taken: ${endTime - startTime}ms`);

console.log('\n🔒 Security Notes:');
console.log('• Private settings are now server-only');
console.log('• Public settings are client-accessible');
console.log('• Environment variables follow SvelteKit best practices');
console.log('• Only 7 essential environment variables needed for initial setup');
console.log('• All other configuration stored in database');
console.log('• Use $env/static/private for build-time essential config');
console.log('• Use $env/dynamic/private for runtime essential config');

console.log('\n📝 Next Steps:');
console.log('1. Review the changes and test thoroughly');
console.log('2. Update environment variables to only include essential ones:');
console.log('   - DB_TYPE, DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD');
console.log('   - JWT_SECRET_KEY, ENCRYPTION_KEY');
console.log('3. Remove all other environment variables from .env files');
console.log('4. Configure all other settings through the web interface');
console.log('5. Test both development and production builds');
