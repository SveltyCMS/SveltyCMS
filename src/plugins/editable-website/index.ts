/**
 * @file src/plugins/editable-website/index.ts
 * @description Editable Website & Live Preview Plugin.
 * Provides real-time bidirectional live preview with visual editing and handshake protocol.
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
    description: "Real-time bidirectional live preview with visual editing and handshake protocol.",
    icon: "mdi:web",
    enabled: true,
    category: "editing",
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
