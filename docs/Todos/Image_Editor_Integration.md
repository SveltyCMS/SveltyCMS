# Image Editor Integration and Refactoring Plan

## 1. Objective

The primary goal is to transition the Image Editor from a standalone page into a fully integrated, reusable component within the SveltyCMS ecosystem. This will provide a seamless, Pintura-like user experience for image manipulation directly within the `MediaUpload` widget and the `MediaGallery`.

This refactoring will focus on implementing two key features:
1.  **Focal Point Selection**: Allowing users to define the most important part of an image for intelligent cropping.
2.  **Watermarking**: Applying predefined watermarks to images.

## 2. Architectural Changes

### 2.1. Decouple the Image Editor

The current Image Editor, located at `/src/routes/(app)/imageEditor`, will be refactored into a generic, reusable Svelte component.

-   **Old Structure**: A standalone page route.
-   **New Structure**: A component that can be imported and used anywhere, primarily within a modal.

### 2.2. Componentization

-   **`ImageEditor.svelte`**: Will be refactored to remove page-specific logic and accept an image source (`src`) and initial settings as props. It will emit events for `apply` and `cancel`.
-   **`ModalImageEditor.svelte`**: This existing component in the `mediaUpload` widget will host the refactored `ImageEditor.svelte`. It will manage the modal state and communication between the editor and the underlying widget.
-   **Component Folder**: All editor-related UI components (`Crop.svelte`, `FocalPoint.svelte`, etc.) will be consolidated under `/src/components/imageEditor/` to improve organization.

## 3. Backend API for Image Processing

A new API endpoint will be created to handle image manipulations using the `sharp` library on the server.

-   **Endpoint**: `POST /api/media/process/[id]`
-   **`[id]`**: The ID of the media file to process.

### 3.1. API Request Body

The endpoint will accept a JSON object specifying the desired transformations. This approach is flexible and easily extendable.

```json
{
  "focalpoint": {
    "x": 0.5,
    "y": 0.3
  },
  "watermark": {
    "id": "watermark_collection_item_id",
    "position": "bottom-right",
    "scale": 0.15
  },
  "operations": [
    { "type": "rotate", "angle": 90 },
    { "type": "flip", "axis": "horizontal" }
  ]
}
```

### 3.2. Backend Logic (`sharp.js`)

-   The endpoint will fetch the original image file.
-   It will use `sharp` to apply the transformations in sequence.
-   **Focal Point**: `sharp`'s `extract` or `resize` with `gravity` will be used based on the provided `x` and `y` coordinates.
-   **Watermark**: The watermark image (retrieved via its ID from the appropriate collection) will be composited over the main image.
-   The processed image will either overwrite the original or be saved as a new variant, depending on the system configuration.

## 4. Frontend Implementation

### 4.1. `FocalPoint.svelte`

-   This component will display a simple UI over the image in the editor.
-   It will feature a "rule of thirds" grid to help users choose the focal point.
-   Clicking on the grid will update the focal point coordinates (normalized from 0 to 1).
-   These coordinates will be passed to the main editor state.

### 4.2. `Watermark.svelte`

-   This component will fetch available watermarks from the predefined `Watermarks` collection.
-   It will display a list or grid of watermark options for the user to select.
-   The selected watermark's ID and other parameters (like position) will be added to the main editor state.

## 5. Integration Workflow

### 5.1. In `MediaUpload` Widget

1.  A user drags and drops an image into the `MediaUpload` widget.
2.  After upload, an "Edit" button appears next to the image thumbnail.
3.  Clicking "Edit" opens the `ModalImageEditor.svelte` with the newly uploaded image.
4.  The user applies edits (e.g., sets a focal point).
5.  On "Apply", the frontend calls the `/api/media/process/[id]` endpoint.
6.  The backend processes the image.
7.  The modal closes, and the `MediaUpload` widget displays the updated image thumbnail.

### 5.2. In `MediaGallery`

1.  The user right-clicks an image in the gallery or uses an "Edit" action.
2.  The `ModalImageEditor.svelte` opens with the selected image.
3.  The workflow proceeds as above.

This plan establishes a clear path to creating a powerful, integrated image editor while maintaining clean architecture and a great user experience.
