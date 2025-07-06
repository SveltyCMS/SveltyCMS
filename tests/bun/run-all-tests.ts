#!/usr/bin/env bun
/**
 * @file tests/bun/run-all-tests.ts
 * @description Run all working Bun API tests for SveltyCMS
 */

import { $ } from 'bun';

console.log('🚀 Running SveltyCMS API tests...\n');

try {
	console.log('📋 Running comprehensive API endpoint tests...');
	await $`bun test tests/bun/api/api-endpoints.test.ts`;
	console.log('\n✅ All API tests completed successfully!');
} catch {
	console.log('\n❌ API tests failed!');
	process.exit(1);
}
