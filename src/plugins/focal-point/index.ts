/**
 * @file src/plugins/focal-point/index.ts
 * @description Focal Point & Aspect Preview Plugin — enterprise-grade image
 * cropping preview for SveltyCMS. Inspired by Drupal's Focal Point module
 * and Payload CMS's aspect-preview plugin.
 *
 * Features:
 * - Visual aspect ratio preview grid (16:9, 1:1, 4:3, etc.)
 * - Draggable focal point crosshair with live multi-ratio feedback
 * - Rule-of-thirds overlay guides
 * - Keyboard-accessible (arrow keys, Shift for 10px steps)
 * - Persists focal point to core CmsMediaMetadata via PATCH /api/media/:id
 * - Injects into media_gallery zone via the Slot system
 *
 * Architecture:
 * - Core (src/components/media/aspect-preview.svelte): Pure CSS rendering
 * - Plugin (this file): Slot injection, config defaults, marketplace gating
 */

import { definePlugin } from "../define-plugin";

export const focalPointPlugin = definePlugin({
  metadata: {
    id: "focal-point",
    name: "Focal Point & Aspect Preview",
    version: "1.0.0",
    description:
      "Visual aspect ratio preview with draggable focal point. See how images crop to 16:9, 1:1, 4:3, and more — all updated live as you drag. Modeled after Drupal Focal Point + Payload Aspect Preview.",
    author: "SveltyCMS",
    icon: "mdi:crosshairs-gps",
    enabled: false,
    category: "media",
    capabilities: ["media:read", "media:write", "ui:slot"],
  },
  ui: {
    slots: [
      {
        id: "focal-point-media-gallery",
        zone: "media_gallery",
        position: 10,
        component: () => import("./components/focal-point-toolbar.svelte"),
        permissions: ["media:write"],
      },
      {
        id: "focal-point-editor-tool",
        zone: "image_editor_tool",
        position: 5,
        component: () => import("./components/focal-point-editor-tool.svelte"),
        permissions: ["media:write"],
      },
    ],
  },
  config: {
    public: {
      defaultRatios: ["16:9", "3:2", "4:3", "1:1", "2:3", "9:16", "21:9"],
      showRuleOfThirds: true,
      enableKeyboardShortcuts: true,
    },
  },
});
