// Setup file for Bun tests with Svelte 5
import { mock } from 'bun:test';

// Mock SvelteKit environment
mock.module('$app/environment', () => ({
    browser: true,
    dev: true,
    building: false,
    version: 'test'
}));

// Mock SvelteKit stores
mock.module('$app/stores', () => ({
    page: {
        subscribe: () => () => { }
    },
    navigating: {
        subscribe: () => () => { }
    },
    updated: {
        subscribe: () => () => { },
        check: () => Promise.resolve(false)
    }
}));

// Setup Svelte 5 runtime
globalThis.$state = (initialValue) => {
    let value = initialValue;
    return {
        get current() {
            return value;
        },
        set current(newValue) {
            value = newValue;
        }
    };
};

// Setup Svelte 5 runes
globalThis.$state = (initialValue) => {
    let value = initialValue;
    return {
        get current() {
            return value;
        },
        set current(newValue) {
            value = newValue;
        }
    };
};

globalThis.$derived = (fn) => {
    return {
        get value() {
            return fn();
        }
    };
};

globalThis.$derived.by = (fn) => {
    return {
        get value() {
            return fn();
        }
    };
};