/**
 * @file src/widgets/custom/tags/types.ts
 * @description Types for the Tags widget.
 */

import type { WidgetProps } from "@src/widgets/types";

export interface TagsProps extends WidgetProps {
  // Custom tag configurations
  maxTags?: number;
  minTags?: number;
  placeholder?: string;

  // UI behavior
  allowDuplicates?: boolean;
  caseSensitive?: boolean;

  // Auto-complete suggestions
  suggestions?: string[];
}
