#!/usr/bin/env bun
/**
 * @file tests/bun/test-signup-oauth.ts
 * @description Simple test for first user signup and OAuth testing
 */

import { cleanupTestDatabase, cleanupTestEnvironment, initializeTestEnvironment } from './helpers/testSetup';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5173';

async function testFirstUserSignup() {
	console.log('🧪 Testing first user signup via email...');

	// Drop database to ensure clean state
	await cleanupTestDatabase();

	// Test first user signup
	const response = await fetch(`${API_BASE_URL}/api/user/createUser`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			email: 'admin@test.com',
			username: 'admin',
			password: 'Test123!',
			confirm_password: 'Test123!',
			firstName: 'Admin',
			lastName: 'User'
		})
	});

	console.log(`Response status: ${response.status}`);
	const result = await response.json();
	console.log('Response:', JSON.stringify(result, null, 2));

	if (response.status === 200 && result.success) {
		console.log('✅ First user signup successful!');
		return true;
	} else {
		console.log('❌ First user signup failed');
		return false;
	}
}

async function testOAuthSignup() {
	console.log('\n🧪 Testing OAuth signup after dropping database...');

	// Drop database again
	await cleanupTestDatabase();

	// Test OAuth signup (simulated)
	const response = await fetch(`${API_BASE_URL}/api/user/createUser`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			email: 'oauth@test.com',
			username: 'oauthuser',
			firstName: 'OAuth',
			lastName: 'User',
			authMethod: 'oauth',
			provider: 'google'
		})
	});

	console.log(`Response status: ${response.status}`);
	const result = await response.json();
	console.log('Response:', JSON.stringify(result, null, 2));

	if (response.status === 200 && result.success) {
		console.log('✅ OAuth signup successful!');
		return true;
	} else {
		console.log('❌ OAuth signup failed');
		return false;
	}
}

async function testSubsequentUserRequiresToken() {
	console.log('\n🧪 Testing subsequent user requires invitation token...');

	// Drop database and create first user
	await cleanupTestDatabase();

	// Create first user
	await fetch(`${API_BASE_URL}/api/user/createUser`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			email: 'first@test.com',
			username: 'first',
			password: 'Test123!',
			confirm_password: 'Test123!'
		})
	});

	// Try to create second user without token
	const response = await fetch(`${API_BASE_URL}/api/user/createUser`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			email: 'second@test.com',
			username: 'second',
			password: 'Test123!',
			confirm_password: 'Test123!'
		})
	});

	console.log(`Response status: ${response.status}`);
	const result = await response.json();
	console.log('Response:', JSON.stringify(result, null, 2));

	if (response.status === 400 && !result.success) {
		console.log('✅ Subsequent user correctly requires invitation token!');
		return true;
	} else {
		console.log('❌ Subsequent user signup should have failed without token');
		return false;
	}
}

async function checkServerStatus() {
	try {
		const response = await fetch(`${API_BASE_URL}/api/dashboard/systemInfo`, {
			method: 'GET'
		});

		if (response.status === 401 || response.status === 200) {
			console.log('✅ Server is running');
			return true;
		}

		console.log(`❌ Server returned unexpected status: ${response.status}`);
		return false;
	} catch (error) {
		console.log(`❌ Server is not running: ${error.message}`);
		return false;
	}
}

async function runTests() {
	console.log('🚀 Testing First User Signup and OAuth');
	console.log(`📍 API Base URL: ${API_BASE_URL}`);

	// Check server status
	const serverRunning = await checkServerStatus();
	if (!serverRunning) {
		console.log('\n❌ Server is not running. Please start the development server first:');
		console.log('   bun run dev');
		process.exit(1);
	}

	// Initialize test environment
	await initializeTestEnvironment();

	let passed = 0;
	let failed = 0;

	// Test 1: First user signup via email
	if (await testFirstUserSignup()) {
		passed++;
	} else {
		failed++;
	}

	// Test 2: OAuth signup (first user)
	if (await testOAuthSignup()) {
		passed++;
	} else {
		failed++;
	}

	// Test 3: Subsequent user requires token
	if (await testSubsequentUserRequiresToken()) {
		passed++;
	} else {
		failed++;
	}

	// Cleanup
	await cleanupTestEnvironment();

	console.log('\n📊 Test Results:');
	console.log(`✅ Passed: ${passed}`);
	console.log(`❌ Failed: ${failed}`);
	console.log(`📈 Total: ${passed + failed}`);

	if (failed > 0) {
		console.log('\n❌ Some tests failed. Check the output above for details.');
		process.exit(1);
	} else {
		console.log('\n🎉 All tests passed!');
		process.exit(0);
	}
}

runTests().catch((error) => {
	console.error('❌ Test runner error:', error);
	process.exit(1);
});
