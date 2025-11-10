/**
 * @file tests/bun/helpers/db-helper.ts
 * @description Database helper functions for integration tests
 * These functions provide direct database access for test validation
 */

// Import database connection - adjust based on your database setup
// For now, using mock implementations since database infrastructure may not be ready

// Mock database state for testing
let mockUsers: unknown[] = [];
let mockUserCount = 0;

// Drop the entire database (reset for tests)
export async function dropDatabase(): Promise<void> {
	// Mock implementation - reset mock data
	mockUsers = [];
	mockUserCount = 0;
	console.log('Mock database dropped');
}

// Get user count from database
export async function getUserCount(): Promise<number> {
	// Mock implementation
	return mockUserCount;
}

// Check if user exists by email
export async function userExists(email: string): Promise<boolean> {
	// Mock implementation
	return mockUsers.some((user) => user.email.toLowerCase() === email.toLowerCase());
}

// Get user by email
export async function getUser(email: string): Promise<unknown | null> {
	// Mock implementation
	return mockUsers.find((user) => user.email.toLowerCase() === email.toLowerCase()) || null;
}

// Wait for a condition to be true
export async function waitFor(condition: () => Promise<boolean>, timeoutMs = 5000): Promise<boolean> {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (await condition()) {
			return true;
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	return false;
}
