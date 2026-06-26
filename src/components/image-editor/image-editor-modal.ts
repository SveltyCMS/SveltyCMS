/**
 * @file src/components/image-editor/image-editor-modal.ts
 * @description Shared modal configuration for the image editor shell.
 */

/** Contained editor modal — large centered panel on desktop, edge-to-edge on mobile */
export const IMAGE_EDITOR_MODAL_SIZE = "editor" as const;

export const IMAGE_EDITOR_MODAL_CLASSES =
  "!w-[min(96vw,82rem)] !min-w-[min(96vw,82rem)] !max-w-[min(96vw,82rem)] !rounded-none !border-0 !ring-0 !outline-none !shadow-none !bg-[#0a0a0a] max-md:!w-full max-md:!min-w-full max-md:!max-w-none max-md:!h-full max-md:!min-h-full max-md:!max-h-none max-md:!m-0 max-md:!bg-[#1a1a1a]";

export function openImageEditorModal(
  trigger: (component: unknown, props: Record<string, unknown>) => void,
  component: unknown,
  props: Record<string, unknown>,
) {
  trigger(component, {
    ...props,
    size: IMAGE_EDITOR_MODAL_SIZE,
    modalClasses: IMAGE_EDITOR_MODAL_CLASSES,
  });
}
