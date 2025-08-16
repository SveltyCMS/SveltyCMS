/**
 * @file cli-installer/check-setup.js
 * @description Simple function to check if setup is complete by examining private.ts
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Check if setup is complete by examining the private.ts config file
 * @returns {boolean} True if setup is complete, false otherwise
 */
export function checkSetup() {
  const privateConfigPath = resolve(process.cwd(), 'config/private.ts');

  if (!existsSync(privateConfigPath)) {
    return false;
  }

  try {
    const configContent = readFileSync(privateConfigPath, 'utf8');

    const hasDbType = configContent.includes('DB_TYPE:');
    const hasDbHost = configContent.includes('DB_HOST:');
    const hasDbName = configContent.includes('DB_NAME:');

    const dbHostMatch = configContent.match(/DB_HOST:\s*['"`]([^'"`]+)['"`]/);
    const hasValidDbHost = dbHostMatch && dbHostMatch[1] && dbHostMatch[1].trim() !== '';

    return hasDbType && hasDbHost && hasDbName && hasValidDbHost;
  } catch (error) {
    console.log('⚠️ Could not read private config file:', error.message);
    return false;
  }
}
