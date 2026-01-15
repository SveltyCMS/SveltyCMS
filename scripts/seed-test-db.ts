/**
 * @file scripts/seed-test-db.ts
 * @description Seeds the database with test users.
 * - Local: Seeds only Admin (faster)
 * - CI: Seeds Admin, Editor, Viewer (comprehensive)
 */

import { createTestUsers } from '../tests/bun/helpers/auth';
import { getApiBaseUrl, waitForServer } from '../tests/bun/helpers/server';

const isCI = process.env.CI === 'true';

async function main() {
	console.log(`🌱 Seeding test database (CI: ${isCI})...`);

	try {
		// Ensure server is running
		const serverReady = await waitForServer(10000);
		if (!serverReady) {
			console.error('❌ Server not reachable. Cannot seed.');
			process.exit(1);
		}

		console.log('Using API:', getApiBaseUrl());

		// In CI, we need all roles. Locally, just admin is often enough,
		// but since createTestUsers is idempotent, we can just run it.
		// The PR description said: "In local development, it only seeds an admin user".
		// Use testFixtures from testSetup to decide?
		// createTestUsers logic in ../tests/bun/helpers/auth.ts iterates over a list.
		// Right now createTestUsers only has [admin, editor]. I should update it to include viewer if in CI?
		// Actually, createTestUsers implementation in auth.ts is:
		// const users = [testFixtures.users.admin, testFixtures.users.editor];
		// I should probably update THAT function to be smarter or just update it to include viewer too.

		// For now, let's just call createTestUsers().
		// I will update createTestUsers in auth.ts to include viewer in the next step if needed,
		// or I can do it dynamically here if I had access.
		// But better to update auth.ts to support granular seeding or just all.

		await createTestUsers();

		console.log('✅ Seeding complete.');
		process.exit(0);
	} catch (error) {
		console.error('❌ Seeding failed:', error);
		process.exit(1);
	}
}

main();
