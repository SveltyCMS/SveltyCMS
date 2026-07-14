/**
 * @file src/services/core/marketplace-service.ts
 * @description Marketplace integration for themes and widgets.
 *
 * Currently stubbed — the full marketplace integration is planned.
 * The appearance page references MarketplaceItem for type safety.
 */

export interface MarketplaceItem {
  id: string;
  name: string;
  description: string;
  version: string;
  author: string;
  installed: boolean;
  type: "theme" | "widget" | "preset";
  previewUrl?: string;
  downloadUrl?: string;
  source?: string;
  price?: number;
  rating?: number;
  downloads?: number;
  createdAt?: string;
  updatedAt?: string;
}
