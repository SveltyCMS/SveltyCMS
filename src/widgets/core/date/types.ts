/**
 * @file src/widgets/core/date/types.ts
 * @description Type definitions for the Date widget.
 */

/**
 * Defines the properties unique to the Date widget.
 * Using `Record<string, never>` is the strictest way to define an empty
 * object type, satisfying even the most stringent linting rules.
 */
export type DateProps = Record<string, never>;
