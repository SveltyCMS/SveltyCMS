/**
 * @file src/plugins/unified-data-hub/marketplace-listing.ts
 * @description Local marketplace catalog entry for Unified Data Hub (offline / stub discovery).
 *
 * Surfaced via marketplace-service when remote catalog is unavailable or as a mixed merge.
 * Full listing lives at marketplace.sveltycms.com when online.
 */

import type { MarketplaceItem } from "@src/services/core/marketplace-service";

export const unifiedDataHubMarketplaceListing: MarketplaceItem = {
  id: "plugin-unified-data-hub",
  name: "Unified Data Hub",
  description:
    "Governed multi-source data federation — connect Postgres and REST APIs as virtual collections with LocalCMS performance, WebMCP tools, and entry editor enrichment previews.",
  type: "plugin",
  category: "data-platform",
  version: "2.0.0",
  author: "SveltyCMS",
  source: "local",
  installable: false,
  homepageUrl: "https://marketplace.sveltycms.com/packages/unified-data-hub",
  previewUrl: "https://docs.sveltycms.com/src/plugins/unified-data-hub/unified-data-hub.mdx",
};
