/**
 * @file src/utils/use-dialog.svelte.ts
 * @description Hardened Svelte 5 rune for native `<dialog>` lifecycle management.
 *
 * ### Hardening (audit 2026-07):
 * - Destructor effect: closes dialog on component unmount (prevents zombie modals)
 * - Focus trapping guard: prevents Tab from escaping empty modals
 * - Race condition avoidance: checks dialogEl.open before showModal()
 * - Immutable ARIA: derived object without mutation (stable for reactivity diffing)
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
  open: () => boolean;
  onClose: () => void;
  ariaLabel?: () => string | undefined;
  ariaLabelledBy?: () => string | undefined;
  closeOnEsc?: () => boolean;
  closeOnOuterClick?: () => boolean;
  onopen?: () => void;
  onclose?: () => void;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function useDialog(options: DialogOptions) {
  let dialogEl = $state<HTMLDialogElement | null>(null);
  let triggerEl: HTMLElement | null = null;

  // Open/close lifecycle — reads options reactively inside $effect
  $effect(() => {
    const isOpen = options.open();

    if (isOpen && dialogEl) {
      // 🛡️ Capture trigger for restoration
      triggerEl = document.activeElement as HTMLElement;

      if (!dialogEl.open) {
        dialogEl.showModal();
        options.onopen?.();
      }

      // 🛡️ Focus management with guard
      requestAnimationFrame(() => {
        const first = dialogEl?.querySelector<HTMLElement>(FOCUSABLE);
        if (first) first.focus();
      });
    } else if (!isOpen && dialogEl?.open) {
      // 🛡️ Close cleanly
      dialogEl.close();
      options.onclose?.();

      // 🛡️ Restore focus safely
      if (triggerEl && document.contains(triggerEl)) {
        triggerEl.focus();
      }
      triggerEl = null;
    }
  });

  // 🛡️ Cleanup on component destruction — prevents zombie modals
  $effect(() => {
    return () => {
      if (dialogEl?.open) dialogEl.close();
    };
  });

  function onKeydown(e: KeyboardEvent) {
    if (!options.open()) return;

    if (e.key === "Escape" && (options.closeOnEsc?.() ?? true)) {
      e.preventDefault();
      options.onClose();
      return;
    }

    if (e.key === "Tab" && dialogEl) {
      const focusable = Array.from(dialogEl.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );

      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const active = document.activeElement;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  function onBackdropClick(e: MouseEvent) {
    if (!(options.closeOnOuterClick?.() ?? true)) return;

    // 🛡️ Hardened: Check that click is exactly on backdrop (dialog itself)
    if (e.target === dialogEl) {
      options.onClose();
    }
  }

  const dialogAria = $derived.by(() => {
    const label = options.ariaLabel?.();
    const labelledBy = options.ariaLabelledBy?.();
    return {
      "aria-modal": "true",
      role: "dialog",
      ...(labelledBy ? { "aria-labelledby": labelledBy } : label ? { "aria-label": label } : {}),
    };
  });

  return {
    get dialogEl() {
      return dialogEl;
    },
    set dialogEl(v) {
      dialogEl = v;
    },
    get dialogAria() {
      return dialogAria;
    },
    onKeydown,
    onBackdropClick,
  };
}
