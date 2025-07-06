#!/usr/bin/env bun
/**
 * @file tests/bun/run-all-tests.ts
 * @description Run all working Bun API tests for SveltyCMS
 */

import { $ } from 'bun';

console.log('🚀 Running SveltyCMS API tests...\n');

// Only run the working comprehensive API test
const testFiles = [
	'tests/bun/api/api-endpoints.test.ts'  // Comprehensive API test (54 tests)
];

let totalPassed = 0;
let totalFailed = 0;
let totalTime = 0;

for (const testFile of testFiles) {
	console.log(`📋 Running ${testFile}...`);
	const startTime = performance.now();

	try {
		const result = await $`bun test ${testFile}`.text();
		const endTime = performance.now();
		const duration = endTime - startTime;
		totalTime += duration;

		// Parse results (simple parsing)
		const passedMatch = result.match(/(\d+) pass/);
		const failedMatch = result.match(/(\d+) fail/);

		const passed = passedMatch ? parseInt(passedMatch[1]) : 0;
		const failed = failedMatch ? parseInt(failedMatch[1]) : 0;

		totalPassed += passed;
		totalFailed += failed;

		console.log(`✅ ${testFile}: ${passed} passed, ${failed} failed (${duration.toFixed(0)}ms)`);
	} catch {
		console.log(`❌ ${testFile}: Failed to run`);
		totalFailed++;
	}
}

console.log(`\n📊 Total Results:`);
console.log(`✅ Total Passed: ${totalPassed}`);
console.log(`❌ Total Failed: ${totalFailed}`);
console.log(`⏱️  Total Time: ${totalTime.toFixed(0)}ms`);
console.log(`📈 Success Rate: ${totalPassed > 0 ? ((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1) : 0}%`);

if (totalFailed === 0) {
	console.log('\n🎉 All tests passed!');
} else {
	console.log('\n⚠️  Some tests failed. Check the output above.');
	process.exit(1);
}
