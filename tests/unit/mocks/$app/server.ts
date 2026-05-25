// Runner-agnostic mock helper for SvelteKit $app/server
const mockFn = (fn?: any) => {
  // Use global mock if available (from bun-preload.ts)
  if ((globalThis as any).mock) return (globalThis as any).mock(fn);
  // Fallback to vitest vi if available
  if (typeof (globalThis as any).vi !== "undefined") return (globalThis as any).vi.fn(fn);
  // Simple fallback
  return fn || (() => {});
};

export const command = mockFn((_policy: string, handler: any) => handler);
export const query = mockFn((_policy: string, handler: any) => handler);
export const getRequestEvent = mockFn(() => ({
  locals: {
    cms: {},
    user: { _id: "test-user-id", role: "admin", username: "admin" },
    tenantId: "test-tenant-id",
  },
  cookies: {
    get: mockFn(() => undefined),
    set: mockFn(() => {}),
    delete: mockFn(() => {}),
  },
}));
