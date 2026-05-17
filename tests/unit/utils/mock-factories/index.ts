/**
 * @file tests/unit/utils/mock-factories/index.ts
 * @description Centralized mock factory engine for SveltyCMS test suite.
 */

import type { User } from "@src/databases/auth/types";

/**
 * Creates a mock user object for testing.
 */
export function createMockUser(
  overrides: Partial<Omit<User, "_id" | "tenantId" | "roleIds">> & {
    _id?: string;
    tenantId?: string | null;
    roleIds?: string[];
  } = {},
): User {
  return {
    _id: "mock-user-id",
    email: "test@example.com",
    role: "user",
    status: "active",
    firstName: "Test",
    lastName: "User",
    ...overrides,
  } as unknown as User;
}

/**
 * Creates a mock super admin object for testing.
 */
export function createMockSuperAdmin(
  overrides: Partial<Omit<User, "_id" | "tenantId" | "roleIds">> & {
    _id?: string;
    tenantId?: string | null;
    roleIds?: string[];
  } = {},
): User {
  return createMockUser({
    _id: "mock-admin-id",
    role: "admin",
    email: "admin@sveltycms.test",
    ...overrides,
  } as any);
}

/**
 * Creates a mock tenant object for testing.
 */
export function createMockTenant(overrides: any = {}) {
  return {
    _id: "mock-tenant-id",
    name: "Mock Tenant",
    slug: "mock-tenant",
    status: "active",
    ...overrides,
  };
}

/**
 * Creates a mock DB Adapter stub layout.
 */
export function createDbAdapterStub() {
  const vi = (globalThis as any).vi;
  const mockFn = vi
    ? vi.fn
    : (impl?: any) => {
        const fn = (...args: any[]) => {
          if ((fn as any).implementation) {
            return (fn as any).implementation(...args);
          }
          return impl ? impl(...args) : undefined;
        };
        (fn as any).mockResolvedValue = (val: any) => {
          (fn as any).implementation = () => Promise.resolve(val);
          return fn;
        };
        (fn as any).mockReturnValue = (val: any) => {
          (fn as any).implementation = () => val;
          return fn;
        };
        return fn;
      };

  return {
    crud: {
      findOne: mockFn().mockResolvedValue({ success: true, data: null }),
      findMany: mockFn().mockResolvedValue({ success: true, data: [] }),
      find: mockFn().mockResolvedValue({ success: true, data: [] }),
      insert: mockFn().mockResolvedValue({ success: true, data: {} }),
      insertMany: mockFn().mockResolvedValue({ success: true, data: [] }),
      update: mockFn().mockResolvedValue({ success: true, data: {} }),
      delete: mockFn().mockResolvedValue({ success: true }),
      deleteMany: mockFn().mockResolvedValue({ success: true, deletedCount: 0 }),
      count: mockFn().mockResolvedValue({ success: true, data: 0 }),
      exists: mockFn().mockResolvedValue({ success: true, data: false }),
    },
    auth: {
      getUserById: mockFn().mockResolvedValue({ success: true, data: null }),
      getUserByEmail: mockFn().mockResolvedValue({ success: true, data: null }),
      createUser: mockFn().mockResolvedValue({ success: true, data: {} }),
      updateUser: mockFn().mockResolvedValue({ success: true, data: {} }),
      updateUserAttributes: mockFn().mockResolvedValue({ success: true, data: {} }),
      deleteUser: mockFn().mockResolvedValue({ success: true }),
      getAllUsers: mockFn().mockResolvedValue({ success: true, data: [] }),
      getUserCount: mockFn().mockResolvedValue({ success: true, data: 0 }),
      validateSession: mockFn().mockResolvedValue({ success: true, user: null }),
      createSession: mockFn().mockResolvedValue({ success: true, data: {} }),
      deleteSession: mockFn().mockResolvedValue({ success: true }),
      batchAction: mockFn().mockResolvedValue({ success: true, data: { modifiedCount: 0 } }),
    },
    system: {
      tenants: {
        getById: mockFn().mockResolvedValue({ success: true, data: createMockTenant() }),
        list: mockFn().mockResolvedValue({ success: true, data: [] }),
        create: mockFn().mockResolvedValue({ success: true, data: {} }),
        update: mockFn().mockResolvedValue({ success: true, data: {} }),
        delete: mockFn().mockResolvedValue({ success: true }),
      },
      preferences: {
        get: mockFn().mockResolvedValue({ success: true, data: null }),
        set: mockFn().mockResolvedValue({ success: true }),
        getAll: mockFn().mockResolvedValue({ success: true, data: {} }),
      },
      widgets: {
        getActiveWidgets: mockFn().mockResolvedValue({ success: true, data: [] }),
        activate: mockFn().mockResolvedValue({ success: true }),
        deactivate: mockFn().mockResolvedValue({ success: true }),
        findAll: mockFn().mockResolvedValue({ success: true, data: [] }),
      },
    },
    collection: {
      getModel: mockFn().mockResolvedValue({
        findOne: mockFn().mockResolvedValue(null),
        findMany: mockFn().mockResolvedValue([]),
        aggregate: mockFn().mockResolvedValue([]),
        insert: mockFn().mockResolvedValue({}),
        update: mockFn().mockResolvedValue({}),
        delete: mockFn().mockResolvedValue(true),
      }),
      createModel: mockFn().mockResolvedValue(undefined),
      listSchemas: mockFn().mockResolvedValue({ success: true, data: [] }),
    },
    type: "sqlite",
    isConnected: mockFn().mockReturnValue(true),
    ping: mockFn().mockResolvedValue(true),
    transaction: mockFn().mockImplementation(async (fn: any) => fn({})),
  };
}
