/**
 * @file src/utils/reactivity.svelte.ts
 * @description Advanced reactivity utilities
 *
 * Provides:
 * - A custom reactive store implementation
 * - Untracked effect handling
 * - Flexible state management with subscription, update, and trigger methods
 */

import { untrack } from 'svelte';
import { SvelteSet } from 'svelte/reactivity';

// Enhanced reactive store interface
interface Store<T> {
	(): T; // Callable to get the current value
	readonly value: T; // Direct read access to the current value
	update: (fn: (value: T) => T) => void; // Update the value with a transformation function
	set: (value: T) => void; // Set a new value directly
	subscribe: (fn: (value: T) => void) => () => void; // Subscribe to value changes, returns an unsubscribe function
	trigger: () => void; // Force reactivity trigger
}

// Create a reactive store with advanced features
export function store<T>(initialValue?: T): Store<T> {
	let value = $state(initialValue) as T; // Reactive state for the value
	const reactiveStore = (() => value) as Store<T>; // Callable store instance

	// Maintain a subscriber set to fully mimic Svelte store behavior
	const subscribers = new SvelteSet<(v: T) => void>();
	const notify = () => {
		for (const run of subscribers) {
			try {
				run(value);
			} catch {
				// Swallow subscriber errors to avoid breaking notification loop
			}
		}
	};

	// Update the store's value using a transformation function
	reactiveStore.update = (fn) => {
		value = fn(value);
		notify();
	};

	// Directly set a new value
	reactiveStore.set = (newValue: T) => {
		if (value !== newValue) {
			value = newValue;
			notify();
		}
	};

	// Subscribe to value changes and manage lifecycle
	reactiveStore.subscribe = (subscriber) => {
		subscribers.add(subscriber);
		// Call immediately with current value (Svelte convention)
		try {
			subscriber(value);
		} catch {
			// ignore first-call subscriber errors
		}
		return () => {
			subscribers.delete(subscriber);
		};
	};

	// Force reactivity trigger by modifying the value temporarily
	reactiveStore.trigger = () => {
		const current = value;
		value = null as unknown as T;
		value = current;
		notify();
	};

	// Define getter and setter for `value` property
	Object.defineProperty(reactiveStore, 'value', {
		get: () => value,
		set: (newValue) => reactiveStore.set(newValue),
		configurable: true,
		enumerable: true
	});

	return reactiveStore;
}

// Execute a function with untracked execution and track dependencies
export function track(effectFn: () => unknown, dependencies: () => unknown) {
	$effect(() => {
		untrack(effectFn); // Execute the effect without tracking
		dependencies(); // Track reactivity dependencies
	});
}
