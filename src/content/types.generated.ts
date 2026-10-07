/**
 * @file src/content/types.generated.ts
 * @description Automatically generated collection and entry types for SveltyCMS.
 * This file is managed by the Vite build plugin and should NOT be edited manually.
 */

import type { CollectionEntry } from "./types";

/* AUTOGEN_START: ContentTypes */
export type ContentTypes =
  | "carts"
  | "coupons"
  | "orders"
  | "product_categories"
  | "product_reviews"
  | "products"
  | "shipping_zones"
  | "tax_rates"
  | (string & {});

export interface CollectionMap {
  [key: string]: CollectionEntry & Record<string, any>;
  carts: CollectionEntry & {
    sessionId: string;
    customer: string;
    items: string;
    subtotal: string;
    appliedCoupon: string;
    expiresAt: string;
  };
  coupons: CollectionEntry & {
    code: string;
    discountType: string;
    amount: string;
    minSpend: string;
    usageLimit: string;
    usedCount: string;
    expiresAt: string;
    freeShipping: string;
  };
  orders: CollectionEntry & {
    orderNumber: string;
    customer: string;
    customerEmail: string;
    items: string;
    subtotal: string;
    shippingTotal: string;
    taxTotal: string;
    discountTotal: string;
    total: string;
    totalCents: string;
    currency: string;
    invoiceNumber: string;
    netTotal: string;
    taxRate: string;
    customerName: string;
    vatId: string;
    vatNote: string;
    shipLine1: string;
    shipPostal: string;
    shipCity: string;
    shipCountry: string;
    deliveredAt: string;
    withdrawalAt: string;
    withdrawalName: string;
    status: string;
    paymentMethod: string;
    stripePaymentIntentId: string;
    trackingUrl: string;
    inventoryCommitted: string;
    couponCode: string;
    cartId: string;
    shippingAddress: string;
    billingAddress: string;
    notes: string;
  };
  product_categories: CollectionEntry & {
    name: string;
    slug: string;
    image: string;
    description: string;
    parentCategory: string;
  };
  product_reviews: CollectionEntry & {
    product: string;
    customerEmail: string;
    customerName: string;
    rating: string;
    review: string;
    approved: string;
  };
  products: CollectionEntry & {
    title: string;
    slug: string;
    shortDescription: string;
    description: string;
    price: string;
    taxClass: string;
    comparePrice: string;
    priceHistory: string;
    sku: string;
    inventory: string;
    lowStockThreshold: string;
    weight: string;
    dimensions: string;
    downloadable: string;
    downloadFile: string;
    tags: string;
    images: string;
    categories: string;
    variants: string;
    attributes: string;
  };
  shipping_zones: CollectionEntry & {
    name: string;
    countries: string;
    method: string;
    rate: string;
    freeThreshold: string;
  };
  tax_rates: CollectionEntry & {
    country: string;
    state: string;
    rate: string;
    label: string;
    shippingTaxable: string;
    reducedRate: string;
  };
}
/* AUTOGEN_END: ContentTypes */
