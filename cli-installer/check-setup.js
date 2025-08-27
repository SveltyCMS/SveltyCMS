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

    // Check for required database configuration fields
    const hasDbHost = /DB_HOST\s*[:=]\s*['"`]\s*([^'"`\s]+)\s*['"`]/m.test(configContent);
    const hasDbName = /DB_NAME\s*[:=]\s*['"`]\s*([^'"`\s]+)\s*['"`]/m.test(configContent);
    // DB_USER can be empty for local MongoDB without authentication
    const hasDbUser = /DB_USER\s*[:=]\s*['"`]\s*([^'"`]*)\s*['"`]/m.test(configContent);

    return hasDbHost && hasDbName && hasDbUser;
  } catch (error) {
    console.log('⚠️ Could not read private config file:', error.message);
    return false;
  }
}
