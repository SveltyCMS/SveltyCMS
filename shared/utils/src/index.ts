/**
 * @fileoverview Shared utility functions for SveltyCMS
 * 
 * Provides common utilities to prevent code duplication and ensure consistency.
 * All functions are pure, type-safe, and tree-shakeable.
 * 
 * @module @shared/utils
 */

// String utilities
export * from './string';
export * from './date';
export * from './validation';
export * from './formatting';
export * from './security';
export * from './file';
export * from './async';
export * from './object';

/**
 * Slugify a string for URL-safe usage
 * @param str - String to slugify
 * @returns URL-safe slug
 * 
 * @example
 * slugify('Hello World!') // 'hello-world'
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Deep clone an object
 * @param obj - Object to clone
 * @returns Deep cloned object
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Debounce a function
 * @param fn - Function to debounce
 * @param delay - Delay in milliseconds
 * @returns Debounced function
 */
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout>;
  
  return (...args: Parameters<T>) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Sleep for a specified duration
 * @param ms - Duration in milliseconds
 * @returns Promise that resolves after the duration
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
