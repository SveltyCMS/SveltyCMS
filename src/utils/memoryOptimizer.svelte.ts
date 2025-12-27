/**
 * @file src/utils/memoryOptimizer.svelte.ts
 * @description Memory-efficient utilities with automatic cleanup
 *
 * Features:
 * - WeakRef-aware store (auto cleanup of dead subscribers)
 * - Debounced/throttled effects
 * - Resource manager for cleanup functions
 * - IntersectionObserver wrapper
 * - Lazy image loader
 */

import { logger } from '@utils/logger';

/**
 * Memory-efficient store with WeakRef support for component subscribers
 */
export function createMemoryEfficientStore<T>(initial: T) {
	let value = $state(initial);
	const strong = new Set<(v: T) => void>();
	const weak = new Set<WeakRef<(v: T) => void>>();

	const notify = () => {
		strong.forEach((cb) => cb(value));

		// Clean & notify weak refs
		for (const ref of weak) {
			const cb = ref.deref();
			if (cb) cb(value);
			else weak.delete(ref);
		}
	};

	return {
		get value() {
			return value;
		},
		set value(v: T) {
			value = v;
			notify();
		},
		set(v: T) {
			value = v;
			notify();
		},
		subscribe(cb: (v: T) => void, weakRef = false) {
			if (weakRef) {
				const ref = new WeakRef(cb);
				weak.add(ref);
				return () => weak.delete(ref);
			}
			strong.add(cb);
			return () => strong.delete(cb);
		},
		clear() {
			strong.clear();
			weak.clear();
		}
	};
}

/**
 * Debounced effect
 */
export function debouncedEffect(fn: () => void, deps: () => unknown[], delay = 300) {
	let id: number | null = null;

	$effect(() => {
		deps();

		if (id) clearTimeout(id);
		id = setTimeout(fn, delay) as unknown as number;

		return () => {
			if (id) clearTimeout(id);
		};
	});
}

/**
 * Throttled effect
 */
export function throttledEffect(fn: () => void, deps: () => unknown[], delay = 100) {
	let last = 0;
	let id: number | null = null;

	$effect(() => {
		deps();

		const now = Date.now();
		const remaining = delay - (now - last);

		if (remaining <= 0) {
			last = now;
			fn();
		} else if (!id) {
			id = setTimeout(() => {
				last = Date.now();
				id = null;
				fn();
			}, remaining) as unknown as number;
		}

		return () => {
			if (id) clearTimeout(id);
		};
	});
}

/**
 * Resource cleanup manager
 */
export function resourceManager() {
	const cleanups = new Set<() => void>();

	return {
		add(cleanup: () => void) {
			cleanups.add(cleanup);
			return () => cleanups.delete(cleanup);
		},
		clear() {
			cleanups.forEach((fn) => {
				try {
					fn();
				} catch (e) {
					logger.warn('Cleanup error:', e);
				}
			});
			cleanups.clear();
		}
	};
}

/**
 * IntersectionObserver wrapper with auto cleanup
 */
export function intersectionObserver(cb: IntersectionObserverCallback, opts?: IntersectionObserverInit) {
	let obs: IntersectionObserver | null = null;

	const start = () => {
		if (typeof window === 'undefined') return null;
		obs ??= new IntersectionObserver(cb, opts);
		return obs;
	};

	const stop = () => {
		obs?.disconnect();
		obs = null;
	};

	// Auto cleanup on unmount
	$effect(() => stop);

	return {
		start,
		stop,
		get active() {
			return !!obs;
		}
	};
}

/**
 * Lazy image loader
 */
export function lazyImage(src: string, placeholder = '') {
	let current = $state(placeholder);
	let loaded = $state(false);
	let failed = $state(false);

	const { start, stop } = intersectionObserver((entries) => {
		entries.forEach((entry) => {
			if (entry.isIntersecting) {
				const img = new Image();
				img.onload = () => {
					current = src;
					loaded = true;
					stop();
				};
				img.onerror = () => {
					failed = true;
					stop();
				};
				img.src = src;
				stop(); // Stop after load attempt
			}
		});
	});

	return {
		get src() {
			return current;
		},
		get loaded() {
			return loaded;
		},
		get error() {
			return failed;
		},
		observe(el: Element) {
			start()?.observe(el);
		}
	};
}
