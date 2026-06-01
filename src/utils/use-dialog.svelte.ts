/**
 * @file src/utils/use-dialog.svelte.ts
 * @description Shared Svelte 5 rune for native `<dialog>` lifecycle management.
 *
 * Handles modal/drawer open/close mechanics, focus trapping, Escape key
 * dismissal, backdrop click, body scroll lock, and WCAG 3.0 ARIA attributes.
 * Used by modal.svelte and drawer.svelte to eliminate duplicated dialog logic.
 *
 * ### Features:
 * - showModal()/close() lifecycle with body scroll lock
 * - focus trapping (Tab/Shift+Tab cycles within dialog)
 * - focus restoration to trigger element on close
 * - Escape key dismissal (configurable)
 * - Backdrop click dismissal (configurable)
 * - WCAG 3.0: aria-modal, role="dialog", aria-label/labelledby
 * - open/close lifecycle callbacks (onopen, onclose)
 * - Full Svelte 5 runes: $state, $effect, $derived
 *
 * ### Usage:
 * ```svelte
 * <script>
 *   import { useDialog } from '@utils/use-dialog.svelte.ts';
 *   let open = $state(false);
 *   const dialog = useDialog({
 *     open: () => open,
 *     onClose: () => open = false,
 *     ariaLabel: () => title,
 *     closeOnEsc: () => true,
 *     onopen: () => console.log('opened'),
 *   });
 * </script>
 * <dialog bind:this={dialog.dialogEl} {...dialog.dialogAria} onkeydown={dialog.onKeydown}>
 *   ...
 * </dialog>
 * ```
 */

interface DialogOptions {
  /** Reactive getter for the open state */
  open: () => boolean;
  /** Called to close the dialog */
  onClose: () => void;
  /** Reactive getter for accessible label */
  ariaLabel?: () => string | undefined;
  /** Reactive getter for labelledby ID */
  ariaLabelledBy?: () => string | undefined;
  /** Reactive getter for closeOnEsc (default: true) */
  closeOnEsc?: () => boolean;
  /** Reactive getter for closeOnOuterClick (default: true) */
  closeOnOuterClick?: () => boolean;
  /** Callback when dialog opens */
  onopen?: () => void;
  /** Callback when dialog closes */
  onclose?: () => void;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialog(options: DialogOptions) {
  let dialogEl = $state<HTMLDialogElement | null>(null);
  let triggerEl: Element | null = null;

  // Open/close lifecycle — reads options reactively inside $effect
  $effect(() => {
    const isOpen = options.open();

    if (isOpen && dialogEl) {
      triggerEl = document.activeElement;
      dialogEl.showModal();
      document.body.style.overflow = "hidden";
      options.onopen?.();

      requestAnimationFrame(() => {
        const focusable = dialogEl?.querySelector<HTMLElement>(FOCUSABLE);
        if (focusable) focusable.focus();
      });
    } else if (!isOpen && triggerEl) {
      if (document.contains(triggerEl)) {
        (triggerEl as HTMLElement).focus();
      }
      triggerEl = null;
      document.body.style.overflow = "";
      options.onclose?.();
    }
  });

  function onKeydown(e: KeyboardEvent) {
    if (!options.open()) return;

    const esc = options.closeOnEsc?.() ?? true;

    if (e.key === "Escape" && esc) {
      e.preventDefault();
      options.onClose();
      return;
    }

    // Focus trapping
    if (e.key === "Tab" && dialogEl) {
      const focusable = Array.from(dialogEl.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );

      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function onBackdropClick(e: MouseEvent) {
    const outer = options.closeOnOuterClick?.() ?? true;
    if (!outer || !options.open()) return;
    if (e.target === dialogEl) {
      options.onClose();
    }
  }

  const dialogAria = $derived.by(() => {
    const props: Record<string, string> = {
      "aria-modal": "true",
      role: "dialog",
    };
    const label = options.ariaLabel?.();
    const labelledBy = options.ariaLabelledBy?.();
    if (labelledBy) {
      props["aria-labelledby"] = labelledBy;
    } else if (label) {
      props["aria-label"] = label;
    }
    return props;
  });

  return {
    dialogEl,
    get dialogAria() {
      return dialogAria;
    },
    onKeydown,
    onBackdropClick,
  };
}
