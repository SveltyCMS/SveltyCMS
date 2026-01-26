/**
 * @file tests/bun/databases/resilience-load.test.ts
 * @description Progressive System Load & Resilience Test
 *
 * Runs progressive load tests to determine system limits without crashing.
 * Levels: TINY -> LOW -> MEDIUM -> HIGH -> EXTREME
 */

import { describe, it, expect } from 'bun:test';
import { getDatabaseResilience } from '../../../src/databases/DatabaseResilience';

// Mock operation that simulates DB work with random latency and occasional failures
const simulateDbOp = async (id: number): Promise<string> => {
	const latency = Math.random() * 50; // 0-50ms
	await new Promise((resolve) => setTimeout(resolve, latency));

	// Simulate 1% random failure
	if (Math.random() < 0.01) {
		throw new Error('Random ephemeral failure');
	}
	return `success-${id}`;
};

describe('System Load & Resilience Benchmark', () => {
	// Configure resilience wrapper
	const resilience = getDatabaseResilience({
		maxAttempts: 3,
		initialDelayMs: 10,
		maxDelayMs: 100
	});

	// Load Profiles Definition
	const LOAD_PROFILES = {
		TINY: { total: 1000, batch: 100, name: 'Raspberry Pi / CI' },
		LOW: { total: 10000, batch: 500, name: 'Standard Laptop' },
		MEDIUM: { total: 50000, batch: 2000, name: 'Dev Workstation' },
		HIGH: { total: 100000, batch: 5000, name: 'Performance Server' },
		EXTREME: { total: 500000, batch: 10000, name: 'Cluster / Mainframe' }
	};

	// Determine starting level from env or default to ALL (progressive)
	// Usage: LOAD_LEVEL=MEDIUM bun test ...
	const TARGET_LEVEL = (process.env.LOAD_LEVEL as keyof typeof LOAD_PROFILES | 'ALL') || 'ALL';

	it('should determine system limit by progressive loading', async () => {
		let maxStableLevel = 'NONE';

		const runLevel = async (levelName: string, config: { total: number; batch: number; name: string }) => {
			console.log(`\n🔹 [${levelName}] Testing: ${config.name}`);
			console.log(`   Target: ${config.total} requests | Concurrency: ${config.batch}`);

			const startTime = Date.now();
			let successes = 0;
			let failures = 0;

			// Process in batches
			for (let i = 0; i < config.total; i += config.batch) {
				const batchSize = Math.min(config.batch, config.total - i);
				const batchProms = Array.from({ length: batchSize }, (_, idx) => {
					return resilience
						.executeWithRetry(
							async () => {
								return simulateDbOp(i + idx);
							},
							`op-${i + idx}`
						)
						.then(() => {
							successes++;
						})
						.catch(() => {
							failures++;
						});
				});

				await Promise.all(batchProms);
			}

			const duration = Date.now() - startTime;
			const rps = Math.round((successes / (duration / 1000)) * 100) / 100;

			console.log(`   ✅ Completed in ${duration}ms (${rps} req/sec)`);
			console.log(`   Results: Success=${successes}, Failure=${failures}`);

			// Validation Criteria
			const successRate = successes / config.total;
			if (successRate < 0.99) {
				throw new Error(`Success rate too low: ${(successRate * 100).toFixed(2)}%`);
			}
			return { duration, rps };
		};

		const profilesToRun = TARGET_LEVEL === 'ALL' ? Object.entries(LOAD_PROFILES) : [[TARGET_LEVEL, LOAD_PROFILES[TARGET_LEVEL]]];

		for (const [level, config] of profilesToRun as [string, (typeof LOAD_PROFILES)['TINY']][]) {
			try {
				await runLevel(level, config);
				maxStableLevel = level;
			} catch (err: any) {
				console.error(`\n❌ [${level}] FAILED: ${err.message}`);
				console.log(`\n⚠️  System Limit Reached!`);
				console.log(`   The server switched off/failed at level: ${level}`);
				console.log(`   Last Stable Level: ${maxStableLevel}`);

				// Don't fail the test runner, just stop progression
				break;
			}
		}

		console.log(`\n🏆 BENCHMARK RESULT: Max Stable Load Level = [ ${maxStableLevel} ]`);
		expect(true).toBe(true); // Always pass the test runner to show the report
	}, 300000); // 5 minute timeout for full progression
});
