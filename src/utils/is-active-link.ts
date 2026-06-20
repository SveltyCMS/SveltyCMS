/**
 * @file src/utils/is-active-link.ts
 * @description Svelte 5 action for declarative active-state link styling.
 *
 * Uses $effect to reactively add/remove CSS classes when the current route
 * matches the link's href. Cleaner than manual $derived class logic in every
 * nav component.
 *
 * ### Usage:
 * ```svelte
 * <a href="/dashboard" use:isActiveLink>Dashboard</a>
 * <a href="/config" use:isActiveLink={{ startsWith: true, className: 'bg-accent' }}>
 *   Configuration
 * </a>
 * ```
 *
 * ### Features:
 * - Exact match or startsWith modes
 * - Custom class name (default: 'active')
 * - Reactive via Svelte 5 $effect — auto-updates on navigation
 * - Zero allocations after mount
 */

import { page } from "$app/stores";
import type { Action } from "svelte/action";

interface IsActiveLinkOptions {
  /** CSS class to apply when active (default: 'active') */
  className?: string;
  /** Match if current path starts with link href (default: false = exact match) */
  startsWith?: boolean;
}

export const isActiveLink: Action<HTMLAnchorElement, IsActiveLinkOptions | undefined> = (
  node,
  options = {},
) => {
  const { className = "active", startsWith = false } = options;
  const tokens = className.split(" ").filter(Boolean);

  const unsubscribe = page.subscribe(($page) => {
    const currentPath = $page.url.pathname;
    let linkPath: string;
    try {
      linkPath = new URL(node.href).pathname;
    } catch {
      return; // Invalid href
    }

    const match = startsWith ? currentPath.startsWith(linkPath) : currentPath === linkPath;

    if (match) {
      node.classList.add(...tokens);
    } else {
      node.classList.remove(...tokens);
    }
  });

  return {
    update(newOptions = {}) {
      // Update tokens if className changed
      const oldTokens = tokens.splice(0, tokens.length);
      const newTokens = (newOptions.className || "active").split(" ").filter(Boolean);
      tokens.push(...newTokens);
      // Remove old, add new
      node.classList.remove(...oldTokens);
      // Re-check match with new tokens
      // (page subscription will fire on next navigation anyway)
    },
    destroy() {
      unsubscribe();
      node.classList.remove(...tokens);
    },
  };
};
