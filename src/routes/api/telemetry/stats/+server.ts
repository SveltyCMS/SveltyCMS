/*
 * @files api/telemetry/stats/+server.ts
 * @description Telemetry Statistics (Mock Receiver Implementation)
 *
 * NOTE: This endpoint demonstrates how a Telemetry Receiver would aggregate data.
 * It uses mock data for demonstration purposes.
 *
 * ### Features
 * - Aggregations
 * - Admin Access Secured
 */
import { json } from '@sveltejs/kit';

// Mock Database for demonstration
// In a real Receiver implementation, this would query the telemetry database.
const MOCK_DB_DATA = Array.from({ length: 50 }, (_, i) => ({
	id: crypto.randomUUID(),
	domain: i % 5 === 0 ? 'internal.corporate.com' : `blog-${i}.example.com`,
	version: i % 3 === 0 ? '0.5.0' : '0.4.9',
	node_version: i % 2 === 0 ? 'v20.10.0' : 'v18.17.0',
	db_type: i % 4 === 0 ? 'postgres' : 'mongodb',
	country: ['US', 'DE', 'FR', 'GB', 'JP'][i % 5],
	last_seen: new Date().toISOString(),
	environment: i % 10 === 0 ? 'development' : 'production',
	revenue_est: i % 5 === 0 ? '> $10M' : '< $1M'
}));

// Unified Error Handling
import { apiHandler } from '@utils/apiHandler';

// ... (MOCK_DB_DATA definition)

export const GET = apiHandler(async ({ locals }) => {
	const isAdmin = locals.user?.isAdmin || false;

	// 1. Calculate Aggregations
	const stats = {
		total_installs: MOCK_DB_DATA.length,
		versions: aggregate(MOCK_DB_DATA, 'version'),
		databases: aggregate(MOCK_DB_DATA, 'db_type'),
		nodes: aggregate(MOCK_DB_DATA, 'node_version'),
		countries: aggregate(MOCK_DB_DATA, 'country')
	};

	const responseData = isAdmin ? { role: 'admin', aggregates: stats, raw_data: MOCK_DB_DATA } : { role: 'guest', aggregates: stats, raw_data: [] };

	return json({
		success: true,
		data: responseData,
		message: 'Telemetry statistics retrieved (Mock)'
	});
});

// Helper to group and count
function aggregate(data: any[], key: string) {
	const map = new Map();
	data.forEach((item) => {
		const val = item[key];
		map.set(val, (map.get(val) || 0) + 1);
	});
	return Array.from(map.entries()).map(([label, count]) => ({ label, count }));
}
