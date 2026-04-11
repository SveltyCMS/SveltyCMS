import { vi } from "vitest";
export const goto = vi.fn(() => Promise.resolve());
export const invalidate = vi.fn(() => Promise.resolve());
export const invalidateAll = vi.fn(() => Promise.resolve());
export const afterNavigate = vi.fn();
export const beforeNavigate = vi.fn();
export const applyAction = vi.fn(() => Promise.resolve());
export const deserialize = vi.fn((v) => {
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
});
