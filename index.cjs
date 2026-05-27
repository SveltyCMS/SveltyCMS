'use strict';
// Plesk Passenger Entry Point for svelte.asset-trade.de
async function loadApp() {
	// 100MB body size limit
	process.env.BODY_SIZE_LIMIT = '104857600';

	// FIX: Don't include https:// in HOST variable
	// Telemetry is a subdomain, no www prefix needed
	process.env.ORIGIN = process.env.ORIGIN || 'https://svelte.asset-trade.de';

	// Plesk provides PORT
	process.env.PORT = process.env.PORT || '4173';

	// Import the SvelteKit-built server
	await import('./index.js');
}

loadApp();
