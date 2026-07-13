/**
 * @file src/plugins/editable-website/index.ts
 * @description Editable Website & Live Preview Plugin — CMS↔frontend visual editing bridge.
 *
 * ### Licensing (€14.99, 14-day trial):
 * - **Gated**: Live Preview tab, `/api/preview/authorize`, bidirectional iframe sync, Svedit edit mode in preview
 * - **Free**: Public site, Svedit rendering, CMS form/JSON editing on `pages` — no license required
 *
 * Features:
 * - Real-time bidirectional live preview with visual editing
 * - Dynamic origin from collection schema's previewTargetUrl
 * - Ephemeral preview token authorization
 * - Handshake protocol via postMessage
 */

import { slotRegistry } from "@src/plugins/slot-registry";
import { definePlugin } from "../define-plugin";
import { collectionHasLivePreview } from "./license-gate";

const livePreviewComponent = "./live-preview.svelte";

slotRegistry.register({
  id: "live_preview",
  zone: "entry_edit",
  component: () => import(/* @vite-ignore */ livePreviewComponent),
  props: {
    label: "Live Preview",
    icon: "mdi:eye-outline",
  },
  condition: (context: { collection?: { livePreview?: unknown } }) =>
    collectionHasLivePreview(context?.collection?.livePreview),
});

export const editableWebsitePlugin = definePlugin({
  metadata: {
    id: "editable-website",
    name: "Editable Website & Live Preview",
    version: "1.2.0",
    description:
      "Bidirectional live preview bridge: iframe sync, click-to-edit, and Svedit inline editing in the CMS. Site rendering stays free.",
    icon: "mdi:web",
    enabled: false,
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
});
