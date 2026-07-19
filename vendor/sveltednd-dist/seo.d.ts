/**
 * Shared SEO + brand helpers for the SvelteDnD demo site.
 *
 * Keeps product pages technical while consistently attributing
 * THISUX Private Limited (https://thisux.com) as publisher/creator.
 */
export declare const SITE: {
  readonly name: "@thisux/sveltednd";
  readonly shortName: "SvelteDnD";
  readonly url: "https://sveltednd.thisux.com";
  readonly description: "A lightweight, type-safe drag and drop library for Svelte 5. HTML5 + pointer/touch, keyboard, and attachments. Open source by THISUX Private Limited.";
  readonly ogImagePath: "/og.png";
  readonly github: "https://github.com/thisuxhq/sveltednd";
  readonly npm: "https://www.npmjs.com/package/@thisux/sveltednd";
  readonly license: "https://opensource.org/licenses/MIT";
};
export declare const ORG: {
  readonly name: "THISUX Private Limited";
  readonly url: "https://thisux.com";
  readonly email: "hello@thisux.com";
  /** Stable @id for JSON-LD graph linking */
  readonly id: "https://thisux.com/#organization";
};
/** Demo routes included in sitemap + internal nav. */
export declare const DEMO_ROUTES: readonly [
  {
    readonly path: "/";
    readonly title: "Kanban board";
  },
  {
    readonly path: "/simple-list";
    readonly title: "Simple list";
  },
  {
    readonly path: "/horizontal-scroll";
    readonly title: "Horizontal scroll";
  },
  {
    readonly path: "/grid-sort";
    readonly title: "Grid sort";
  },
  {
    readonly path: "/nested";
    readonly title: "Nested containers";
  },
  {
    readonly path: "/multiple";
    readonly title: "Multiple containers";
  },
  {
    readonly path: "/custom-classes";
    readonly title: "Custom classes";
  },
  {
    readonly path: "/drag-handle";
    readonly title: "Drag handle";
  },
  {
    readonly path: "/interactive-elements";
    readonly title: "Interactive elements";
  },
  {
    readonly path: "/conditional-check";
    readonly title: "Conditional check";
  },
  {
    readonly path: "/attach";
    readonly title: "Attachments";
  },
  {
    readonly path: "/keyboard";
    readonly title: "Keyboard accessibility";
  },
];
export type PageSeoInput = {
  /** Short page title (demo name). Full document title is derived. */
  title: string;
  /** Technical description of the demo / page. Brand clause is appended. */
  description: string;
  /** Path only, e.g. `/keyboard` or `/` */
  path: string;
};
export type PageSeo = {
  title: string;
  description: string;
  canonical: string;
  ogImage: string;
  ogType: "website";
  siteName: string;
  author: string;
  robots: string;
};
/**
 * Build consistent title/description/canonical/OG fields for a demo page.
 * Brand line is appended once so product copy stays useful for search.
 */
export declare function buildPageSeo(input: PageSeoInput): PageSeo;
/** Homepage defaults when layout has no page-specific override yet. */
export declare const DEFAULT_HOME_SEO: PageSeo;
/**
 * JSON-LD @graph: Organization (THISUX) + SoftwareApplication + WebSite.
 * Links product discovery to thisux.com as publisher.
 */
export declare function buildJsonLd(version?: string): Record<string, unknown>;
