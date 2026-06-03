/**
 * @file src/components/ui/theme-context.svelte.ts
 * @description Svelte 5 Context Controller for Adaptive Workspaces and Layout Densities.
 */
import { getContext, setContext } from "svelte";

export interface ThemeConfig {
  density: "compact" | "cozy" | "spacious";
  role: "editor" | "reviewer" | "translator" | "admin" | "manager";
  themeName: string;
}

export const ADMIN_THEME_KEY = Symbol.for("admin-theme");

export class AdminTheme {
  #density = $state<"compact" | "cozy" | "spacious">("cozy");
  #role = $state<"editor" | "reviewer" | "translator" | "admin" | "manager">("admin");
  #themeName = $state<string>("default");

  constructor(initial?: Partial<ThemeConfig>) {
    if (initial?.density) this.#density = initial.density;
    if (initial?.role) this.#role = initial.role;
    if (initial?.themeName) this.#themeName = initial.themeName;
  }

  get density() {
    return this.#density;
  }
  set density(value) {
    this.#density = value;
  }

  get role() {
    return this.#role;
  }
  set role(value) {
    this.#role = value;
  }

  get themeName() {
    return this.#themeName;
  }
  set themeName(value) {
    this.#themeName = value;
  }

  // Derived styling scale
  get spacingScale() {
    switch (this.#density) {
      case "compact":
        return 0.8;
      case "spacious":
        return 1.2;
      default:
        return 1.0; // cozy
    }
  }

  // Dynamic layout variables
  get sidebarWidth() {
    switch (this.#density) {
      case "compact":
        return "200px";
      case "spacious":
        return "280px";
      default:
        return "240px";
    }
  }

  get headerHeight() {
    switch (this.#density) {
      case "compact":
        return "48px";
      case "spacious":
        return "72px";
      default:
        return "64px";
    }
  }

  get radiusCard() {
    switch (this.#density) {
      case "compact":
        return "6px";
      case "spacious":
        return "16px";
      default:
        return "12px";
    }
  }

  get radiusInput() {
    switch (this.#density) {
      case "compact":
        return "4px";
      case "spacious":
        return "10px";
      default:
        return "6px";
    }
  }
}

export function setThemeContext(config?: Partial<ThemeConfig>): AdminTheme {
  const theme = new AdminTheme(config);
  setContext(ADMIN_THEME_KEY, theme);
  return theme;
}

export function getThemeContext(): AdminTheme | undefined {
  return getContext<AdminTheme>(ADMIN_THEME_KEY);
}
