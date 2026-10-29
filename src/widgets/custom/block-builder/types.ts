/**
 * @file src/widgets/custom/block-builder/types.ts
 * @description Types for the polymorphic Visual Block Builder widget.
 *
 * Features:
 * - Polymorphic block definitions with per-block schemas
 * - Standard block presets (Hero, Text, Media, CTA, Features, Testimonial, FAQ, Rich Text, Pricing, Stats, Logo Cloud)
 * - Flexible serialization format compatible with headless frontends
 * - Page blueprints and prompt-to-layout composition models
 */

export interface BlockFieldDefinition {
  name: string;
  label: string;
  widget: "input" | "textarea" | "rich-text" | "media-upload" | "select" | "checkbox" | "number";
  placeholder?: string;
  defaultValue?: unknown;
  options?: { label: string; value: string }[];
  required?: boolean;
}

export interface BlockTypeDefinition {
  type: string;
  label: string;
  icon: string;
  description?: string;
  color?: string;
  fields?: BlockFieldDefinition[];
  defaultData?: Record<string, unknown>;
}

export interface BlockInstance {
  _id: string;
  _type: string;
  data: Record<string, unknown>;
  collapsed?: boolean;
}

export interface PageBlueprint {
  id: string;
  name: string;
  icon: string;
  description: string;
  category: "landing" | "marketing" | "content" | "conversion";
  blocks: Array<{
    type: string;
    data: Record<string, unknown>;
  }>;
}

export interface BlockBuilderProps {
  /** Label for the Add Block action */
  addLabel?: string;
  /** Available block type definitions */
  blocks?: BlockTypeDefinition[];
  /** Minimum number of blocks required */
  min?: number;
  /** Maximum number of blocks allowed */
  max?: number;
  [key: string]: unknown;
}

export type BlockBuilderValue = BlockInstance[];
