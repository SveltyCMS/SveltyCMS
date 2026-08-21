/**
 * @file src/plugins/commerce/variants.ts
 * @description Cartesian product of attribute values → variant rows for bulk edit.
 */

export interface VariantAttribute {
  name: string;
  values: string[];
}

export interface GeneratedVariant {
  title: string;
  sku: string;
  attributes: Record<string, string>;
  inventory: number;
  price: number;
}

export function expandVariantMatrix(
  attributes: VariantAttribute[],
  opts?: { skuPrefix?: string; price?: number },
): GeneratedVariant[] {
  const attrs = attributes
    .map((a) => ({
      name: String(a.name || "").trim(),
      values: (a.values || []).map((v) => String(v).trim()).filter(Boolean),
    }))
    .filter((a) => a.name && a.values.length);
  if (!attrs.length) return [];

  const MAX_VARIANTS = 500;
  let combos: Record<string, string>[] = [{}];
  for (const attr of attrs) {
    const next: Record<string, string>[] = [];
    for (const combo of combos) {
      for (const value of attr.values) {
        if (next.length >= MAX_VARIANTS) break;
        next.push({ ...combo, [attr.name]: value });
      }
      if (next.length >= MAX_VARIANTS) break;
    }
    combos = next;
    if (combos.length >= MAX_VARIANTS) break;
  }

  const prefix = (opts?.skuPrefix || "SKU").toUpperCase().replace(/[^A-Z0-9]+/g, "-");
  return combos.map((attributesMap) => {
    const title = Object.values(attributesMap).join(" / ");
    const skuTail = Object.values(attributesMap)
      .map((v) => v.toUpperCase().replace(/[^A-Z0-9]+/g, ""))
      .join("-");
    return {
      title,
      sku: `${prefix}-${skuTail}`.slice(0, 64),
      attributes: attributesMap,
      inventory: 0,
      price: opts?.price ?? 0,
    };
  });
}
