---
title: 'Refactoring the Image Editor: A Strategic Plan'
description: 'A guide for integrating the image editor into the Media Gallery and MediaUpload widgets.'
---

# Refactoring the Image Editor: A Strategic Plan

This document outlines the strategy for evolving the SveltyCMS Image Editor from a standalone application into a deeply integrated, high-performance feature within the `MediaGallery` and `MediaUpload` workflows.

The primary goal is to create a seamless, Pintura-like user experience for content creators, while leveraging the server-side power of `sharp` for robust image processing.

## 1. Core Architectural Shift: The Editor as a Modal Service

The Image Editor will no longer exist as a separate page. Instead, it will be refactored into a reusable, modal component.

-   **New Location**: All editor-related components will be moved to a new, centralized directory: `src/components/ImageEditor/`.
-   **Invocation**: This modal will be launched from:
    -   An "Edit" button within the `MediaUpload` widget after an image is selected.
    -   An "Edit" button or context menu action in the `MediaGallery`.

This makes the editor a "service" that can be called upon whenever image manipulation is needed, ensuring a consistent experience across the platform.

## 2. Redefining Roles: Client-Side Preview vs. Server-Side Processing

To ensure performance and quality, we will clearly separate the client and server responsibilities.

-   **Client (Konva.js)**: The browser-based editor will act as a **non-destructive previewer and instruction generator**. It provides a fast, real-time, interactive experience. When the user is done, it will not render the final image. Instead, it will generate a JSON object describing all the edits (a list of "operations").

-   **Server (`sharp`)**: The actual image manipulation will be handled by `sharp` on the server. This is far more efficient and powerful, avoiding browser memory limits and producing higher-quality results.

## 3. New API Endpoint: `POST /api/media/process`

A new endpoint is required to handle the server-side processing. This endpoint will receive the list of operations from the client.

**Endpoint**: `POST /api/media/process`

**Request Body**:
```json
{
  "mediaId": "60d5f3f7771a8b001f8e4bde",
  "operations": [
    { "type": "rotate", "angle": 90 },
    { "type": "crop", "x": 100, "y": 50, "width": 800, "height": 600 },
    { "type": "watermark", "watermarkId": "watermark_collection_item_xyz" }
  ]
}
```

**Response**: `200 OK`
Returns the updated media document, including the new URL to the processed image. The server will save the result as a new file (e.g., `my-image-edited-timestamp.jpg`) to avoid overwriting the original.

## 4. Key Feature Implementation

### Focal Point

-   **Goal**: Allow users to set a point of interest, similar to Drupal's focal point feature, for better automated cropping.
-   **Implementation**:
    1.  A new `FocalPoint.svelte` tool will be created for the editor UI. It will display a draggable crosshair over the image.
    2.  When the user saves, the tool will determine the focal point's normalized coordinates (e.g., `{ x: 0.45, y: 0.60 }`).
    3.  This is **metadata**, not an image operation. The coordinates will be saved to the media item's database record by calling the existing `PUT /api/media` endpoint.
    4.  The media schema will be updated to include an optional `focalPoint: { x: number, y: number }` field.

### Watermarking

-   **Goal**: Allow users to apply pre-defined watermarks from a CMS collection.
-   **Implementation**:
    1.  A new `Watermark.svelte` tool will fetch available watermarks from the relevant SveltyCMS collection.
    2.  The user can select a watermark and preview it on the canvas.
    3.  When applied, a `watermark` operation is added to the list sent to the `/api/media/process` endpoint. The server will then use `sharp` to composite the watermark onto the image.

## 5. Integration Plan

### `MediaUpload` Widget

1.  **Modify `src/widgets/core/mediaUpload/Input.svelte`**:
    -   After a file is selected or uploaded, an "Edit" button will appear next to the image thumbnail.
2.  **Launch Editor**:
    -   Clicking "Edit" will open the new `ImageEditor` modal, passing in the selected image's data.
3.  **Apply Changes**:
    -   When the user clicks "Apply" in the editor, the component will call the `POST /api/media/process` endpoint.
    -   Upon a successful response, the `MediaUpload` widget will automatically update its value to use the new, edited image ID/URL.

### `MediaGallery`

1.  **Modify `src/routes/(app)/mediagallery/MediaGrid.svelte`**:
    -   Add an "Edit" icon button or context menu item to each image in the gallery.
2.  **Launch Editor**:
    -   This action will launch the same `ImageEditor` modal, pre-loaded with the selected image.
3.  **Apply Changes**:
    -   The process is identical: the editor calls the API, and on success, the gallery will be refreshed to display the updated image thumbnail.

## 6. Proposed New File Structure

The existing `/src/routes/(app)/imageEditor/` directory will be removed. The new, reusable components will be organized as follows:

```
src/
└── components/
    └── ImageEditor/
        ├── ImageEditor.svelte      # The main modal and state manager
        ├── EditorCanvas.svelte     # The Konva.js canvas component
        ├── EditorSidebar.svelte    # The left-hand tool selector
        ├── EditorToolPanel.svelte  # The top bar for tool-specific actions
        ├── tools/                  # Individual, self-contained tool logic
        │   ├── Crop.svelte
        │   ├── FocalPoint.svelte
        │   ├── Watermark.svelte
        │   └── ...
        └── stores/
            └── imageEditorStore.ts # A store for managing editor state
```

This plan provides a clear path forward to create a powerful, integrated, and maintainable image editing experience in SveltyCMS.
