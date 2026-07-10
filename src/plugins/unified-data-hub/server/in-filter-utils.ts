/**
 * @file src/plugins/unified-data-hub/server/in-filter-utils.ts
 * @description Client-side IN/EQ filters for REST partial pushdown remainder.
 */

export function applyInFilters(
  items: Record<string, unknown>[],
  filter: Record<string, unknown>,
): Record<string, unknown>[] {
  return items.filter((item) =>
    Object.entries(filter).every(([key, value]) => {
      if (Array.isArray(value)) {
        const actual = item[key];
        return value.map(String).includes(String(actual ?? ""));
      }
      return String(item[key] ?? "") === String(value ?? "");
    }),
  );
}
