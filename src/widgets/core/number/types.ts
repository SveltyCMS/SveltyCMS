/**
 * @file src/widgets/custom/Number/types.ts
 * @description Type definitions for the Number widget.
 *
 * @features
 * - **Strongly Typed**: Defines clear configuration options for numeric inputs.
 * - **Precise Control**: Includes `min`, `max`, and `step` for fine-grained control.
 */

// Defines the properties unique to the Number widget, configured in the collection builder
export interface NumberProps {
  min?: number; // Minimum allowed value
  max?: number; // Maximum allowed value
  step?: number; // Step value for input
  prefix?: string; // Custom prefix
  suffix?: string; // Custom suffix
  placeholder?: string; // Input placeholder
  // Index signature to satisfy WidgetProps constraint
  [key: string]: unknown;
}
