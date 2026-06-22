/**
 * @file src/live/ws-platform.ts
 * @description Shared WebSocket platform reference for global broadcasting.
 *
 * Extracted from hooks.ws.ts to avoid SvelteKit's "unknown export" warning
 * — hooks.ws.ts should only export valid WebSocket lifecycle hooks
 * (init, upgrade, message, etc.), not utility variables.
 *
 * ### Features:
 * - singleton platform reference for svelte-realtime pub/sub
 * - initialized by hooks.ws.ts init() and consumed by live/system.ts
 */

let globalPlatform: App.Platform | null = null;
export function getGlobalPlatform() {
  return globalPlatform;
}

/** Initialize platform for global broadcasting (called by hooks.ws.ts init) */
export function initWsPlatform(platform: App.Platform) {
  globalPlatform = platform;
}
