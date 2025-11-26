/**
 * @file apps/shared-utils/setupValidation.ts
 * @description Enhanced setup validation with detailed error reporting
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface SetupValidation {
	complete: boolean;
	reason?: string;
	missingFields?: string[];
	warnings?: string[];
}

/**
 * Validates the setup configuration with detailed feedback
 */
export function validateSetupConfiguration(): SetupValidation {
	const privateConfigPath = join(process.cwd(), 'config', 'private.ts');

	// Check if config file exists
	if (!existsSync(privateConfigPath)) {
		return {
			complete: false,
			reason: 'Configuration file not found',
			missingFields: ['config/private.ts']
		};
	}

	try {
		const configContent = readFileSync(privateConfigPath, 'utf8');
		const missingFields: string[] = [];
		const warnings: string[] = [];

		// Check required fields
		if (/JWT_SECRET_KEY:\s*(""|''|``)/.test(configContent)) {
			missingFields.push('JWT_SECRET_KEY');
		}

		if (/ENCRYPTION_KEY:\s*(""|''|``)/.test(configContent)) {
			missingFields.push('ENCRYPTION_KEY');
		}

		if (/DB_HOST:\s*(""|''|``)/.test(configContent)) {
			missingFields.push('DB_HOST');
		}

		if (/DB_NAME:\s*(""|''|``)/.test(configContent)) {
			missingFields.push('DB_NAME');
		}

		if (/DB_TYPE:\s*(""|''|``)/.test(configContent)) {
			missingFields.push('DB_TYPE');
		}

		// Check for warnings (optional but recommended fields)
		if (!/SMTP_HOST/.test(configContent) || /SMTP_HOST:\s*(""|''|``)/.test(configContent)) {
			warnings.push('SMTP not configured - email features will be disabled');
		}

		if (!/GOOGLE_CLIENT_ID/.test(configContent) || /GOOGLE_CLIENT_ID:\s*(""|''|``)/.test(configContent)) {
			warnings.push('Google OAuth not configured - social login disabled');
		}

		// If any required fields are missing, setup is incomplete
		if (missingFields.length > 0) {
			return {
				complete: false,
				reason: 'Required configuration fields are missing or empty',
				missingFields,
				warnings: warnings.length > 0 ? warnings : undefined
			};
		}

		// Setup is complete
		return {
			complete: true,
			warnings: warnings.length > 0 ? warnings : undefined
		};
	} catch (error) {
		return {
			complete: false,
			reason: `Error reading configuration: ${error instanceof Error ? error.message : 'Unknown error'}`,
			missingFields: ['config/private.ts (corrupted)']
		};
	}
}
