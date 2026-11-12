/**
 * @file src/services/setup/preset-meta.ts
 * @description Lightweight UI presentation metadata and collection summaries for setup presets.
 * Decoupled from heavy field template AST schemas to prevent bundling ~50 KB of server blueprints
 * into client-side setup and collection builder views.
 *
 * Features:
 * - Pure UI preset metadata (id, title, icon, badges, complexity)
 * - Lightweight collection summaries (name, label, icon, description)
 * - Minimal ~3 KB footprint for client bundle optimization
 */

export interface CollectionPresetMeta {
  /** Machine-readable collection name (camelCase) */
  name: string;
  /** Human-readable label */
  label: string;
  /** Iconify icon identifier */
  icon: string;
  /** Short description */
  description?: string;
}

export interface PresetMeta {
  id: string;
  title: string;
  description: string;
  icon: string;
  features: string[];
  complexity?: "simple" | "moderate" | "advanced";
  recommended?: boolean;
  collections?: CollectionPresetMeta[];
}

export const PRESET_METADATA: PresetMeta[] = [
  {
    id: "blank",
    title: "Blank Project",
    description: "Start from scratch with a clean slate.",
    icon: "mdi:file-outline",
    features: ["Core System", "No Collections", "Basic Settings"],
    complexity: "simple",
    collections: [],
  },
  {
    id: "website",
    title: "Website Starter",
    description:
      "Recommended: SvelteKit frontend in the same repo with Svedit inline page design. Includes a seeded homepage and a Pages collection. Live Preview ships with the Editable Website plugin and requires an active licence or the 14-day trial; the rest of the starter works without one. Still headless-ready — swap the frontend for Astro/React later.",
    icon: "mdi:web",
    recommended: true,
    features: [
      "SvelteKit Site Starter",
      "Svedit Block Editing",
      "Seeded Homepage",
      "Live Preview (licence or trial)",
      "Pages Collection",
      "Legal and privacy pages",
    ],
    complexity: "simple",
    collections: [
      {
        name: "pages",
        label: "Pages",
        icon: "mdi:file-document-outline",
        description:
          "Frontend pages for the in-repo SvelteKit site starter with Svedit block editing",
      },
    ],
  },
  {
    id: "blog",
    title: "Blog / Editorial",
    description:
      "Classic blog setup with posts, categories, and authors. Perfect for content creators.",
    icon: "mdi:post-outline",
    features: ["Posts", "Nested categories", "Authors", "Tags"],
    complexity: "simple",
    collections: [
      {
        name: "posts",
        label: "Posts",
        icon: "mdi:post-outline",
        description: "Blog posts with SEO support and rich text editing",
      },
      {
        name: "categories",
        label: "Categories",
        icon: "mdi:folder-outline",
        description: "Blog categories with hierarchical nesting",
      },
      {
        name: "authors",
        label: "Authors",
        icon: "mdi:account-edit-outline",
        description: "Article authors with bios and social links",
      },
    ],
  },
  {
    id: "agency",
    title: "Agency / Portfolio",
    description: "Showcase work, services, and client testimonials. Optimized for agencies.",
    icon: "mdi:briefcase-outline",
    features: ["Projects", "Services", "Team"],
    complexity: "moderate",
    collections: [
      {
        name: "projects",
        label: "Projects",
        icon: "mdi:briefcase-check",
        description: "Portfolio projects showcasing your work",
      },
      {
        name: "services",
        label: "Services",
        icon: "mdi:cogs",
        description: "Services offered with pricing and details",
      },
      {
        name: "team",
        label: "Team",
        icon: "mdi:account-group",
        description: "Team members and their profiles",
      },
    ],
  },
  {
    id: "saas",
    title: "SaaS Product",
    description: "Documentation, features, and pricing management for modern SaaS applications.",
    icon: "mdi:cloud-outline",
    features: ["Features", "Pricing plans", "Documentation"],
    complexity: "moderate",
    collections: [
      {
        name: "features",
        label: "Features",
        icon: "mdi:star-outline",
        description: "Product features with descriptions and screenshots",
      },
      {
        name: "pricing",
        label: "Pricing",
        icon: "mdi:cash-multiple",
        description: "Pricing plans with features and highlighting",
      },
      {
        name: "documentation",
        label: "Documentation",
        icon: "mdi:book-open-page-variant-outline",
        description: "Product documentation articles organized by category",
      },
    ],
  },
  {
    id: "corporate",
    title: "Corporate Site",
    description:
      "Professional presence with team, careers, and press. Built for large organizations.",
    icon: "mdi:domain",
    features: ["Team", "Careers", "Press"],
    complexity: "moderate",
    collections: [
      {
        name: "team",
        label: "Team",
        icon: "mdi:account-tie",
        description: "Team members across departments",
      },
      {
        name: "careers",
        label: "Careers",
        icon: "mdi:briefcase-search",
        description: "Job listings with requirements",
      },
      {
        name: "press",
        label: "Press",
        icon: "mdi:newspaper-variant-outline",
        description: "Press releases and media coverage",
      },
    ],
  },
  {
    id: "ecommerce",
    title: "E-commerce",
    description:
      "Catalog, carts, and orders for the Commerce plugin. Card payments stay in the Stripe plugin.",
    icon: "mdi:shopping-outline",
    features: [
      "Products & Variants",
      "Orders",
      "Coupons & Discounts",
      "Product Reviews",
      "Tax & Shipping Tables",
      "Inventory & Stock Alerts",
    ],
    complexity: "advanced",
    collections: [
      {
        name: "products",
        label: "Products",
        icon: "mdi:package-variant-closed",
        description: "Products with pricing, inventory, variants, and images",
      },
      {
        name: "coupons",
        label: "Coupons",
        icon: "mdi:ticket-percent-outline",
        description: "Discount coupons and promotional codes",
      },
      {
        name: "carts",
        label: "Carts",
        icon: "mdi:cart-outline",
        description: "Active shopping carts (guest and logged-in)",
      },
      {
        name: "orders",
        label: "Orders",
        icon: "mdi:receipt",
        description: "Customer orders with line items, shipping, and status tracking",
      },
    ],
  },
];
