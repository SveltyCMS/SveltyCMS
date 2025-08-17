/**
 * @file src/routes/api/setup/reinit/+server.ts
 * @description Manual (re)initialization trigger endpoint.
 *
 * Invoked after the setup wizard writes a valid private config / DB credentials
 * to start (or restart if forced) the full system initialization sequence
 * without needing a full process restart.
 *
 * Behavior:
 *  - Validates DB host presence (ensures setup completed enough to proceed)
 *  - Returns immediate status object (initialized, already-initialized, in-progress, failed)
 *  - Optional force flag bypasses already-initialized short‑circuit
 *
 * Request Body (JSON): { "force"?: boolean }
 * Response (success example):
 *  {
 *    status: 'initialized' | 'already-initialized' | 'initialization-in-progress',
 *    system: { initialized, connected, authReady, initializing }
 *  }
 *
 * Notes / Security:
 *  - Consider restricting this endpoint (e.g., during setup only or require an admin token)
 *    in production deployments to prevent unauthorized reinitialization attempts.
 *
 * @usage
 *  POST /api/setup/reinit
 *  { "force": true }
 */
import { getSystemStatus, reinitializeSystem } from '@src/databases/db';
import { error, json } from '@sveltejs/kit';
import { existsSync, readFileSync } from 'fs';
import Path from 'path';
import type { RequestHandler } from './$types';

// System Logger
import { logger } from '@utils/logger.svelte';

function hasDbHostConfigured(): boolean {
	if (process.env.DB_HOST && process.env.DB_HOST.trim().length > 0) return true;
	try {
		const base = process.cwd();
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

export const POST: RequestHandler = async ({ request }) => {
	const { force } = await request.json().catch(() => ({ force: false }));
	if (!hasDbHostConfigured()) {
		throw error(400, 'Database host not configured yet. Complete setup first.');
	}
	const result = await reinitializeSystem(!!force);
	if (result.status === 'failed') {
		logger.error('Reinitialization failed', { error: result.error });
		return json(result, { status: 500 });
	}
	return json({ ...result, system: getSystemStatus() });
};
