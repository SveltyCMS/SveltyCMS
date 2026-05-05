/**
 * @file src/widgets/custom/Rating/types.ts
 * @description Type definitions for the Rating widget.
 *
 * @features
 * - **Strongly Typed**: Defines clear configuration options for a rating input.
 * - **Customizable Icons**: Allows for custom icons for different rating states.
 */

// Defines the properties unique to the Rating widget, configured in the collection builder
export interface RatingProps {
  max?: number; // Maximum value (default 5)
  step?: 0.5 | 1; // Step value (default 1)
  iconFull?: string; // Icon for full rating
  iconHalf?: string; // Icon for half rating
  iconEmpty?: string; // Icon for empty rating
  showValue?: boolean; // Whether to show the numeric value
  color?: string; // Optional theme color
  // Index signature to satisfy WidgetProps constraint
  [key: string]: unknown;
}
