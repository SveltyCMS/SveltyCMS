/**
 * @file src/stores/system/hardware.svelte.ts
 * @description Reactive hardware-profile store — the single boot-time detection
 * (src/utils/hardware-profile) exposed to UI components and the dashboard.
 *
 * The profile is detected ONCE at process start (hooks.server.ts → initHardwareProfile)
 * and published to the shared global registry. This store reads that shared object
 * and wraps it in a Svelte 5 `$state` container so widgets can render it reactively.
 * Server-only modules must import @utils/hardware-profile directly (no runes) —
 * this store is for the Svelte component layer.
 *
 * Features:
 * - Reactive `hardware` state (tier, cores, threads, pools) for dashboard widgets
 * - `initHardware()` — explicit UI-side boot hook (idempotent, delegates to the
 *   shared detector; safe to call from the browser bundle)
 * - `getHardwareSnapshot()` — plain-object read for non-reactive consumers
 */

import {
  getHardwareProfile,
  describeHardware,
  type HardwareProfile,
} from "@utils/hardware-profile";

// Fallback $state rune for non-Vite execution environments (Bun/Node direct scripts)
if (typeof (globalThis as any).$state === "undefined") {
  (globalThis as any).$state = Object.assign((v: any) => v, {
    raw: (v: any) => v,
    snapshot: (v: any) => v,
    eager: (v: any) => v,
  });
}

class HardwareStore {
  #hardware = $state<HardwareProfile | null>(null);

  /** Reactive profile (null until first init — the UI renders a placeholder). */
  get hardware(): HardwareProfile | null {
    return this.#hardware;
  }

  /** Human-readable one-liner (e.g. for the dashboard hardware widget tooltip). */
  get summary(): string {
    return this.#hardware ? describeHardware(this.#hardware) : "Detecting hardware…";
  }

  /** Populates the reactive state from the shared detection. */
  set(profile: HardwareProfile): void {
    this.#hardware = profile;
  }
}

const hardwareStore = new HardwareStore();

/** Boot hook — populates the reactive store from the shared detection. Idempotent. */
export function initHardware(): HardwareProfile {
  const hw = getHardwareProfile();
  hardwareStore.set(hw);
  return hw;
}

export function getHardware(): HardwareProfile {
  return getHardwareProfile();
}

export function getHardwareSnapshot(): HardwareProfile {
  return { ...getHardwareProfile() };
}

export const hardware = {
  get current(): HardwareProfile | null {
    return hardwareStore.hardware;
  },
  get summary(): string {
    return hardwareStore.summary;
  },
};
