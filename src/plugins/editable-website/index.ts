/**
 * @file src/plugins/editable-website/index.ts
 * @description Editable Website & Live Preview Plugin — headless-aware with dynamic preview origins.
 *
 * Features:
 * - Real-time bidirectional live preview with visual editing
 * - Dynamic origin from collection schema's previewTargetUrl
 * - Ephemeral preview token authorization
 * - Handshake protocol via postMessage
 *
 * ### Licensing (Fully Paid — €14.99):
 * - Requires active marketplace license for all functionality
 * - 14-day trial from first admin registration
 */

import { slotRegistry } from "@src/plugins/slot-registry";
import type { Plugin } from "@src/plugins/types";

const livePreviewComponent = "./live-preview.svelte";

// Register the Live Preview slot with a condition
slotRegistry.register({
  id: "live_preview",
  zone: "entry_edit",
  component: () => import(/* @vite-ignore */ livePreviewComponent),
  props: {
    label: "Live Preview",
    icon: "mdi:eye-outline",
  },
  // Only show if the collection has livePreview enabled
  condition: (context: any) => context?.collection?.livePreview === true,
});

export const editableWebsitePlugin: Plugin = {
  metadata: {
    id: "editable-website",
    name: "Editable Website & Live Preview",
    version: "1.1.0",
    description:
      "Real-time bidirectional live preview with visual editing and handshake protocol. Uses collection previewTargetUrl for dynamic origin resolution.",
    icon: "mdi:web",
    enabled: false,
    category: "editing",
  },
  hooks: {
    beforeSave: async (context, _collection, data) => {
      // Fully paid plugin — license wall for live preview functionality
      const { checkExtensionLicense } = await import("@src/utils/license-manager");
      const status = await checkExtensionLicense("plugin", "editable-website");
      if (!status.active) {
        throw new Error(
          "403 Forbidden: Active license required for Editable Website & Live Preview. Purchase at marketplace.sveltycms.com",
        );
      }
      return data;
    },
  },
  ui: {
    editView: {
      tabs: [
        {
          id: "live_preview",
          label: "Live Preview",
          icon: "mdi:eye-outline",
          component: () => import(/* @vite-ignore */ livePreviewComponent),
        },
      ],
    },
  },
};
