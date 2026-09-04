/**
 * @file tests/unit/compilation/fixtures/collections/helpers.ts
 * @description Dependency helper for the widget-collection compile regression fixture.
 * Features: plain module-level export (no schema) that must survive compilation
 * with a `.js`-suffixed relative import from the collection file.
 */

export const slugify = (s: string): string => s.toLowerCase().replace(/\s+/g, "-");
