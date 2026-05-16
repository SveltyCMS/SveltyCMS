/**
 * @file src/widgets/core/date-time/types.ts
 * @description Type definitions for the DateTime widget
 */

// Defines the properties unique to the DateTime widget
export interface DateTimeProps {
  // Display format for the date @default 'medium'
  displayFormat?: "short" | "medium" | "long" | "full";

  // Maximum allowed date (ISO 8601 string or Date object)
  maxDate?: string | Date;
  // Minimum allowed date (ISO 8601 string or Date object)
  minDate?: string | Date;

  // Allow additional widget properties
  [key: string]: unknown;
}
