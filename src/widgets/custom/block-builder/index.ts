/**
 * @file src/widgets/custom/block-builder/index.ts
 * @description Visual Block Builder widget for modular, component-driven page layouts.
 *
 * Features:
 * - Polymorphic block model: each block has a distinct type and internal schema
 * - Built-in presets for Hero, Text, Media, Call to Action, Features, Testimonial, FAQ, and Rich Text
 * - Keyboard-accessible reordering (Move Up / Down)
 * - Valibot runtime schema validation
 * - Headless JSON export compatible with Astro, Next.js, SvelteKit, and mobile apps
 */

import type { FieldInstance } from "@src/content/types";
import { createWidget } from "@src/widgets/widget-factory";
import {
  array,
  boolean,
  maxLength,
  minLength,
  nullable,
  object,
  optional,
  pipe,
  record,
  string,
  unknown,
} from "valibot";
import type { BlockBuilderProps, BlockTypeDefinition } from "./types";

export const DEFAULT_BLOCK_PRESETS: BlockTypeDefinition[] = [
  {
    type: "hero",
    label: "Hero Section",
    icon: "mdi:presentation",
    description: "High-impact page header with headline, call-to-action, and background",
    color: "primary",
    fields: [
      {
        name: "headline",
        label: "Headline",
        widget: "input",
        required: true,
        placeholder: "Build something extraordinary",
      },
      {
        name: "subheading",
        label: "Subheading",
        widget: "textarea",
        placeholder: "A compelling subheadline that drives engagement",
      },
      { name: "buttonText", label: "Button Label", widget: "input", placeholder: "Get Started" },
      { name: "buttonUrl", label: "Button URL", widget: "input", placeholder: "/signup" },
      {
        name: "imageUrl",
        label: "Image / Background URL",
        widget: "input",
        placeholder: "https://...",
      },
    ],
    defaultData: {
      headline: "Welcome to our platform",
      subheading: "Design responsive modular layouts with live block editing.",
      buttonText: "Learn More",
      buttonUrl: "#",
    },
  },
  {
    type: "text",
    label: "Text & Prose",
    icon: "mdi:format-text",
    description: "Rich editorial narrative, formatted body copy, and headings",
    color: "secondary",
    fields: [
      { name: "heading", label: "Section Heading", widget: "input", placeholder: "Our Philosophy" },
      {
        name: "content",
        label: "Body Text",
        widget: "textarea",
        required: true,
        placeholder: "Write your story here...",
      },
      {
        name: "align",
        label: "Alignment",
        widget: "select",
        options: [
          { label: "Left", value: "left" },
          { label: "Center", value: "center" },
        ],
        defaultValue: "left",
      },
    ],
    defaultData: {
      heading: "About This Initiative",
      content:
        "Crafting structured content with atomic blocks ensures modularity, accessibility, and high developer velocity.",
      align: "left",
    },
  },
  {
    type: "media",
    label: "Media Showcase",
    icon: "mdi:image-multiple-outline",
    description: "Images, figures, and video embed previews with captions",
    color: "tertiary",
    fields: [
      {
        name: "url",
        label: "Media URL",
        widget: "input",
        required: true,
        placeholder: "https://...",
      },
      {
        name: "altText",
        label: "Accessible Alt Text",
        widget: "input",
        required: true,
        placeholder: "Describe the image",
      },
      { name: "caption", label: "Caption", widget: "input", placeholder: "Photo by Jane Doe" },
      {
        name: "layout",
        label: "Display Layout",
        widget: "select",
        options: [
          { label: "Full Width", value: "full" },
          { label: "Contained", value: "contained" },
        ],
        defaultValue: "contained",
      },
    ],
    defaultData: {
      url: "https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=1200",
      altText: "Abstract colorful gradient background",
      caption: "Vibrant visual representation of dynamic digital experiences",
      layout: "contained",
    },
  },
  {
    type: "cta",
    label: "Call to Action",
    icon: "mdi:bullhorn-outline",
    description: "High-conversion banner with action triggers",
    color: "warning",
    fields: [
      {
        name: "title",
        label: "Call to Action Title",
        widget: "input",
        required: true,
        placeholder: "Ready to get started?",
      },
      {
        name: "description",
        label: "Description",
        widget: "textarea",
        placeholder: "Join thousands of teams building with SveltyCMS.",
      },
      {
        name: "primaryText",
        label: "Primary Button Text",
        widget: "input",
        placeholder: "Start Free Trial",
      },
      {
        name: "primaryUrl",
        label: "Primary Button Link",
        widget: "input",
        placeholder: "/register",
      },
      {
        name: "secondaryText",
        label: "Secondary Button Text",
        widget: "input",
        placeholder: "Book a Demo",
      },
      {
        name: "secondaryUrl",
        label: "Secondary Button Link",
        widget: "input",
        placeholder: "/contact",
      },
    ],
    defaultData: {
      title: "Supercharge your digital architecture today",
      description: "Get started in seconds with modern modular page builder components.",
      primaryText: "Get Started Now",
      primaryUrl: "/signup",
    },
  },
  {
    type: "features",
    label: "Features Grid",
    icon: "mdi:view-grid-plus-outline",
    description: "Multi-column grid showcasing product or service highlights",
    color: "success",
    fields: [
      {
        name: "title",
        label: "Section Title",
        widget: "input",
        placeholder: "Why Choose SveltyCMS",
      },
      {
        name: "description",
        label: "Section Subtitle",
        widget: "textarea",
        placeholder: "Enterprise architecture built for speed.",
      },
      {
        name: "feature1_title",
        label: "Feature 1 Title",
        widget: "input",
        placeholder: "Sub-2ms Persistence",
      },
      {
        name: "feature1_desc",
        label: "Feature 1 Description",
        widget: "textarea",
        placeholder: "Ultra-fast database abstraction.",
      },
      {
        name: "feature2_title",
        label: "Feature 2 Title",
        widget: "input",
        placeholder: "Fine-Grained Runes",
      },
      {
        name: "feature2_desc",
        label: "Feature 2 Description",
        widget: "textarea",
        placeholder: "Zero-dependency Svelte 5 reactivity.",
      },
      {
        name: "feature3_title",
        label: "Feature 3 Title",
        widget: "input",
        placeholder: "Fail-Closed Security",
      },
      {
        name: "feature3_desc",
        label: "Feature 3 Description",
        widget: "textarea",
        placeholder: "Defense-in-depth authorization.",
      },
    ],
    defaultData: {
      title: "Core Differentiators",
      description:
        "Everything you need to deliver high-performance digital content at global scale.",
      feature1_title: "Sub-2ms Persistence",
      feature1_desc: "Ultra-fast multi-engine database abstraction.",
      feature2_title: "Fine-Grained Runes",
      feature2_desc: "Zero-dependency Svelte 5 reactivity with deep mutations.",
      feature3_title: "Fail-Closed Security",
      feature3_desc: "Defense-in-depth authorization across all API surfaces.",
    },
  },
  {
    type: "testimonial",
    label: "Quote / Testimonial",
    icon: "mdi:format-quote-close",
    description: "Customer endorsement, social proof, or pull quote",
    color: "primary",
    fields: [
      {
        name: "quote",
        label: "Quote Text",
        widget: "textarea",
        required: true,
        placeholder: "SveltyCMS has completely transformed our workflow...",
      },
      {
        name: "author",
        label: "Author Name",
        widget: "input",
        required: true,
        placeholder: "Alex Rivera",
      },
      {
        name: "role",
        label: "Title / Organization",
        widget: "input",
        placeholder: "VP of Engineering, Acme Corp",
      },
      { name: "avatarUrl", label: "Avatar Image URL", widget: "input", placeholder: "https://..." },
    ],
    defaultData: {
      quote:
        "The modular block builder allowed our marketing and editorial teams to publish high-converting landing pages in minutes without waiting on developer sprints.",
      author: "Elena Rostova",
      role: "Head of Digital Experience",
    },
  },
  {
    type: "faq",
    label: "FAQ",
    icon: "mdi:help-circle-outline",
    description: "Interactive question-and-answer pair",
    color: "tertiary",
    fields: [
      {
        name: "question",
        label: "Question",
        widget: "input",
        required: true,
        placeholder: "What is SveltyCMS?",
      },
      {
        name: "answer",
        label: "Answer",
        widget: "textarea",
        required: true,
        placeholder: "Concise, helpful answer...",
      },
    ],
    defaultData: {
      question: "Is SveltyCMS self-hosted?",
      answer:
        "Yes — SveltyCMS runs on your own infrastructure with native SQLite, PostgreSQL, MariaDB, or MongoDB.",
    },
  },
  {
    type: "rich-text",
    label: "Rich Text",
    icon: "mdi:note-text-outline",
    description: "Formatted HTML or Markdown body content",
    color: "secondary",
    fields: [
      {
        name: "content",
        label: "Content (HTML / Markdown)",
        widget: "textarea",
        required: true,
        placeholder: "# Heading\n\nBody copy, lists, and quotes…",
      },
    ],
    defaultData: {
      content: "# Your story\n\nReplace this with rich editorial body copy.",
    },
  },
];

const singleBlockSchema = object({
  _id: string(),
  _type: string(),
  data: record(string(), unknown()),
  collapsed: optional(boolean()),
});

const validationSchema = (field: FieldInstance & BlockBuilderProps) => {
  let schema: any = array(singleBlockSchema);

  if (typeof field.min === "number" && field.min > 0) {
    schema = pipe(schema, minLength(field.min, `Must have at least ${field.min} blocks.`));
  }
  if (typeof field.max === "number" && field.max > 0) {
    schema = pipe(schema, maxLength(field.max, `Cannot have more than ${field.max} blocks.`));
  }

  return field.required
    ? pipe(schema, minLength(1, "At least one block is required."))
    : nullable(schema);
};

const BlockBuilderWidget = createWidget<BlockBuilderProps>({
  Name: "BlockBuilder",
  version: "1.0.0",
  Icon: "mdi:view-dashboard-outline",
  Description: "Visual polymorphic block builder for modular page layouts",
  inputComponentPath: "/src/widgets/custom/block-builder/input.svelte",
  displayComponentPath: "/src/widgets/custom/block-builder/display.svelte",
  validationSchema,

  defaults: {
    blocks: DEFAULT_BLOCK_PRESETS,
    min: 0,
    addLabel: "Add Block",
  },

  GuiSchema: {
    label: { widget: "Input", required: true },
    db_fieldName: { widget: "Input", required: false },
    required: { widget: "Toggles", required: false },
    min: { widget: "Input", type: "number", label: "Min Blocks" },
    max: { widget: "Input", type: "number", label: "Max Blocks" },
    addLabel: { widget: "Input", label: "Add Button Label" },
    blocks: { widget: "Json", label: "Allowed Block Definitions (JSON)" },
  },

  GraphqlSchema: () => ({
    typeID: "[JSON]",
    graphql: "",
  }),
});

export default BlockBuilderWidget;
export type FieldType = ReturnType<typeof BlockBuilderWidget>;
