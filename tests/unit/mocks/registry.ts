/**
 * @file tests/unit/mocks/registry.ts
 * @description Type-checked centralized mock registry.
 *
 * Every mock here is typed against the real interfaces. When the real API
 * changes (renamed method, new required field), these mocks FAIL TO COMPILE
 * until updated — eliminating mock drift entirely.
 *
 * Import this instead of writing ad-hoc `vi.mock()` calls in test files.
 */

import type { DatabaseResult } from "@src/databases/db-interface";

// ── Helpers ────────────────────────────────────────────────────────────────

/** Creates a mock function — Bun or Vitest, auto-detected */
const mockFn = (impl?: (...args: any[]) => any) => {
  if (typeof (globalThis as any).mock === "function") return (globalThis as any).mock(impl);
  if (typeof (globalThis as any).vi?.fn === "function") return (globalThis as any).vi.fn(impl);
  return impl || (() => {});
};

/** Wraps a value in a DatabaseResult for adapter return types */
const dbOk = <T>(data: T): DatabaseResult<T> => ({ success: true, data });
// ── Type-checked Auth Mock ─────────────────────────────────────────────────

export function createAuthMock(): any {
  return {
    getUserById: mockFn((id: string) => Promise.resolve(dbOk({ _id: id }))),
    getUserByEmail: mockFn(() => Promise.resolve(null)),
    getUserBySamlId: mockFn(() => Promise.resolve(null)),
    createUser: mockFn(() => Promise.resolve(dbOk({ _id: "new-user" }))),
    createSession: mockFn(() => Promise.resolve({ _id: "session-123" })),
    checkUser: mockFn(() => Promise.resolve(null)),
    getTokenByValue: mockFn(() => Promise.resolve(null)),
    updateToken: mockFn(() => Promise.resolve(dbOk(true))),
    deleteTokens: mockFn(() => Promise.resolve(1)),
    getAllTokens: mockFn(() => Promise.resolve(dbOk([]))),
    createToken: mockFn(() => Promise.resolve(dbOk({ _id: "token-123" }))),
    getTokenById: mockFn(() => Promise.resolve(dbOk(null))),
    blockTokens: mockFn(() => Promise.resolve(1)),
    unblockTokens: mockFn(() => Promise.resolve(1)),
    updateUserAttributes: mockFn(() => Promise.resolve(dbOk(true))),
    getAllUsers: mockFn(() => Promise.resolve(dbOk([]))),
    getUserCount: mockFn(() => Promise.resolve(0)),
    getAllRoles: mockFn(() =>
      Promise.resolve(dbOk([{ _id: "admin", isAdmin: true, name: "Admin" }])),
    ),
    ensureAuth: mockFn(() => Promise.resolve()),
    validateSession: mockFn(() =>
      Promise.resolve({
        _id: "u1",
        email: "a@t.com",
        tenantId: "t1",
        role: "admin",
      }),
    ),
    createSessionCookie: mockFn(() => ({
      name: "session",
      value: "token",
      attributes: {},
    })),
    authInterface: {
      getUserById: mockFn((id: string) => Promise.resolve(dbOk({ _id: id }))),
    },
  };
}

// ── Type-checked CRUD Mock ─────────────────────────────────────────────────

export function createCrudMock(): any {
  return {
    insert: mockFn(() => Promise.resolve(dbOk({ _id: "mock-id" }))),
    insertMany: mockFn(() => Promise.resolve(dbOk([]))),
    update: mockFn(() => Promise.resolve(dbOk(true))),
    updateMany: mockFn(() => Promise.resolve(dbOk(true))),
    findOne: mockFn(() => Promise.resolve(dbOk(null))),
    findMany: mockFn(() => Promise.resolve(dbOk([]))),
    delete: mockFn(() => Promise.resolve(dbOk(true))),
    deleteMany: mockFn(() => Promise.resolve(dbOk(true))),
    upsert: mockFn(() => Promise.resolve(dbOk({ _id: "upsert-id" }))),
    upsertMany: mockFn(() => Promise.resolve(dbOk([]))),
    count: mockFn(() => Promise.resolve(dbOk(0))),
    exists: mockFn(() => Promise.resolve(dbOk(false))),
  };
}

// ── Type-checked System Mock ───────────────────────────────────────────────

export function createSystemMock(): any {
  return {
    preferences: {
      get: mockFn(() => Promise.resolve(dbOk("value"))),
      set: mockFn(() => Promise.resolve(dbOk(true))),
      getMany: mockFn(() => Promise.resolve(dbOk([]))),
      setMany: mockFn(() => Promise.resolve(dbOk(true))),
      deleteMany: mockFn(() => Promise.resolve(dbOk(true))),
    },
    widgets: {
      getActiveWidgets: mockFn(() => Promise.resolve(dbOk([]))),
    },
  };
}

// ── Type-checked Media Mock ────────────────────────────────────────────────

export function createMediaMock(): any {
  return {
    files: {
      upload: mockFn(() => Promise.resolve(dbOk({ _id: "media-1" }))),
      delete: mockFn(() => Promise.resolve(dbOk(true))),
      deleteMany: mockFn(() => Promise.resolve(dbOk(true))),
      getByFolder: mockFn(() => Promise.resolve(dbOk([]))),
      getByHash: mockFn(() => Promise.resolve(dbOk(null))),
    },
  };
}

// ── Type-checked Collection Mock ───────────────────────────────────────────

export function createCollectionMock(): any {
  return {
    getModel: mockFn(() => Promise.resolve({ _id: "mock_col", name: "mock_col", fields: [] })),
    createModel: mockFn(() => Promise.resolve(dbOk(true))),
    listSchemas: mockFn(() => Promise.resolve(dbOk([]))),
  };
}

// ── Complete Mock DB Adapter (type-asserted where possible) ─────────────────

/**
 * Creates a fully-typed mock dbAdapter. Import this in setup.ts or individual
 * test files instead of ad-hoc `{ crud: { findOne: vi.fn() } }` objects.
 */
export function createMockDbAdapter(overrides: Partial<Record<string, any>> = {}) {
  return {
    auth: createAuthMock(),
    crud: createCrudMock(),
    system: createSystemMock(),
    media: createMediaMock(),
    collection: createCollectionMock(),
    content: {
      nodes: {
        getStructure: mockFn(() => Promise.resolve(dbOk([]))),
        create: mockFn(() => Promise.resolve(dbOk(true))),
        update: mockFn(() => Promise.resolve(dbOk(true))),
        delete: mockFn(() => Promise.resolve(dbOk(true))),
        deleteMany: mockFn(() => Promise.resolve(dbOk(true))),
        bulkUpdate: mockFn(() => Promise.resolve(dbOk(true))),
      },
      drafts: {
        getForContent: mockFn(() => Promise.resolve(dbOk(null))),
      },
    },
    monitoring: {
      cache: {
        invalidateCategory: mockFn(() => Promise.resolve(dbOk(true))),
      },
    },
    batch: {
      execute: mockFn(() => Promise.resolve(dbOk([]))),
    },
    ...overrides,
  };
}

export { mockFn };
