/**
 * @file tests/unit/global-test-setup.d.ts
 * @description
 * Global type augmentation for the SveltyCMS test suite.
 * This file ensures that testing globals (from Bun Test and Vitest) are recognized
 * by TypeScript without requiring explicit imports in every test file.
 *
 * It also provides stubs for Svelte 5 runes and CMS-specific globals used in unit tests.
 *
 * ### Features:
 * - Unified types for `vi` and `mock` utilities.
 * - Global availability of `describe`, `it`, `test`, `expect`.
 * - Type definitions for mocked CMS services.
 * - Svelte 5 rune stubs for test isolation.
 */

declare global {
  var mock: {
    (fn?: (...args: any[]) => any): any;
    module(path: string, factory: () => any): void;
  };
  var spyOn: typeof import("bun:test").spyOn;
  var vi: {
    fn: typeof import("bun:test").Mock;
    spyOn: typeof import("bun:test").spyOn;
    mock: (path: string, factory?: () => any) => void;
    clearAllMocks: () => void;
    resetAllMocks: () => void;
    restoreAllMocks: () => void;
  };
  var describe: typeof import("bun:test").describe;
  var it: typeof import("bun:test").it;
  var test: typeof import("bun:test").test;
  var expect: typeof import("bun:test").expect;
  var beforeEach: typeof import("bun:test").beforeEach;
  var afterEach: typeof import("bun:test").afterEach;
  var beforeAll: typeof import("bun:test").beforeAll;
  var afterAll: typeof import("bun:test").afterAll;

  // Svelte Runes (for tests without compiler)
  var $state: any;
  var $derived: any;
  var $effect: any;
  var $props: any;
  var $bindable: any;
  var $inspect: any;

  // CMS Globals
  var privateEnv: any;
  var browser: boolean;
  var dev: boolean;
  var building: boolean;
  var logger: any;
  var metricsService: any;
  var cacheService: any;
  var auth: any;
  var mockAuditLog: any;
  var mockDbAdapter: any;
  var mockSetupCheck: any;
  var mockEventBus: any;
}

export {};
