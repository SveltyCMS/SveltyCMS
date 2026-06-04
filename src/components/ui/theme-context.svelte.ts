/**
 * @file src/components/ui/theme-context.svelte.ts
 * @description Svelte 5 Context Controller for Adaptive Workspaces and Layout Densities.
 */
import { getContext, setContext } from "svelte";

export interface ThemeFeatures {
  stickyActionBar: boolean;
  collapsibleSidebar: boolean;
  brandedLogin: boolean;
  highContrastMode: boolean;
  reducedMotion: boolean;
  /** Controls which sidebar displays the collections tree and media galleries */
  layoutRegions?: {
    collections: "left" | "right" | "both" | "floating";
    mediaGalleries: "left" | "right" | "both" | "hidden";
  };
}

/** Per-theme layout state persisted to DB (not localStorage) */
export interface LayoutState {
  leftSidebar: "full" | "hidden";
  rightSidebar: "full" | "hidden";
  pageheader: "full" | "hidden";
  pagefooter: "full" | "hidden";
  header: "full" | "hidden";
  footer: "full" | "hidden";
}

export const DEFAULT_LAYOUT_STATE: LayoutState = {
  leftSidebar: "full",
  rightSidebar: "hidden",
  pageheader: "hidden",
  pagefooter: "hidden",
  header: "hidden",
  footer: "hidden",
};

export type LayoutRegionPosition = "left" | "right" | "both" | "floating" | "hidden";

export interface ThemeConfig {
  id: string;
  name: string;
  density: "compact" | "cozy" | "spacious";
  variant: "flat" | "bordered" | "elevated";
  accentMode: "default" | "primary-only" | "custom";
  role: "editor" | "reviewer" | "translator" | "admin" | "manager";
  themeName: string;
  customCss?: string;
  features: ThemeFeatures;
}

export const DEFAULT_THEME_FEATURES: ThemeFeatures = {
  stickyActionBar: false,
  collapsibleSidebar: false,
  brandedLogin: false,
  highContrastMode: false,
  reducedMotion: false,
  layoutRegions: {
    collections: "left",
    mediaGalleries: "left",
  },
};

export const ADMIN_THEME_KEY = Symbol.for("admin-theme");

export class AdminTheme {
  #id = $state<string>("default");
  #name = $state<string>("Default");
  #density = $state<"compact" | "cozy" | "spacious">("cozy");
  #variant = $state<"flat" | "bordered" | "elevated">("bordered");
  #accentMode = $state<"default" | "primary-only" | "custom">("default");
  #role = $state<"editor" | "reviewer" | "translator" | "admin" | "manager">("admin");
  #themeName = $state<string>("default");
  #customCss = $state<string | undefined>(undefined);
  #features = $state<ThemeFeatures>({ ...DEFAULT_THEME_FEATURES });

  constructor(initial?: Partial<ThemeConfig>) {
    if (initial?.id) this.#id = initial.id;
    if (initial?.name) this.#name = initial.name;
    if (initial?.density) this.#density = initial.density;
    if (initial?.variant) this.#variant = initial.variant;
    if (initial?.accentMode) this.#accentMode = initial.accentMode;
    if (initial?.role) this.#role = initial.role;
    if (initial?.themeName) this.#themeName = initial.themeName;
    if (initial?.customCss) this.#customCss = initial.customCss;
    if (initial?.features) this.#features = { ...DEFAULT_THEME_FEATURES, ...initial.features };
  }

  get id() {
    return this.#id;
  }
  set id(value) {
    this.#id = value;
  }

  get name() {
    return this.#name;
  }
  set name(value) {
    this.#name = value;
  }

  get density() {
    return this.#density;
  }
  set density(value) {
    this.#density = value;
  }

  get variant() {
    return this.#variant;
  }
  set variant(value) {
    this.#variant = value;
  }

  get accentMode() {
    return this.#accentMode;
  }
  set accentMode(value) {
    this.#accentMode = value;
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

  get customCss() {
    return this.#customCss;
  }
  set customCss(value) {
    this.#customCss = value;
  }

  get features() {
    return this.#features;
  }
  set features(value) {
    this.#features = { ...DEFAULT_THEME_FEATURES, ...value };
  }

  // Derived: CSS density multiplier (matches --admin-density)
  get densityScale() {
    switch (this.#density) {
      case "compact":
        return 0.85;
      case "spacious":
        return 1.25;
      default:
        return 1.0; // cozy
    }
  }

  // Derived: legacy spacing scale (kept for component compatibility)
  get spacingScale() {
    switch (this.#density) {
      case "compact":
        return 0.8;
      case "spacious":
        return 1.2;
      default:
        return 1.0;
    }
  }

  // Dynamic layout variables (synced with CSS var fallbacks)
  get sidebarWidth() {
    switch (this.#density) {
      case "compact":
        return "200px";
      case "spacious":
        return "300px";
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

  get stickyBarHeight() {
    switch (this.#density) {
      case "compact":
        return "44px";
      case "spacious":
        return "64px";
      default:
        return "56px";
    }
  }

  get radiusBase() {
    switch (this.#density) {
      case "compact":
        return "0.25rem";
      case "spacious":
        return "1rem";
      default:
        return "0.75rem";
    }
  }

  get radiusCard() {
    switch (this.#density) {
      case "compact":
        return "6px";
      case "spacious":
        return "16px";
      default:
        return "0.75rem";
    }
  }

  get radiusInput() {
    switch (this.#density) {
      case "compact":
        return "4px";
      case "spacious":
        return "10px";
      default:
        return "0.375rem";
    }
  }

  get radiusButton() {
    switch (this.#density) {
      case "compact":
        return "0.125rem";
      case "spacious":
        return "0.625rem";
      default:
        return "0.25rem";
    }
  }

  // Shadow synthesis based on variant
  get cardShadow() {
    switch (this.#variant) {
      case "flat":
        return "none";
      case "elevated":
        return "var(--admin-shadow-elevated, 0 10px 15px -3px rgb(0 0 0 / 0.05))";
      default:
        return "var(--admin-shadow-elevation, 0 1px 3px 0 rgb(0 0 0 / 0.1))";
    }
  }

  get cardBorder() {
    return this.#variant === "flat" ? "0" : "var(--admin-border-width, 1px)";
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
