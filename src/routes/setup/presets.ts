/**
 * @file src/routes/setup/presets.ts
 * @description Defines available setup presets and starter kits for SveltyCMS.
 * Each preset now includes optional collection schemas for Quick-Start templates
 * in the Collection Builder.
 * @author SveltyCMS
 */

/**
 * A single field in a template collection.
 * Maps directly to the FieldConfig used by createWidget() in the widget factory.
 */
export interface FieldTemplate {
  /** Database field name (camelCase) */
  db_fieldName: string;
  /** Human-readable label */
  label: string;
  /** Widget type matching existing core widgets */
  type:
    | "input"
    | "richtext"
    | "image"
    | "reference"
    | "slug"
    | "number"
    | "select"
    | "repeater"
    | "seo"
    | "textarea";
  /** Which widget variant to use */
  widget: string;
  /** Whether the field is required */
  required: boolean;
  /** Whether the field supports translations */
  translated: boolean;
  /** Help text shown in the CMS UI */
  helper: string;
  /** Default value */
  default?: string | number | boolean;
  /** Options for select/reference widgets */
  options?: string[];
}

/**
 * Represents a complete collection template within a preset.
 */
export interface CollectionPreset {
  /** Machine-readable collection name (camelCase) */
  name: string;
  /** Human-readable label */
  label: string;
  /** Iconify icon identifier */
  icon: string;
  /** Short description */
  description: string;
  /** Field definitions */
  fields: FieldTemplate[];
}

export interface Preset {
  complexity?: "simple" | "moderate" | "advanced";
  description: string;
  features: string[];
  icon: string;
  id: string;
  title: string;
  /** Optional collection schemas for Quick-Start templates */
  collections?: CollectionPreset[];
}

// =============================================================================
// Collection Schema Presets
// =============================================================================

/** Blog preset: Posts, Categories, Authors */
const blogCollections: CollectionPreset[] = [
  {
    name: "posts",
    label: "Posts",
    icon: "mdi:post-outline",
    description: "Blog posts with SEO support and rich text editing",
    fields: [
      {
        db_fieldName: "title",
        label: "Title",
        type: "input",
        widget: "text",
        required: true,
        translated: true,
        helper: "Post title",
      },
      {
        db_fieldName: "slug",
        label: "Slug",
        type: "slug",
        widget: "slug",
        required: true,
        translated: false,
        helper: "URL-friendly identifier",
      },
      {
        db_fieldName: "content",
        label: "Content",
        type: "richtext",
        widget: "richtext",
        required: true,
        translated: true,
        helper: "Post body content",
      },
      {
        db_fieldName: "excerpt",
        label: "Excerpt",
        type: "input",
        widget: "text",
        required: false,
        translated: true,
        helper: "Short summary for listings",
      },
      {
        db_fieldName: "featuredImage",
        label: "Featured Image",
        type: "image",
        widget: "media-upload",
        required: false,
        translated: false,
        helper: "Hero image for the post",
      },
      {
        db_fieldName: "author",
        label: "Author",
        type: "reference",
        widget: "relation",
        required: false,
        translated: false,
        helper: "Reference to Authors collection",
      },
      {
        db_fieldName: "categories",
        label: "Categories",
        type: "reference",
        widget: "relation",
        required: false,
        translated: false,
        helper: "Post categories (multi-select)",
        default: undefined,
        options: ["multiple"],
      },
      {
        db_fieldName: "tags",
        label: "Tags",
        type: "input",
        widget: "text",
        required: false,
        translated: false,
        helper: "Comma-separated tags",
      },
      {
        db_fieldName: "seo",
        label: "SEO",
        type: "seo",
        widget: "seo",
        required: false,
        translated: true,
        helper: "Search engine optimization metadata",
      },
    ],
  },
  {
    name: "categories",
    label: "Categories",
    icon: "mdi:tag",
    description: "Post categories for organizing content",
    fields: [
      {
        db_fieldName: "name",
        label: "Name",
        type: "input",
        widget: "text",
        required: true,
        translated: true,
        helper: "Category name",
      },
      {
        db_fieldName: "slug",
        label: "Slug",
        type: "slug",
        widget: "slug",
        required: true,
        translated: false,
        helper: "URL-friendly identifier",
      },
      {
        db_fieldName: "description",
        label: "Description",
        type: "input",
        widget: "text",
        required: false,
        translated: true,
        helper: "Category description",
      },
    ],
  },
  {
    name: "authors",
    label: "Authors",
    icon: "mdi:account-edit",
    description: "Content authors with bios and avatars",
    fields: [
      {
        db_fieldName: "name",
        label: "Name",
        type: "input",
        widget: "text",
        required: true,
        translated: false,
        helper: "Author display name",
      },
      {
        db_fieldName: "bio",
        label: "Bio",
        type: "richtext",
        widget: "richtext",
        required: false,
        translated: true,
        helper: "Author biography",
      },
      {
        db_fieldName: "avatar",
        label: "Avatar",
        type: "image",
        widget: "media-upload",
        required: false,
        translated: false,
        helper: "Author profile photo",
      },
      {
        db_fieldName: "email",
        label: "Email",
        type: "input",
        widget: "text",
        required: false,
        translated: false,
        helper: "Public contact email",
      },
    ],
  },
];

/** Agency preset: Projects, Services, Team */
const agencyCollections: CollectionPreset[] = [
  {
    name: "projects",
    label: "Projects",
    icon: "mdi:briefcase-check",
    description: "Portfolio projects showcasing your work",
    fields: [
      {
        db_fieldName: "title",
        label: "Title",
        type: "input",
        widget: "text",
        required: true,
        translated: true,
        helper: "Project title",
      },
      {
        db_fieldName: "slug",
        label: "Slug",
        type: "slug",
        widget: "slug",
        required: true,
        translated: false,
        helper: "URL-friendly identifier",
      },
      {
        db_fieldName: "description",
        label: "Description",
        type: "richtext",
        widget: "richtext",
        required: true,
        translated: true,
        helper: "Project description",
      },
      {
        db_fieldName: "client",
        label: "Client",
        type: "input",
        widget: "text",
        required: false,
        translated: false,
        helper: "Client name",
      },
      {
        db_fieldName: "images",
        label: "Images",
        type: "image",
        widget: "media-upload",
        required: false,
        translated: false,
        helper: "Project screenshots/gallery",
        default: undefined,
      },
      {
        db_fieldName: "testimonial",
        label: "Testimonial",
        type: "richtext",
        widget: "richtext",
        required: false,
        translated: true,
        helper: "Client testimonial quote",
      },
    ],
  },
  {
    name: "services",
    label: "Services",
    icon: "mdi:cog-outline",
    description: "Services offered by your agency",
    fields: [
      {
        db_fieldName: "name",
        label: "Name",
        type: "input",
        widget: "text",
        required: true,
        translated: true,
        helper: "Service name",
      },
      {
        db_fieldName: "icon",
        label: "Icon",
        type: "input",
        widget: "text",
        required: false,
        translated: false,
        helper: "Iconify icon name (e.g., mdi:web)",
      },
      {
        db_fieldName: "description",
        label: "Description",
        type: "richtext",
        widget: "richtext",
        required: true,
        translated: true,
        helper: "Service description",
      },
      {
        db_fieldName: "features",
        label: "Features",
        type: "repeater",
        widget: "repeater",
        required: false,
        translated: true,
        helper: "Key features list",
      },
    ],
  },
  {
    name: "team",
    label: "Team",
    icon: "mdi:account-group",
    description: "Team members and their profiles",
    fields: [
      {
        db_fieldName: "name",
        label: "Name",
        type: "input",
        widget: "text",
        required: true,
        translated: false,
        helper: "Full name",
      },
      {
        db_fieldName: "role",
        label: "Role",
        type: "input",
        widget: "text",
        required: true,
        translated: true,
        helper: "Job title / role",
      },
      {
        db_fieldName: "bio",
        label: "Bio",
        type: "richtext",
        widget: "richtext",
        required: false,
        translated: true,
        helper: "Bio and background",
      },
      {
        db_fieldName: "photo",
        label: "Photo",
        type: "image",
        widget: "media-upload",
        required: false,
        translated: false,
        helper: "Profile photo",
      },
      {
        db_fieldName: "social",
        label: "Social Links",
        type: "input",
        widget: "text",
        required: false,
        translated: false,
        helper: "Social media URLs (JSON)",
      },
    ],
  },
];

/** SaaS preset: Features, Pricing, Documentation */
const saasCollections: CollectionPreset[] = [
  {
    name: "features",
    label: "Features",
    icon: "mdi:star-outline",
    description: "Product features with descriptions and screenshots",
    fields: [
      {
        db_fieldName: "name",
        label: "Name",
        type: "input",
        widget: "text",
        required: true,
        translated: true,
        helper: "Feature name",
      },
      {
        db_fieldName: "icon",
        label: "Icon",
        type: "input",
        widget: "text",
        required: false,
        translated: false,
        helper: "Iconify icon for the feature",
      },
      {
        db_fieldName: "description",
        label: "Description",
        type: "richtext",
        widget: "richtext",
        required: true,
        translated: true,
        helper: "Feature description",
      },
      {
        db_fieldName: "screenshot",
        label: "Screenshot",
        type: "image",
        widget: "media-upload",
        required: false,
        translated: false,
        helper: "Feature screenshot",
      },
    ],
  },
  {
    name: "pricing",
    label: "Pricing",
    icon: "mdi:cash-multiple",
    description: "Pricing plans with features and highlighting",
    fields: [
      {
        db_fieldName: "name",
        label: "Plan Name",
        type: "input",
        widget: "text",
        required: true,
        translated: true,
        helper: "e.g., Starter, Pro, Enterprise",
      },
      {
        db_fieldName: "price",
        label: "Price",
        type: "number",
        widget: "number",
        required: true,
        translated: false,
        helper: "Monthly price (0 for free)",
      },
      {
        db_fieldName: "features",
        label: "Features",
        type: "repeater",
        widget: "repeater",
        required: false,
        translated: true,
        helper: "Included features list",
      },
      {
        db_fieldName: "highlighted",
        label: "Highlighted",
        type: "select",
        widget: "select",
        required: false,
        translated: false,
        helper: "Whether this plan is recommended",
        default: false,
        options: ["true", "false"],
      },
    ],
  },
  {
    name: "documentation",
    label: "Documentation",
    icon: "mdi:book-open-page-variant-outline",
    description: "Product documentation articles organized by category",
    fields: [
      {
        db_fieldName: "title",
        label: "Title",
        type: "input",
        widget: "text",
        required: true,
        translated: true,
        helper: "Doc page title",
      },
      {
        db_fieldName: "slug",
        label: "Slug",
        type: "slug",
        widget: "slug",
        required: true,
        translated: false,
        helper: "URL-friendly identifier",
      },
      {
        db_fieldName: "content",
        label: "Content",
        type: "richtext",
        widget: "richtext",
        required: true,
        translated: true,
        helper: "Documentation content",
      },
      {
        db_fieldName: "category",
        label: "Category",
        type: "input",
        widget: "text",
        required: false,
        translated: true,
        helper: "Doc category for grouping",
      },
      {
        db_fieldName: "order",
        label: "Order",
        type: "number",
        widget: "number",
        required: false,
        translated: false,
        helper: "Display order within category",
      },
    ],
  },
];

/** Corporate preset: Team, Careers, Press */
const corporateCollections: CollectionPreset[] = [
  {
    name: "team",
    label: "Team",
    icon: "mdi:account-tie",
    description: "Team members across departments",
    fields: [
      {
        db_fieldName: "name",
        label: "Name",
        type: "input",
        widget: "text",
        required: true,
        translated: false,
        helper: "Full name",
      },
      {
        db_fieldName: "position",
        label: "Position",
        type: "input",
        widget: "text",
        required: true,
        translated: true,
        helper: "Job title",
      },
      {
        db_fieldName: "bio",
        label: "Bio",
        type: "richtext",
        widget: "richtext",
        required: false,
        translated: true,
        helper: "Professional biography",
      },
      {
        db_fieldName: "photo",
        label: "Photo",
        type: "image",
        widget: "media-upload",
        required: false,
        translated: false,
        helper: "Professional headshot",
      },
      {
        db_fieldName: "department",
        label: "Department",
        type: "input",
        widget: "text",
        required: false,
        translated: true,
        helper: "e.g., Engineering, Marketing",
      },
    ],
  },
  {
    name: "careers",
    label: "Careers",
    icon: "mdi:briefcase-search",
    description: "Job listings with requirements",
    fields: [
      {
        db_fieldName: "title",
        label: "Job Title",
        type: "input",
        widget: "text",
        required: true,
        translated: true,
        helper: "Position title",
      },
      {
        db_fieldName: "department",
        label: "Department",
        type: "input",
        widget: "text",
        required: true,
        translated: true,
        helper: "Department name",
      },
      {
        db_fieldName: "location",
        label: "Location",
        type: "input",
        widget: "text",
        required: true,
        translated: false,
        helper: "Office location or Remote",
      },
      {
        db_fieldName: "description",
        label: "Description",
        type: "richtext",
        widget: "richtext",
        required: true,
        translated: true,
        helper: "Full job description",
      },
      {
        db_fieldName: "requirements",
        label: "Requirements",
        type: "repeater",
        widget: "repeater",
        required: false,
        translated: true,
        helper: "List of requirements",
      },
    ],
  },
  {
    name: "press",
    label: "Press",
    icon: "mdi:newspaper-variant-outline",
    description: "Press releases and media coverage",
    fields: [
      {
        db_fieldName: "title",
        label: "Title",
        type: "input",
        widget: "text",
        required: true,
        translated: true,
        helper: "Press release title",
      },
      {
        db_fieldName: "date",
        label: "Date",
        type: "input",
        widget: "text",
        required: true,
        translated: false,
        helper: "Publication date",
      },
      {
        db_fieldName: "source",
        label: "Source",
        type: "input",
        widget: "text",
        required: false,
        translated: false,
        helper: "Source publication name",
      },
      {
        db_fieldName: "url",
        label: "URL",
        type: "input",
        widget: "text",
        required: false,
        translated: false,
        helper: "Link to original article",
      },
      {
        db_fieldName: "excerpt",
        label: "Excerpt",
        type: "richtext",
        widget: "richtext",
        required: false,
        translated: true,
        helper: "Summary or excerpt",
      },
    ],
  },
];

/** E-commerce preset: Products, Categories, Orders */
const ecommerceCollections: CollectionPreset[] = [
  {
    name: "products",
    label: "Products",
    icon: "mdi:package-variant-closed",
    description: "Products with pricing, inventory, and images",
    fields: [
      {
        db_fieldName: "title",
        label: "Product Name",
        type: "input",
        widget: "text",
        required: true,
        translated: true,
        helper: "Product title",
      },
      {
        db_fieldName: "slug",
        label: "Slug",
        type: "slug",
        widget: "slug",
        required: true,
        translated: false,
        helper: "URL-friendly identifier",
      },
      {
        db_fieldName: "description",
        label: "Description",
        type: "richtext",
        widget: "richtext",
        required: true,
        translated: true,
        helper: "Product description",
      },
      {
        db_fieldName: "price",
        label: "Price",
        type: "number",
        widget: "number",
        required: true,
        translated: false,
        helper: "Current selling price",
      },
      {
        db_fieldName: "comparePrice",
        label: "Compare Price",
        type: "number",
        widget: "number",
        required: false,
        translated: false,
        helper: "Original/compare-at price for sale display",
      },
      {
        db_fieldName: "sku",
        label: "SKU",
        type: "input",
        widget: "text",
        required: false,
        translated: false,
        helper: "Stock keeping unit",
      },
      {
        db_fieldName: "inventory",
        label: "Inventory",
        type: "number",
        widget: "number",
        required: false,
        translated: false,
        helper: "Available quantity in stock",
      },
      {
        db_fieldName: "images",
        label: "Images",
        type: "image",
        widget: "media-upload",
        required: false,
        translated: false,
        helper: "Product images/gallery",
        default: undefined,
      },
      {
        db_fieldName: "categories",
        label: "Categories",
        type: "reference",
        widget: "relation",
        required: false,
        translated: false,
        helper: "Product categories (multi-select)",
        default: undefined,
        options: ["multiple"],
      },
      {
        db_fieldName: "variants",
        label: "Variants",
        type: "repeater",
        widget: "repeater",
        required: false,
        translated: false,
        helper: "Product variants (size, color, etc.)",
      },
    ],
  },
  {
    name: "product_categories",
    label: "Product Categories",
    icon: "mdi:shape-outline",
    description: "Product categories with hierarchical support",
    fields: [
      {
        db_fieldName: "name",
        label: "Name",
        type: "input",
        widget: "text",
        required: true,
        translated: true,
        helper: "Category name",
      },
      {
        db_fieldName: "slug",
        label: "Slug",
        type: "slug",
        widget: "slug",
        required: true,
        translated: false,
        helper: "URL-friendly identifier",
      },
      {
        db_fieldName: "image",
        label: "Image",
        type: "image",
        widget: "media-upload",
        required: false,
        translated: false,
        helper: "Category banner image",
      },
      {
        db_fieldName: "parentCategory",
        label: "Parent Category",
        type: "reference",
        widget: "relation",
        required: false,
        translated: false,
        helper: "Parent category for hierarchy",
      },
    ],
  },
  {
    name: "orders",
    label: "Orders",
    icon: "mdi:receipt",
    description: "Customer orders with items and status tracking",
    fields: [
      {
        db_fieldName: "orderNumber",
        label: "Order Number",
        type: "input",
        widget: "text",
        required: true,
        translated: false,
        helper: "Unique order identifier",
      },
      {
        db_fieldName: "customer",
        label: "Customer",
        type: "input",
        widget: "text",
        required: true,
        translated: false,
        helper: "Customer name or ID",
      },
      {
        db_fieldName: "items",
        label: "Items",
        type: "repeater",
        widget: "repeater",
        required: true,
        translated: false,
        helper: "Order line items",
      },
      {
        db_fieldName: "total",
        label: "Total",
        type: "number",
        widget: "number",
        required: true,
        translated: false,
        helper: "Order total amount",
      },
      {
        db_fieldName: "status",
        label: "Status",
        type: "select",
        widget: "select",
        required: true,
        translated: false,
        helper: "Order fulfillment status",
        default: "pending",
        options: ["pending", "processing", "shipped", "delivered", "cancelled"],
      },
    ],
  },
];

// =============================================================================
// Complete Preset Definitions
// =============================================================================

export const PRESETS: Preset[] = [
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
    id: "demo",
    title: "Demo / Test Suite",
    description: "Comprehensive test suite with all widget types and nested collections.",
    icon: "mdi:test-tube",
    features: ["All Widgets", "Deep Nesting", "Relations", "Menu Structure", "Revision History"],
    complexity: "advanced",
    collections: [],
  },
  {
    id: "blog",
    title: "Blog / Editorial",
    description:
      "Classic blog setup with posts, categories, and authors. Perfect for content creators.",
    icon: "mdi:post-outline",
    features: ["Posts Collection", "Categories", "Authors", "SEO Config", "Rich Text Editing"],
    complexity: "simple",
    collections: blogCollections,
  },
  {
    id: "agency",
    title: "Agency / Portfolio",
    description: "Showcase work, services, and client testimonials. Optimized for agencies.",
    icon: "mdi:briefcase-outline",
    features: ["Projects & Portfolio", "Services", "Clients", "Testimonials", "Media Library"],
    complexity: "moderate",
    collections: agencyCollections,
  },
  {
    id: "saas",
    title: "SaaS Product",
    description: "Documentation, features, and pricing management for modern SaaS applications.",
    icon: "mdi:cloud-outline",
    features: ["Documentation", "Pricing Plans", "Features", "Changelog", "Multi-tenant Support"],
    complexity: "moderate",
    collections: saasCollections,
  },
  {
    id: "corporate",
    title: "Corporate Site",
    description:
      "Professional presence with team, careers, and locations. Built for large organizations.",
    icon: "mdi:domain",
    features: ["Team Members", "Careers / Jobs", "Locations", "Press", "Audit Logs"],
    complexity: "moderate",
    collections: corporateCollections,
  },
  {
    id: "ecommerce",
    title: "E-commerce",
    description: "Complete online store with products, orders, and customers. Ready for scale.",
    icon: "mdi:shopping-outline",
    features: [
      "Products & Variants",
      "Orders & Customers",
      "Price & Repeater Widgets",
      "CRM Basics",
      "Inventory Tracking",
    ],
    complexity: "advanced",
    collections: ecommerceCollections,
  },
];
