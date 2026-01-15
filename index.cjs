// Plesk Passenger Entry Point for telemetry.sveltycms.com
async function loadApp() {
	// 100MB body size limit
	process.env.BODY_SIZE_LIMIT = '104857600';

	// FIX: Don't include https:// in HOST variable
	// Telemetry is a subdomain, no www prefix needed
	process.env.ORIGIN = process.env.ORIGIN || 'https://demo.sveltycms.com';

	// Plesk provides PORT
	process.env.PORT = process.env.PORT || '4173';

	// Import the SvelteKit-built server
	await import('./index.js');
}

loadApp();
