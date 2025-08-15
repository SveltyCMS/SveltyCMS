/**
 * @file cli-installer/check-setup.js
 * @description Simple function to check if setup is complete by examining environment files
 */

import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Check if setup is complete by examining the .env and .env.local files
 * @returns {boolean} True if setup is complete, false otherwise
 */
export function checkSetup() {
  const envPath = resolve(process.cwd(), '.env');
  const envLocalPath = resolve(process.cwd(), '.env.local');

  // Check if both environment files exist
  if (!existsSync(envPath) || !existsSync(envLocalPath)) {
    return false;
  }

  try {
    const envContent = readFileSync(envPath, 'utf8');
    const envLocalContent = readFileSync(envLocalPath, 'utf8');

    // Check for required database configuration in .env
    const hasDbType = envContent.includes('DB_TYPE=');
    const hasDbHost = envContent.includes('DB_HOST=');
    const hasDbPort = envContent.includes('DB_PORT=');
    const hasJwtSecret = envContent.includes('JWT_SECRET_KEY=');
    const hasEncryptionKey = envContent.includes('ENCRYPTION_KEY=');

    // Check for required database configuration in .env.local
    const hasDbName = envLocalContent.includes('DB_NAME=');
    const hasDbUser = envLocalContent.includes('DB_USER=');
    const hasDbPassword = envLocalContent.includes('DB_PASSWORD=');

    // Extract and validate DB_HOST value
    const dbHostMatch = envContent.match(/DB_HOST=([^\r\n]+)/);
    const hasValidDbHost = dbHostMatch && dbHostMatch[1] && dbHostMatch[1].trim() !== '';

    // Extract and validate DB_NAME value
    const dbNameMatch = envLocalContent.match(/DB_NAME=([^\r\n]+)/);
    const hasValidDbName = dbNameMatch && dbNameMatch[1] && dbNameMatch[1].trim() !== '';

    // Extract and validate JWT_SECRET_KEY value
    const jwtMatch = envContent.match(/JWT_SECRET_KEY=([^\r\n]+)/);
    const hasValidJwt = jwtMatch && jwtMatch[1] && jwtMatch[1].trim() !== '';

    return hasDbType && hasDbHost && hasDbPort && hasDbName && hasDbUser && hasDbPassword &&
      hasJwtSecret && hasEncryptionKey && hasValidDbHost && hasValidDbName && hasValidJwt;
  } catch (error) {
    console.log('⚠️ Could not read environment files:', error.message);
    return false;
  }
}
