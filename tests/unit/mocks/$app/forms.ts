import { vi } from "vitest";
export const applyAction = vi.fn(() => Promise.resolve());
export const enhance = vi.fn();
export const deserialize = vi.fn((v) => {
  try {
    return JSON.parse(v);
  } catch {
    return v;
  }
});
