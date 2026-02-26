/**
 * @file tests/benchmarks/database-performance.ts
 * @description Automated performance benchmarking for SveltyCMS.
 * Tests setup speed and cache hit rates across all supported databases.
 *
 * Usage:
 * bun run tests/benchmarks/database-performance.ts [mongodb|sqlite|postgresql|mariadb] [true|false (useRedis)]
 */

async function run() {
	const origin = process.env.APP_URL || 'http://localhost:5173';
	const setupUrl = `${origin}/setup`;

	const dbs = [
		{
			type: 'mongodb',
			host: 'localhost',
			port: 27017,
			name: 'SveltyCMS_Bench',
			user: '',
			password: ''
		},
		{
			type: 'sqlite',
			host: './config/database',
			port: '',
			name: 'SveltyCMS_Bench.db',
			user: '',
			password: ''
		},
		{
			type: 'postgresql',
			host: 'localhost',
			port: 5432,
			name: 'SveltyCMS_Bench_PG',
			user: 'postgres',
			password: 'Password123!'
		},
		{
			type: 'mariadb',
			host: 'localhost',
			port: 3306,
			name: 'SveltyCMS_Bench_Maria',
			user: 'root',
			password: 'Password123!'
		}
	];

	async function callAction(action: string, formData: FormData) {
		const response = await fetch(`${setupUrl}?/${action}`, {
			method: 'POST',
			body: formData,
			headers: {
				Origin: origin
			}
		});
		return await response.json();
	}

	const dbType = process.argv[2];
	const useRedis = process.argv[3] === 'true';

	if (!dbType) {
		console.log('Usage: bun run tests/benchmarks/database-performance.ts <dbType> <useRedis>');
		console.log('Available DBs: mongodb, sqlite, postgresql, mariadb');
		process.exit(0);
	}

	const dbConfig = dbs.find((d) => d.type === dbType);
	if (!dbConfig) {
		console.error(`DB type '${dbType}' not supported by benchmark script.`);
		process.exit(1);
	}

	console.log(`\n🚀 Starting Benchmark: ${dbConfig.type.toUpperCase()}`);
	console.log(`📡 Target: ${origin}`);
	console.log(`💾 Redis: ${useRedis ? 'ENABLED' : 'DISABLED (In-Memory)'}`);

	// 1. Wait for server to be ready
	let ready = false;
	process.stdout.write('⏳ Waiting for server...');
	for (let i = 0; i < 30; i++) {
		try {
			const resp = await fetch(origin);
			if (resp.status === 200 || resp.status === 302) {
				ready = true;
				break;
			}
		} catch (_e) {}
		process.stdout.write('.');
		await new Promise((r) => setTimeout(r, 1000));
	}
	console.log('\n');

	if (!ready) {
		console.error("❌ Server not ready. Ensure 'bun run dev' is active.");
		process.exit(1);
	}

	// 2. Test Connection
	console.log('🛠️ Step 1: Testing Database Connection...');
	const testData = new FormData();
	testData.append('config', JSON.stringify(dbConfig));
	testData.append('createIfMissing', 'true');
	const testRes = await callAction('testDatabase', testData);
	console.log(`   Result: ${testRes.type === 'success' ? '✅ Connected' : '❌ Failed'}`);
	if (testRes.type !== 'success') {
		console.error('   Error details:', JSON.stringify(testRes));
		process.exit(1);
	}

	// 3. Seed
	console.log('🌱 Step 2: Seeding System...');
	const seedData = new FormData();
	seedData.append('config', JSON.stringify(dbConfig));
	const seedRes = await callAction('seedDatabase', seedData);
	console.log(`   Result: ${seedRes.type === 'success' ? '✅ Seeded' : '❌ Failed'}`);

	// 4. Complete Setup
	console.log('🏁 Step 3: Completing Setup (Hydration)...');
	const completeData = new FormData();
	const startSetup = performance.now();
	completeData.append(
		'data',
		JSON.stringify({
			database: dbConfig,
			admin: {
				username: 'admin',
				email: 'admin@example.com',
				password: 'Password123!',
				confirmPassword: 'Password123!'
			},
			system: {
				siteName: `SveltyCMS benchmark`,
				multiTenant: false,
				demoMode: false,
				useRedis: useRedis,
				redisHost: 'localhost',
				redisPort: 6379
			}
		})
	);
	const completeRes = await callAction('completeSetup', completeData);
	const endSetup = performance.now();
	console.log(`   Result: ${completeRes.type === 'success' ? '✅ Complete' : '❌ Failed'}`);
	console.log(`   ⏱️ Setup Duration: ${(endSetup - startSetup).toFixed(2)}ms`);

	// 5. Cache Performance
	console.log('⚡ Step 4: Measuring Cache Performance (Handshake)...');
	const latencies = [];
	for (let i = 1; i <= 5; i++) {
		const start = performance.now();
		await fetch(`${origin}/api/settings/public`, { headers: { Origin: origin } });
		const end = performance.now();
		const lat = end - start;
		latencies.push(lat);
		console.log(`   Hit ${i}: ${lat.toFixed(2)}ms ${i === 1 ? '(Cold)' : '(Warmed)'}`);
	}

	const avgWarmed = latencies.slice(1).reduce((a, b) => a + b, 0) / 4;
	console.log(`\n📊 Final Metrics for ${dbType}:`);
	console.log(`   - Cold Start: ${latencies[0].toFixed(2)}ms`);
	console.log(`   - Steady State (Avg): ${avgWarmed.toFixed(2)}ms`);
	console.log(`   - Setup Speed: ${(endSetup - startSetup).toFixed(2)}ms`);
}

run().catch(console.error);
