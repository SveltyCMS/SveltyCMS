/**
 * @file tests/bun/setup.ts
 * @description Global test setup file for Bun test runner
 * 
 * This file is automatically loaded before running Bun tests via the --preload flag.
 * It mocks SvelteKit's built-in modules ($app/*) to allow testing server-side code
 * without requiring a full SvelteKit runtime environment.
 * 
 * Mocked modules:
 * - $app/environment: Provides environment flags (browser, dev, etc.)
 * - $app/stores: Provides SvelteKit stores (page, navigating, updated)
 * - $app/navigation: Provides navigation functions (goto, invalidate, etc.)
 * - $app/paths: Provides base and assets paths
 * 
 * Usage: Automatically loaded via package.json test scripts with --preload flag
 */
import { mock } from "bun:test";

// Mock $app/environment
mock.module("$app/environment", () => ({
    browser: false,
    building: false,
    dev: true,
    version: "test"
}));

// Mock $app/stores
mock.module("$app/stores", () => ({
    getStores: () => ({}),
    page: { subscribe: (fn: any) => fn({}) },
    navigating: { subscribe: (fn: any) => fn(null) },
    updated: { subscribe: (fn: any) => fn(false) }
}));

// Mock $app/navigation
mock.module("$app/navigation", () => ({
    goto: () => Promise.resolve(),
    invalidate: () => Promise.resolve(),
    invalidateAll: () => Promise.resolve(),
    preloadData: () => Promise.resolve(),
    preloadCode: () => Promise.resolve(),
    beforeNavigate: () => {},
    afterNavigate: () => {}
}));

// Mock $app/paths
mock.module("$app/paths", () => ({
    base: "",
    assets: ""
}));
