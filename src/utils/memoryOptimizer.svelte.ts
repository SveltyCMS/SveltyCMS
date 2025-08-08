/**
 * @file src/utils/memoryOptimizer.svelte.ts
 * @description Memory optimization utilities
 *
 * Provides automatic cleanup and memory management helpers
 */

import { SvelteSet } from 'svelte/reactivity';

/**
 * Creates a memory-efficient store with automatic cleanup
 * Uses WeakRef for components that might be garbage collected
 */
export function createMemoryEfficientStore<T>(initialValue: T) {
	let value = $state(initialValue);
	const subscribers = new SvelteSet<(value: T) => void>();
	const weakSubscribers = new SvelteSet<WeakRef<(value: T) => void>>();

	return {
		get value() {
			return value;
		},
		set(newValue: T) {
			value = newValue;
			// Notify strong subscribers
			subscribers.forEach((callback) => callback(value));
			// Notify weak subscribers and clean up dead references
			weakSubscribers.forEach((weakRef) => {
				const callback = weakRef.deref();
				if (callback) {
					callback(value);
				} else {
					weakSubscribers.delete(weakRef);
				}
			});
		},
		subscribe(callback: (value: T) => void, weak = false) {
			if (weak) {
				const weakRef = new WeakRef(callback);
				weakSubscribers.add(weakRef);
				return () => weakSubscribers.delete(weakRef);
			} else {
				subscribers.add(callback);
				return () => subscribers.delete(callback);
			}
		},
		cleanup() {
			subscribers.clear();
			weakSubscribers.clear();
		}
	};
}

// Debounced effect for expensive operations,  Automatically cleans up on component unmount
export function createDebouncedEffect(fn: () => void, dependencies: () => unknown[], delay = 300) {
	let timeoutId: number | null = null;

	$effect(() => {
		// Track dependencies
		dependencies();

		// Clear existing timeout
		if (timeoutId) {
			clearTimeout(timeoutId);
		}

		// Set new timeout
		timeoutId = setTimeout(fn, delay);

		// Cleanup function
		return () => {
			if (timeoutId) {
				clearTimeout(timeoutId);
				timeoutId = null;
			}
		};
	});
}

// Throttled effect for high-frequency updates
export function createThrottledEffect(fn: () => void, dependencies: () => unknown[], delay = 100) {
	let lastRun = 0;
	let timeoutId: number | null = null;

	$effect(() => {
		dependencies();

		const now = Date.now();
		if (now - lastRun >= delay) {
			lastRun = now;
			fn();
		} else if (!timeoutId) {
			timeoutId = setTimeout(
				() => {
					lastRun = Date.now();
					timeoutId = null;
					fn();
				},
				delay - (now - lastRun)
			);
		}

		return () => {
			if (timeoutId) {
				clearTimeout(timeoutId);
				timeoutId = null;
			}
		};
	});
}

// Resource cleanup manager for components
export function createResourceManager() {
	const resources = new SvelteSet<() => void>();

	return {
		add(cleanup: () => void) {
			resources.add(cleanup);
			return () => resources.delete(cleanup);
		},
		cleanup() {
			resources.forEach((cleanup) => {
				try {
					cleanup();
				} catch (error) {
					console.warn('Resource cleanup error:', error);
				}
			});
			resources.clear();
		}
	};
}

// Intersection observer with automatic cleanup
export function createIntersectionObserver(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
	let observer: IntersectionObserver | null = null;

	const start = () => {
		if (typeof window !== 'undefined' && !observer) {
			observer = new IntersectionObserver(callback, options);
		}
		return observer;
	};

	const cleanup = () => {
		if (observer) {
			observer.disconnect();
			observer = null;
		}
	};

	// Auto-cleanup on effect cleanup
	$effect(() => {
		return cleanup;
	});

	return {
		start,
		cleanup,
		get observer() {
			return observer;
		}
	};
}

// Efficient image lazy loading
export function createLazyImage(src: string, placeholder?: string) {
	let loaded = $state(false);
	let error = $state(false);
	let currentSrc = $state(placeholder || '');

	const { start, cleanup } = createIntersectionObserver((entries) => {
		entries.forEach((entry) => {
			if (entry.isIntersecting) {
				const img = new Image();
				img.onload = () => {
					currentSrc = src;
					loaded = true;
					cleanup(); // Stop observing once loaded
				};
				img.onerror = () => {
					error = true;
					cleanup();
				};
				img.src = src;
			}
		});
	});

	return {
		get src() {
			return currentSrc;
		},
		get loaded() {
			return loaded;
		},
		get error() {
			return error;
		},
		observe(element: Element) {
			start()?.observe(element);
		}
	};
}
