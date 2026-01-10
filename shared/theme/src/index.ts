/**
 * @fileoverview Shared theme library for SveltyCMS
 * 
 * Provides TailwindCSS and Skeleton UI v4 configuration for all applications.
 * Flexible architecture allows independent updates when Skeleton v5 is released.
 * 
 * @module @shared/theme
 */

export * from './tailwind.config';
export * from './skeleton.config';
export * from './colors';
export * from './typography';

// Re-export theme utilities
export { default as Button } from './components/Button.svelte';
export { default as Card } from './components/Card.svelte';
export { default as Modal } from './components/Modal.svelte';

/**
 * Toggle dark mode
 */
export function toggleDarkMode(): void {
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark');
  }
}

/**
 * Set theme mode
 * @param mode - Theme mode: 'light', 'dark', or 'auto'
 */
export function setThemeMode(mode: 'light' | 'dark' | 'auto'): void {
  if (typeof document === 'undefined') return;
  
  const root = document.documentElement;
  
  if (mode === 'auto') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    root.classList.toggle('dark', prefersDark);
  } else {
    root.classList.toggle('dark', mode === 'dark');
  }
  
  localStorage.setItem('theme', mode);
}
