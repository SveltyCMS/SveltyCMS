// Runner-agnostic mock helper
const mockFn = (fn?: any) => {
  // Use global mock if available (from bun-preload.ts)
  if ((globalThis as any).mock) return (globalThis as any).mock(fn);
  // Fallback to vitest vi if available
  if (typeof (globalThis as any).vi !== "undefined") return (globalThis as any).vi.fn(fn);
  // Simple fallback
  return fn || (() => {});
};

export const applyAction = mockFn(() => Promise.resolve());
export const deserialize = mockFn((v: any) => {
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
});
export const enhance = mockFn();
