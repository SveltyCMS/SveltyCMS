/**
 * @file src/widgets/core/datetime/types.ts
 * @description Type definitions for the DateTime widget.
 *
 * Defines the type for custom properties specific to the DateTime widget.
 *
 * @features
 * - **Strictly Typed**: Uses `Record<string, never>` for a truly empty object type.
 * - **Linter-Friendly**: Compliant with strict `@typescript-eslint` rules.
 */

// Defines the properties unique to the DateTime widget.
export type DateTimeProps = Record<string, never>;
