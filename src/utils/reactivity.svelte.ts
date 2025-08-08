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

	// Update the store's value using a transformation function
	reactiveStore.update = (fn) => {
		value = fn(value);
	};

	// Directly set a new value
	reactiveStore.set = (newValue: T) => {
		if (value !== newValue) {
			value = newValue;
		}
	};

	// Subscribe to value changes and manage lifecycle
	reactiveStore.subscribe = (subscriber) => {
		return $effect.root(() => {
			track(
				() => subscriber(value), // Execute the subscriber with the current value
				() => value // Track dependencies for reactivity
			);
		});
	};

	// Force reactivity trigger by modifying the value temporarily
	reactiveStore.trigger = () => {
		const current = value;
		value = null as unknown as T;
		value = current;
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
