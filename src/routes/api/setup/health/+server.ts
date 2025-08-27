/**
 * @file src/routes/api/setup/health/+server.ts
 * @description Lightweight health & setup status endpoint.
 *
 * Reports whether initial installation/setup is complete (config + DB host present)
 * and current runtime system status (initialized, connected, auth readiness, etc.).
 * Used by the setup wizard UI to poll readiness and transition to normal mode
 * once the system finishes full initialization after configuration is saved.
 *
 * Response Shape:
 *  {
 *    setupComplete: boolean,          // Configuration & DB host detected
 *    system: {
 *      initialized: boolean,          // Full system initialization finished
 *      connected: boolean,            // Database connection established
 *      authReady: boolean,            // Auth service available
 *      initializing: boolean          // Initialization currently in progress
 *    },
 *    mode: 'ready' | 'setup'          // Convenience aggregate state
 *  }
 *
 * @usage
 *  GET /api/setup/health
 */
import { getSystemStatus } from '@src/databases/db';
import { json } from '@sveltejs/kit';
import { existsSync, readFileSync } from 'fs';
import Path from 'path';
import type { RequestHandler } from './$types';

function detectSetupComplete(): boolean {
	try {
		const base = process.cwd();
		
		// Check environment variables first
		if (process.env.SVELTY_SETUP_DONE === 'true') return true;
		if (process.env.DB_HOST && process.env.DB_HOST.trim().length > 0) return true;
		
		// Check if private config file exists and is properly populated
		const privateConfigPath = Path.join(base, 'config', 'private.ts');
		if (!existsSync(privateConfigPath)) return false;
		
		const configContent = readFileSync(privateConfigPath, 'utf8');
		const hasDbHost = /DB_HOST\s*[:=]\s*['"`]\s*([^'"`\s]+)\s*['"`]/m.test(configContent);
		const hasDbName = /DB_NAME\s*[:=]\s*['"`]\s*([^'"`\s]+)\s*['"`]/m.test(configContent);
		// DB_USER can be empty for local MongoDB without authentication
		const hasDbUser = /DB_USER\s*[:=]\s*['"`]\s*([^'"`]*)\s*['"`]/m.test(configContent);
		
		return hasDbHost && hasDbName && hasDbUser;
	} catch {
		return false;
	}
}

export const GET: RequestHandler = async () => {
	const status = getSystemStatus();
	const setupComplete = detectSetupComplete();
	return json({
		setupComplete,
		system: status,
		mode: setupComplete && status.initialized ? 'ready' : 'setup'
	});
};
