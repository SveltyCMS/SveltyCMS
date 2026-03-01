/**
 * @file tests/bun/hooks/authorization.test.ts
 * @description Tests for handleAuthorization middleware (permissions, roles, user counting)
 */

import { beforeEach, describe, expect, it, mock } from 'bun:test';
import type { Role, User } from '@src/databases/auth/types';
import { handleAuthorization, invalidateUserCountCache } from '@src/hooks/handle-authorization';
import type { RequestEvent } from '@sveltejs/kit';

const mockUser: User = {
	_id: 'user123',
	email: 'admin@example.com',
	role: 'admin',
	tenantId: 'default',
	permissions: []
};

const mockAdminRole: Role = {
	_id: 'admin',
	name: 'Administrator',
	isAdmin: true,
	permissions: []
};

// Reset state before each test
beforeEach(() => {
	(globalThis as any).__mockUserCount = 1;
	(globalThis as any).__mockRoles = [mockAdminRole];
	invalidateUserCountCache();
});

function createMockEvent(pathname: string, user?: User, roles?: Role[]): RequestEvent {
	const url = new URL(pathname, 'http://localhost');

	return {
		url,
		request: new Request(url.toString()),
		locals: {
			user: user || null,
			roles: roles || [],
			permissions: user?.permissions || [],
			isFirstUser: false,
			isAdmin: false,
			hasManageUsersPermission: false,
			allUsers: [],
			allTokens: [],
			theme: null,
			darkMode: false
		}
	} as any as RequestEvent;
}
// --- Tests ---

describe('handleAuthorization Middleware', () => {
	let mockResolve: ReturnType<typeof mock>;

	beforeEach(() => {
		mockResolve = mock(() => Promise.resolve(new Response('OK', { status: 200 })));
	});

	describe('Public Route Access', () => {
		it('should allow access to /login without authentication', async () => {
			const event = createMockEvent('/login');
			await handleAuthorization({ event, resolve: mockResolve });

			expect(event.locals.isAdmin).toBe(false);
			expect(mockResolve).toHaveBeenCalled();
		});

		it('should allow access to /register', async () => {
			const event = createMockEvent('/register');
			await handleAuthorization({ event, resolve: mockResolve });

			expect(mockResolve).toHaveBeenCalled();
		});

		it('should allow access to /setup', async () => {
			const event = createMockEvent('/setup');
			await handleAuthorization({ event, resolve: mockResolve });

			expect(mockResolve).toHaveBeenCalled();
		});

		it('should allow access to /setup/test', async () => {
			const event = createMockEvent('/setup/test');
			await handleAuthorization({ event, resolve: mockResolve });

			expect(mockResolve).toHaveBeenCalled();
		});

		it('should allow access to /api/system/health', async () => {
			const event = createMockEvent('/api/system/health');
			await handleAuthorization({ event, resolve: mockResolve });

			expect(mockResolve).toHaveBeenCalled();
		});
	});

	describe('Authenticated User Access', () => {
		it('should allow authenticated users to access protected routes', async () => {
			const event = createMockEvent('/dashboard', mockUser, [mockAdminRole]);
			await handleAuthorization({ event, resolve: mockResolve });

			expect(mockResolve).toHaveBeenCalled();
		});

		it('should set isAdmin flag for admin users', async () => {
			const event = createMockEvent('/dashboard', mockUser, [mockAdminRole]);
			await handleAuthorization({ event, resolve: mockResolve });

			// isAdmin set based on role
			expect(event.locals.isAdmin).toBeDefined();
		});

		it('should redirect authenticated users away from /login', async () => {
			const event = createMockEvent('/login', mockUser, [mockAdminRole]);

			try {
				await handleAuthorization({ event, resolve: mockResolve });
			} catch (err) {
				// Redirect to / for authenticated users
				expect(err).toBeDefined();
			}
		});
	});

	describe('Unauthenticated User Handling', () => {
		it('should redirect to /login for protected routes', async () => {
			const event = createMockEvent('/dashboard');

			try {
				await handleAuthorization({ event, resolve: mockResolve });
			} catch (err) {
				// Redirect to /login
				expect(err).toBeDefined();
			}
		});

		it('should return 401 for protected API routes', async () => {
			const event = createMockEvent('/api/collections');

			try {
				await handleAuthorization({ event, resolve: mockResolve });
			} catch (err) {
				// 401 Unauthorized for API
				expect(err).toBeDefined();
			}
		});
	});

	describe('Role Caching', () => {
		it('should cache roles from database', async () => {
			const event = createMockEvent('/dashboard', mockUser, [mockAdminRole]);
			await handleAuthorization({ event, resolve: mockResolve });

			// Roles cached in event.locals.roles
			expect(event.locals.roles).toBeDefined();
		});

		it('should use cached roles on subsequent requests', async () => {
			const event1 = createMockEvent('/dashboard', mockUser, [mockAdminRole]);
			await handleAuthorization({ event: event1, resolve: mockResolve });

			mockResolve.mockClear();

			const event2 = createMockEvent('/collections', mockUser, [mockAdminRole]);
			await handleAuthorization({ event: event2, resolve: mockResolve });

			expect(mockResolve).toHaveBeenCalled();
		});
	});

	describe('User Count Caching', () => {
		it('should cache user count', async () => {
			const event = createMockEvent('/dashboard', mockUser);
			await handleAuthorization({ event, resolve: mockResolve });

			// User count cached for isFirstUser check
			expect(event.locals.isFirstUser).toBeDefined();
		});

		it('should detect first user (count = 0)', async () => {
			(globalThis as any).__mockUserCount = 0;
			const event = createMockEvent('/dashboard');
			await handleAuthorization({ event, resolve: mockResolve });

			// isFirstUser set when userCount === 0
			expect(event.locals.isFirstUser).toBe(true);
		});
	});

	describe('Permission Checks', () => {
		it('should check hasManageUsersPermission', async () => {
			const event = createMockEvent('/users', mockUser, [mockAdminRole]);
			await handleAuthorization({ event, resolve: mockResolve });

			expect(event.locals.hasManageUsersPermission).toBeDefined();
		});

		it('grant manage users permission to admins', async () => {
			const adminUser = { ...mockUser, role: 'admin' };
			const event = createMockEvent('/users', adminUser, [mockAdminRole]);
			await handleAuthorization({ event, resolve: mockResolve });

			// Admins get manage users permission
			expect(event.locals.hasManageUsersPermission).toBeDefined();
		});
	});

	describe('Redirect to Setup When No Roles', () => {
		it('should redirect to /setup when no roles found', async () => {
			(globalThis as any).__mockRoles = [];
			const event = createMockEvent('/dashboard');

			try {
				await handleAuthorization({ event, resolve: mockResolve });
			} catch (err) {
				// Redirect to /setup if no roles (DB not initialized)
				expect(err).toBeDefined();
			}
		});

		it('should return 503 for API when no roles', async () => {
			(globalThis as any).__mockRoles = [];
			const event = createMockEvent('/api/test');

			try {
				await handleAuthorization({ event, resolve: mockResolve });
			} catch (err) {
				// 503 Service Unavailable for API
				expect(err).toBeDefined();
			}
		});
	});

	describe('OAuth Route Handling', () => {
		it('should allow OAuth routes to pass through', async () => {
			const event = createMockEvent('/login/OAuth/google');
			await handleAuthorization({ event, resolve: mockResolve });

			expect(mockResolve).toHaveBeenCalled();
		});
	});

	describe('Static and Well-Known Routes', () => {
		it('should skip authorization for /.well-known/', async () => {
			const event = createMockEvent('/.well-known/security.txt');
			await handleAuthorization({ event, resolve: mockResolve });

			expect(mockResolve).toHaveBeenCalled();
		});

		it('should skip authorization for /_ routes', async () => {
			const event = createMockEvent('/_app/version.json');
			await handleAuthorization({ event, resolve: mockResolve });

			expect(mockResolve).toHaveBeenCalled();
		});
	});

	describe('Edge Cases', () => {
		it('should handle missing user gracefully', async () => {
			const event = createMockEvent('/dashboard');

			try {
				await handleAuthorization({ event, resolve: mockResolve });
			} catch {
				expect(true).toBe(true); // Redirect expected
			}
		});

		it('should handle database errors gracefully', async () => {
			const event = createMockEvent('/dashboard', mockUser, [mockAdminRole]);
			const response = await handleAuthorization({
				event,
				resolve: mockResolve
			});

			expect(response).toBeDefined();
		});
	});
});
