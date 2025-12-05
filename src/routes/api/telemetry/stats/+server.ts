/*
 * @files api/telemetry/stats/+server.ts
 * @description Telemetry Statistics
 *
 * ### Features
 * - Aggregations
 * - Admin/Guest Access
 */
import { json } from '@sveltejs/kit';
import type { RequestEvent } from './$types';

// Mock Database for demonstration
// In reality, you would replace this with: await db.collection('telemetry').find(...)
const MOCK_DB_DATA = Array.from({ length: 50 }, (_, i) => ({
	id: crypto.randomUUID(),
	domain: i % 5 === 0 ? 'internal.corporate.com' : `blog-${i}.example.com`, // Some corporate domains
	version: i % 3 === 0 ? '0.5.0' : '0.4.9',
	node_version: i % 2 === 0 ? 'v20.10.0' : 'v18.17.0',
	db_type: i % 4 === 0 ? 'postgres' : 'mongodb',
	country: ['US', 'DE', 'FR', 'GB', 'JP'][i % 5],
	last_seen: new Date().toISOString(),
	environment: i % 10 === 0 ? 'development' : 'production',
	revenue_est: i % 5 === 0 ? '> $10M' : '< $1M' // Enriched data
}));

export async function GET({ locals }: RequestEvent) {
	const isAdmin = locals.user?.isAdmin || false; // Check Auth

	// 1. Calculate Aggregations (For Everyone)
	const stats = {
		total_installs: MOCK_DB_DATA.length,
		versions: aggregate(MOCK_DB_DATA, 'version'),
		databases: aggregate(MOCK_DB_DATA, 'db_type'),
		nodes: aggregate(MOCK_DB_DATA, 'node_version'),
		countries: aggregate(MOCK_DB_DATA, 'country')
	};

	// 2. Prepare Response
	if (isAdmin) {
		// ADMIN: Gets everything + Raw Data
		return json({
			role: 'admin',
			aggregates: stats,
			raw_data: MOCK_DB_DATA // <--- The Sensitive List
		});
	} else {
		// GUEST: Gets only Aggregates
		return json({
			role: 'guest',
			aggregates: stats,
			raw_data: [] // <--- Empty for privacy
		});
	}
}

// Helper to group and count
function aggregate(data: any[], key: string) {
	const map = new Map();
	data.forEach((item) => {
		const val = item[key];
		map.set(val, (map.get(val) || 0) + 1);
	});
	return Array.from(map.entries()).map(([label, count]) => ({ label, count }));
}
