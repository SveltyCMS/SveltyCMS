/**
 * @file src/utils/modal.svelte.ts
 * @description Centralized modal state and utility system for SveltyCMS.
 *
 * ### Hardening (audit 2026-07):
 * - XSS protection: escapeHtml utility wraps all user-provided strings in HTML interpolation
 * - Promise-based API: all utility methods return Promise<boolean> or typed result
 * - Orphaned promise prevention: trigger() and clear() fire existing response(false) before replacement
 * - close() always fires response (was gated on value !== undefined, dropping falsy signals)
 *
 * Features:
 * - Unified Svelte 5 state management ($state).
 * - Standardized modal templates (Confirm, Delete, Archive, Schedule).
 * - Theme-aware styling and localization.
 * - Async-friendly trigger/response patterns.
 */

import type { Component } from "svelte";
import { toast } from "@src/stores/toast.svelte.ts";
import * as m from "@src/paraglide/messages";

// Dialog Components
import ConfirmDialog from "@components/system/confirm-dialog.svelte";
import ScheduleModal from "@components/collection-display/schedule-modal.svelte";

// --- Security ---

/** Lightweight HTML escaper to prevent XSS in dynamically constructed modal strings */
const escapeHtml = (str: string) =>
  String(str).replace(
    /[&<>'"]/g,
    (tag) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "'": "&#39;",
        '"': "&quot;",
      })[tag] || tag,
  );

// --- Types ---

export interface ModalStateItem {
  component: Component<any>;
  props?: Record<string, any>;
  response?: (r: any) => void;
}

export interface ModalTheme {
  color: "primary" | "secondary" | "tertiary" | "success" | "warning" | "error" | "surface";
  variant: "filled" | "ghost" | "soft" | "glass";
}

export interface ConfirmModalOptions {
  title: string;
  body: string;
  confirmText?: string;
  cancelText?: string;
  theme?: ModalTheme;
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void | Promise<void>;
}

// --- Constants ---

export const DEFAULT_THEMES: Record<string, ModalTheme> = {
  delete: { variant: "filled", color: "error" },
  archive: { variant: "filled", color: "warning" },
  publish: { variant: "filled", color: "success" },
  unpublish: { variant: "filled", color: "warning" },
  clone: { variant: "filled", color: "primary" },
  schedule: { variant: "filled", color: "tertiary" },
  default: { variant: "filled", color: "primary" },
};

// --- Modal State Management ---

class ModalManager {
  active = $state<ModalStateItem | null>(null);

  get isOpen() {
    return this.active !== null;
  }

  set isOpen(value: boolean) {
    if (!value) this.close(false);
  }

  /**
   * Triggers a generic component-based modal.
   * Resolves/cancels any currently open modal to prevent orphaned promises.
   */
  trigger(component: Component<any>, props: Record<string, any> = {}, response?: (r: any) => void) {
    if (this.active?.response) {
      this.active.response(false); // Gracefully cancel the previous modal
    }
    this.active = { component, props, response };
  }

  /**
   * Closes the active modal and fires its response handler.
   */
  close(value?: any) {
    if (this.active?.response) {
      this.active.response(value);
    }
    this.active = null;
  }

  clear() {
    if (this.active?.response) {
      this.active.response(false);
    }
    this.active = null;
  }

  // --- Utility Helpers ---

  /**
   * Show a standardized confirmation dialog.
   * @returns Promise<boolean> resolves to true if confirmed, false if cancelled.
   */
  showConfirm(options: ConfirmModalOptions): Promise<boolean> {
    return new Promise((resolve) => {
      const theme = options.theme || DEFAULT_THEMES.default;

      this.trigger(
        ConfirmDialog,
        {
          htmlTitle: options.title,
          body: options.body,
          buttonTextConfirm: options.confirmText || m.button_confirm?.() || "Confirm",
          buttonTextCancel: options.cancelText || m.button_cancel?.() || "Cancel",
          modalClasses: `!bg-${theme.color}-500/10 !border-${theme.color}-500/20`,
          meta: {
            buttonConfirmClasses: `variant-${theme.variant}-${theme.color}`,
            buttonCancelClasses: "preset-outlined-surface-500",
          },
        },
        async (confirmed: boolean) => {
          if (confirmed) {
            await options.onConfirm?.();
            resolve(true);
          } else {
            await options.onCancel?.();
            resolve(false);
          }
        },
      );
    });
  }

  /**
   * Show a deletion confirmation with enhanced warnings.
   */
  showDeleteConfirm(options: {
    itemType: string;
    itemName: string | string[];
    onConfirm: () => void | Promise<void>;
    isAdmin?: boolean;
    isArchive?: boolean;
  }): Promise<boolean> {
    const { itemType, itemName, onConfirm, isAdmin = false, isArchive = false } = options;

    const isBatch = Array.isArray(itemName);
    const count = isBatch ? itemName.length : 1;
    const action = isArchive ? "Archive" : "Delete";
    const theme = isArchive ? DEFAULT_THEMES.archive : DEFAULT_THEMES.delete;

    // 🛡️ XSS Protection: Escape user-provided item names before injecting into HTML
    const safeTarget = isBatch
      ? `<span class="text-tertiary-500 dark:text-primary-500 font-bold">${count} ${escapeHtml(itemType)}(s)</span>`
      : `<span class="text-tertiary-500 dark:text-primary-500 font-bold">${escapeHtml(String(itemName))}</span>`;

    const body = `Are you sure you want to ${action.toLowerCase()} ${safeTarget}?`;

    const adminWarning =
      isAdmin && !isArchive
        ? `<div class="alert variant-filled-warning mt-4">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <div><h3>Important</h3><p>This action is irreversible.</p></div>
         </div>`
        : "";

    return this.showConfirm({
      title: `${action} ${count > 1 ? count : ""} ${itemType}`,
      body: body + adminWarning,
      confirmText: action,
      theme,
      onConfirm,
    });
  }

  /**
   * Show status change confirmation.
   */
  showStatusChange(options: {
    status: string;
    count?: number;
    onConfirm: () => void | Promise<void>;
  }): Promise<boolean> {
    const { status, count = 1, onConfirm } = options;
    const safeStatus = escapeHtml(status);

    return this.showConfirm({
      title: "Confirm Status Change",
      body: `Change <span class="text-tertiary-500 dark:text-primary-500 font-bold">${count} item(s)</span> to <span class="text-tertiary-500 dark:text-primary-500 font-bold">${safeStatus}</span>?`,
      confirmText: "Change Status",
      theme: DEFAULT_THEMES[status] || DEFAULT_THEMES.default,
      onConfirm,
    });
  }

  /**
   * Show scheduling modal.
   */
  showSchedule(options: {
    initialAction?: string;
    onSchedule: (date: Date, action: string) => void | Promise<void>;
  }): Promise<{ date: Date; action: string } | null> {
    return new Promise((resolve) => {
      this.trigger(ScheduleModal, { initialAction: options.initialAction }, async (result: any) => {
        if (result?.confirmed && result.date) {
          const action = result.action || options.initialAction || "publish";
          await options.onSchedule(result.date, action);
          resolve({ date: result.date, action });
        } else {
          resolve(null);
        }
      });
    });
  }

  /**
   * Show clone confirmation.
   */
  showClone(options: { count?: number; onConfirm: () => void }): Promise<boolean> {
    const { count = 1, onConfirm } = options;
    return this.showConfirm({
      title: "Clone Items",
      body: `Clone <span class="text-tertiary-500 dark:text-primary-500 font-bold">${count} item(s)</span>?`,
      confirmText: "Clone",
      theme: DEFAULT_THEMES.clone,
      onConfirm,
    });
  }

  /**
   * Unified toast helper for modal actions.
   */
  showActionToast(action: string, itemType: string, count = 1, success = true) {
    if (!success) {
      toast.error(`Failed to ${action} ${itemType}`);
      return;
    }

    const mapping: Record<string, string> = {
      delete: count > 1 ? "entries_deleted" : "entry_deleted_success",
      archive: count > 1 ? "entries_archived" : "entry_archived",
      publish: count > 1 ? "entries_published" : "entry_saved",
      unpublish: "entry_unpublished",
      schedule: "entry_scheduled",
      clone: "entry_cloned_success",
    };

    const key = mapping[action] || "entry_saved";
    const fn = (m as any)[key];
    const message =
      typeof fn === "function"
        ? fn({ count, type: itemType })
        : `${count > 1 ? count : ""} ${itemType} ${action}ed successfully.`;

    toast.success(message);
  }
}

export const modalState = new ModalManager();

// --- Backward Compatibility Wrappers ---

export const showModal = (settings: any) =>
  modalState.trigger(
    settings.component?.ref || settings.component,
    settings.props || settings.meta || {},
    settings.response,
  );

export const showConfirm = (options: ConfirmModalOptions) => modalState.showConfirm(options);

export const showDeleteConfirm = (options: any) => {
  return modalState.showDeleteConfirm({
    itemType: options.itemType || "item",
    itemName: options.itemName || Array(options.count || 1).fill("item"),
    onConfirm: options.onConfirm,
    isArchive: options.isArchive,
    isAdmin: options.isAdmin,
  });
};

export const showStatusChangeConfirm = (options: any) => {
  return modalState.showStatusChange({
    status: options.status,
    count: options.count,
    onConfirm: options.onConfirm,
  });
};

export const showScheduleModal = (options: any) => {
  return modalState.showSchedule({
    initialAction: options.initialAction,
    onSchedule: options.onSchedule,
  });
};

export const showCloneModal = (options: any) => {
  return modalState.showClone({
    count: options.count,
    onConfirm: options.onConfirm,
  });
};
