/**
 * @file src/widgets/custom/tags/types.ts
 * @description Types for the Tags widget.
 */

import type { WidgetProps } from "@src/widgets/types";

export interface TagsProps extends WidgetProps {
  label: string;
  db_fieldName?: string;
  required?: boolean;
  display?: "tags" | "list" | "chips";
  color?: string;
  maxTags?: number;
  minTags?: number;
  placeholder?: string;
  [key: string]: any;

  // UI behavior
  allowDuplicates?: boolean;
  caseSensitive?: boolean;

  // Auto-complete suggestions
  suggestions?: string[];
}
