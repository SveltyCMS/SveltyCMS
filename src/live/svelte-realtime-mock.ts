/**
 * @file src/live/svelte-realtime-mock.ts
 * @description
 * Mock implementation of svelte-realtime/server for stable adapter-node builds.
 *
 * ### Features:
 * - Mock stream and RPC handlers for Svelte-Realtime backward compatibility
 */

import { writable } from "svelte/store";

export function live(handler: any) {
  const wrapper = async function (...args: any[]) {
    if (typeof handler === "function") {
      // Mock basic context
      const ctx = {
        user: {
          profile: { _id: "system", username: "System", role: "admin", isAdmin: true },
          tenantId: "default",
        },
        publish: () => {},
      };
      return handler(ctx, ...args);
    }
    return { success: false, error: "Mock handler execution failed" };
  };
  return wrapper;
}

live.stream = function (_topicFn: any, _dataFn: any, _options: any) {
  const store = writable([]);
  return store;
};

export const createMessage = () => {
  return function () {};
};

export const message = createMessage();
