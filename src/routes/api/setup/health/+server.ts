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
		const markerCandidates = [Path.join(base, 'config', '.installed'), Path.join(base, '.svelty_installed')];
		if (markerCandidates.some((p) => existsSync(p))) return true;
		if (process.env.SVELTY_SETUP_DONE === 'true') return true;
		if (process.env.DB_HOST && process.env.DB_HOST.trim().length > 0) return true;
		const candidates = [
			Path.join(base, 'config', 'private.ts'),
			Path.join(base, 'config', 'private.js'),
			Path.join(base, 'config', 'private.cjs'),
			Path.join(base, 'config', 'private.mjs')
		];
		const foundPath = candidates.find((p) => existsSync(p));
		if (!foundPath) return false;
		const raw = readFileSync(foundPath, 'utf8');
		const head = raw.slice(0, 32 * 1024);
		const dbHostRegex = /DB_HOST\s*[:=]\s*['"`]\s*([^'"`\s]+)\s*['"`]/m;
		const match = head.match(dbHostRegex);
		return !!(match && match[1] && match[1].trim().length > 0);
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
