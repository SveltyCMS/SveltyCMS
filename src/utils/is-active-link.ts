/**
 * @file src/utils/is-active-link.ts
 * @description Svelte action for declarative active-state link styling and a11y.
 *
 * ### Hardening (audit 2026-07):
 * - Routing bug fix: / always active → explicitly excluded; /user no longer matches /users/1
 * - Performance: node.pathname (O(1)) replaces new URL() (allocates + parses)
 * - Accessibility: auto-injects aria-current="page" when active (WCAG compliant)
 * - Update lifecycle: re-evaluates immediately on options change, not just on navigation
 *
 * ### Usage:
 * ```svelte
 * <a href="/dashboard" use:isActiveLink>Dashboard</a>
 * <a href="/config" use:isActiveLink={{ startsWith: true, className: 'bg-accent' }}>
 *   Configuration
 * </a>
 * ```
 */

import { page } from "$app/stores";
import type { Action } from "svelte/action";

export interface IsActiveLinkOptions {
  /** CSS class to apply when active (default: 'active') */
  className?: string;
  /** Match if current path is a sub-route of the link href (default: false) */
  startsWith?: boolean;
  /** The aria-current value to apply for accessibility (default: 'page') */
  ariaCurrent?: "page" | "step" | "location" | "date" | "time" | "true" | "false";
}

export const isActiveLink: Action<HTMLAnchorElement, IsActiveLinkOptions | undefined> = (
  node,
  options = {},
) => {
  let { className = "active", startsWith = false, ariaCurrent = "page" } = options;
  let tokens = className.split(" ").filter(Boolean);
  let currentPath = "";

  const evaluate = () => {
    // O(1): use native HTMLAnchorElement.pathname (no URL parsing overhead)
    const linkPath = node.pathname;

    let match = false;

    if (currentPath === linkPath) {
      match = true;
    } else if (startsWith && linkPath !== "/") {
      // 🛡️ Prevent /user from matching /users/1 — require segment separator
      match = currentPath.startsWith(linkPath + "/");
    }

    if (match) {
      if (tokens.length) node.classList.add(...tokens);
      node.setAttribute("aria-current", ariaCurrent);
    } else {
      if (tokens.length) node.classList.remove(...tokens);
      node.removeAttribute("aria-current");
    }
  };

  const unsubscribe = page.subscribe(($page) => {
    currentPath = $page.url.pathname;
    evaluate();
  });

  return {
    update(newOptions = {}) {
      // Clean up old classes before applying new config
      if (tokens.length) node.classList.remove(...tokens);

      className = newOptions.className ?? "active";
      startsWith = newOptions.startsWith ?? false;
      ariaCurrent = newOptions.ariaCurrent ?? "page";
      tokens = className.split(" ").filter(Boolean);

      // Re-evaluate immediately (fixes bug where UI didn't update until next navigation)
      evaluate();
    },
    destroy() {
      unsubscribe();
      if (tokens.length) node.classList.remove(...tokens);
      node.removeAttribute("aria-current");
    },
  };
};
