/**
 * @file reactivity.svelte.ts
 * @description Provides advanced reactivity utilities for Svelte 5 runes
 *
 * This module offers:
 * - A custom store implementation with enhanced reactivity
 * - Untracked effect tracking
 * - Flexible state management with subscribe and update methods
 *
 * Key Features:
 * - Reactive state creation with `store()`
 * - Untracked effect handling with `track()`
 * - Supports dynamic state updates and subscriptions
 */

import { untrack } from 'svelte';

// Store interface with enhanced reactivity methods
interface Store<T> {
	(): T; // Callable to get current value
	value: T; // Direct value access
	update: (f: (value: T) => T) => void; // Update value with a function
	subscribe: (f: (value: T) => void) => () => void; // Subscribe to value changes
	set: (value: T) => void; // Set value directly
	trigger: () => void; // Force reactivity trigger
}

// Create a reactive store with advanced capabilities
export function store<T>(v?: T) {
	let value = $state(v) as T; // Create reactive state
	const f = (() => value) as Store<T>; // Callable function wrapper

	// Update value using a transformation function
	f.update = (f) => {
		value = f(value);
	};

	// Set value directly
	f.set = (v: T) => {
		value = v;
	};

	// Subscribe to value changes with effect root
	f.subscribe = (f) => {
		return $effect.root(() => {
			track(
				() => f(value), // Call subscriber with current value
				() => value // Track dependencies
			);
		});
	};

	// Force a reactivity trigger by nulling and restoring value
	f.trigger = () => {
		const _value = value;
		value = null as any;
		value = _value;
	};

	// Define getter and setter for value property
	Object.defineProperty(f, 'value', {
		get: () => value,
		set: (v) => (value = v)
	});

	return f;
}

// Track an effect with untracked execution
export function track(f: () => unknown, deps: () => any) {
	$effect(() => {
		untrack(f); // Execute function without tracking
		deps(); // Track dependencies
	});
}
