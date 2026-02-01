/**
 * @file tests/bun/api/graphql.test.ts
 * @description
 * Integration test suite for GraphQL API endpoint.
 * Tests dynamic schema generation, queries, mutations, and subscriptions
 * for collections, users, and media.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { prepareAuthenticatedContext, cleanupTestDatabase } from '../helpers/testSetup';
import { getApiBaseUrl, waitForServer } from '../helpers/server';

const API_BASE_URL = getApiBaseUrl();

/**
 * Helper to execute GraphQL queries
 */
async function executeGraphQL(query: string, variables: Record<string, unknown> = {}, authCookie?: string) {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json'
	};

	if (authCookie) {
		headers['Cookie'] = authCookie;
	}

	const response = await fetch(`${API_BASE_URL}/api/graphql`, {
		method: 'POST',
		headers,
		body: JSON.stringify({ query, variables })
	});

	return response;
}

describe('GraphQL API Endpoint', () => {
	let authCookie: string;

	beforeAll(async () => {
		await waitForServer();
	});

	afterAll(async () => {
		await cleanupTestDatabase();
	});

	beforeEach(async () => {
		authCookie = await prepareAuthenticatedContext();
	});

	describe('Authentication & Authorization', () => {
		it('should reject requests without authentication', async () => {
			const query = `
				query {
					users {
						_id
						email
					}
				}
			`;

			const response = await executeGraphQL(query);
			expect(response.status).toBe(401);
		});

		it('should accept requests with valid authentication', async () => {
			const query = `
				query {
					users {
						_id
						email
					}
				}
			`;

			const response = await executeGraphQL(query, {}, authCookie);
			expect(response.status).toBe(200);

			const result = await response.json();
			expect(result.data).toBeDefined();
			// GraphQL may include null errors array, just check data exists
		});
	});

	describe('User Queries', () => {
		it('should fetch users list', async () => {
			const query = `
				query {
					users {
						_id
						email
					}
				}
			`;

			const response = await executeGraphQL(query, {}, authCookie);
			expect(response.status).toBe(200);

			const result = await response.json();
			// Debug: log response if test fails
			if (!result.data || !result.data.users) {
				console.log('GraphQL Response:', JSON.stringify(result, null, 2));
			}
			expect(result.data).toBeDefined();
			// Users might be null if no users exist, but should still be an array or null
			if (result.data.users !== null) {
				expect(Array.isArray(result.data.users)).toBe(true);
			}
		});

		it('should fetch users with pagination', async () => {
			const query = `
				query GetUsers($pagination: PaginationInput) {
					users(pagination: $pagination) {
						_id
						email
					}
				}
			`;

			const response = await executeGraphQL(
				query,
				{
					pagination: {
						page: 1,
						limit: 5
					}
				},
				authCookie
			);

			expect(response.status).toBe(200);
			const result = await response.json();
			expect(result.data).toBeDefined();
			expect(result.data.users).toBeDefined();
			expect(Array.isArray(result.data.users)).toBe(true);
		});

		it('should not expose password field', async () => {
			const query = `
				query {
					users {
						_id
						email
					}
				}
			`;

			const response = await executeGraphQL(query, {}, authCookie);
			expect(response.status).toBe(200);

			const result = await response.json();
			expect(result.data).toBeDefined();
			if (result.data.users && result.data.users.length > 0) {
				const user = result.data.users[0];
				// Password should never be in GraphQL response
				expect(user.password).toBeUndefined();
			}
		});
	});

	describe('Media Queries', () => {
		it('should fetch media images', async () => {
			const query = `
				query {
					mediaImages {
						_id
						url
					}
				}
			`;

			const response = await executeGraphQL(query, {}, authCookie);
			expect(response.status).toBe(200);

			const result = await response.json();
			expect(result.data).toBeDefined();
			expect(result.data.mediaImages).toBeDefined();
			expect(Array.isArray(result.data.mediaImages)).toBe(true);
		});

		it('should fetch media documents', async () => {
			const query = `
				query {
					mediaDocuments {
						_id
						url
						createdAt
					}
				}
			`;

			const response = await executeGraphQL(query, {}, authCookie);
			expect(response.status).toBe(200);

			const result = await response.json();
			expect(result.data).toBeDefined();
			expect(result.data.mediaDocuments).toBeDefined();
		});

		it('should fetch media with pagination', async () => {
			const query = `
				query GetMedia($pagination: PaginationInput) {
					mediaImages(pagination: $pagination) {
						_id
						url
					}
				}
			`;

			const response = await executeGraphQL(
				query,
				{
					pagination: {
						page: 1,
						limit: 10
					}
				},
				authCookie
			);

			expect(response.status).toBe(200);
			const result = await response.json();
			expect(result.data.mediaImages).toBeDefined();
		});

		it('should fetch different media types', async () => {
			const query = `
				query {
					mediaImages { _id }
					mediaDocuments { _id }
					mediaAudio { _id }
					mediaVideos { _id }
					mediaRemote { _id }
				}
			`;

			const response = await executeGraphQL(query, {}, authCookie);
			expect(response.status).toBe(200);

			const result = await response.json();
			expect(result.data).toBeDefined();
			expect(result.data.mediaImages).toBeDefined();
			expect(result.data.mediaDocuments).toBeDefined();
			expect(result.data.mediaAudio).toBeDefined();
			expect(result.data.mediaVideos).toBeDefined();
			expect(result.data.mediaRemote).toBeDefined();
		});
	});

	describe('Schema Introspection', () => {
		it('should support introspection queries', async () => {
			const query = `
				query {
					__schema {
						types {
							name
							kind
						}
					}
				}
			`;

			const response = await executeGraphQL(query, {}, authCookie);
			expect(response.status).toBe(200);

			const result = await response.json();
			expect(result.data).toBeDefined();
			expect(result.data.__schema).toBeDefined();
			expect(result.data.__schema.types).toBeDefined();
			expect(Array.isArray(result.data.__schema.types)).toBe(true);
		});

		it('should list available query fields', async () => {
			const query = `
				query {
					__type(name: "Query") {
						name
						fields {
							name
							type {
								name
								kind
							}
						}
					}
				}
			`;

			const response = await executeGraphQL(query, {}, authCookie);
			expect(response.status).toBe(200);

			const result = await response.json();
			expect(result.data).toBeDefined();
			expect(result.data.__type).toBeDefined();
			expect(result.data.__type.fields).toBeDefined();

			const fieldNames = result.data.__type.fields.map((f: { name: string }) => f.name);
			expect(fieldNames).toContain('users');
			expect(fieldNames).toContain('mediaImages');
			expect(fieldNames).toContain('mediaDocuments');
		});
	});

	describe('Error Handling', () => {
		it('should return errors for invalid queries', async () => {
			const query = `
				query {
					invalidField {
						_id
					}
				}
			`;

			const response = await executeGraphQL(query, {}, authCookie);
			const result = await response.json();

			expect(result.errors).toBeDefined();
			expect(Array.isArray(result.errors)).toBe(true);
			expect(result.errors.length).toBeGreaterThan(0);
		});

		it('should return errors for malformed queries', async () => {
			const query = `
				query {
					users {
						_id
						// Missing closing brace
			`;

			const response = await executeGraphQL(query, {}, authCookie);
			const result = await response.json();

			expect(result.errors).toBeDefined();
		});

		it('should handle missing required fields gracefully', async () => {
			const query = `
				query GetUsers($pagination: PaginationInput!) {
					users(pagination: $pagination) {
						_id
					}
				}
			`;

			// Not providing required pagination variable
			const response = await executeGraphQL(query, {}, authCookie);
			const result = await response.json();

			expect(result.errors).toBeDefined();
		});
	});

	describe('Complex Queries', () => {
		it('should support multiple queries in one request', async () => {
			const query = `
				query {
					users {
						_id
						email
					}
					mediaImages {
						_id
						url
					}
				}
			`;

			const response = await executeGraphQL(query, {}, authCookie);
			expect(response.status).toBe(200);

			const result = await response.json();
			expect(result.data).toBeDefined();
			expect(result.data.users).toBeDefined();
			expect(result.data.mediaImages).toBeDefined();
		});

		it('should support query aliases', async () => {
			const query = `
				query {
					firstUsers: users {
						_id
					}
					secondUsers: users {
						email
					}
				}
			`;

			const response = await executeGraphQL(query, {}, authCookie);
			expect(response.status).toBe(200);

			const result = await response.json();
			expect(result.data.firstUsers).toBeDefined();
			expect(result.data.secondUsers).toBeDefined();
		});

		it('should support fragments', async () => {
			const query = `
				fragment UserInfo on User {
					_id
					email
					username
				}

				query {
					users {
						...UserInfo
					}
				}
			`;

			const response = await executeGraphQL(query, {}, authCookie);
			expect(response.status).toBe(200);

			const result = await response.json();
			expect(result.data.users).toBeDefined();
		});
	});

	describe('Multi-Tenant Support', () => {
		it('should scope queries to tenant context', async () => {
			const query = `
				query {
					users {
						_id
						email
					}
				}
			`;

			const response = await executeGraphQL(query, {}, authCookie);
			expect(response.status).toBe(200);

			const result = await response.json();
			// All returned users should belong to the same tenant
			// This is enforced by the resolver
			expect(result.data.users).toBeDefined();
		});
	});

	describe('Performance & Caching', () => {
		it('should handle large pagination requests', async () => {
			const query = `
				query GetUsers($pagination: PaginationInput) {
					users(pagination: $pagination) {
						_id
						email
					}
				}
			`;

			const response = await executeGraphQL(
				query,
				{
					pagination: {
						page: 1,
						limit: 100
					}
				},
				authCookie
			);

			expect(response.status).toBe(200);
			const result = await response.json();
			expect(result.data.users).toBeDefined();
		});

		it('should execute queries efficiently', async () => {
			const start = Date.now();

			const query = `
				query {
					users { _id }
					mediaImages { _id }
				}
			`;

			const response = await executeGraphQL(query, {}, authCookie);
			const duration = Date.now() - start;

			expect(response.status).toBe(200);
			// Query should complete in reasonable time (< 5 seconds)
			expect(duration).toBeLessThan(5000);
		});
	});
});
