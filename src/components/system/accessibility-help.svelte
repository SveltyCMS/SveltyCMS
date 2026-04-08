<!--
 @file src/components/system/accessibility-help.svelte
 @description Modal dialog displaying keyboard shortcuts and accessibility information (WCAG 2.2 AA + ATAG 2.0).
-->

<script lang="ts">
import { onMount } from "svelte";
import type { ActionReturn } from "svelte/action";

interface Props {
  close?: () => void;
  onRequestFeedback?: () => void;
}

const { close = () => {}, onRequestFeedback }: Props = $props();

let dialogRef = $state<HTMLDivElement | null>(null);
let previousFocusElement: HTMLElement | null = $state(null);

// Keyboard shortcuts
const shortcuts = [
  { key: "?", desc: "Open this accessibility help dialog" },
  { key: "Ctrl/Cmd + S", desc: "Save current content" },
  { key: "Alt + 1–5", desc: "Jump to setup wizard steps 1–5" },
  { key: "Alt + T", desc: "Toggle between light and dark theme" },
  // General navigation
  { key: "Tab", desc: "Move focus to next interactive element" },
  { key: "Shift + Tab", desc: "Move focus to previous interactive element" },
  { key: "Enter or Space", desc: "Activate the currently focused button or control" },
  { key: "Escape", desc: "Close current dialog or cancel action" },
  { key: "Arrow Keys", desc: "Navigate within menus, lists, or grids" },
] as const;

// Focus trap action
function focusTrap(node: HTMLElement): ActionReturn {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Tab") {
      const focusable = node.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      } else if (!e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      }
    } 
    else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  node.addEventListener("keydown", handleKeyDown);

  return {
    destroy() {
      node.removeEventListener("keydown", handleKeyDown);
    }
  };
}

// Restore focus when modal closes
onMount(() => {
  previousFocusElement = document.activeElement as HTMLElement;
  dialogRef?.focus();

  return () => {
    previousFocusElement?.focus();
  };
});
</script>

<div
  bind:this={dialogRef}
  use:focusTrap
  role="dialog"
  aria-modal="true"
  aria-labelledby="a11y-title"
  aria-describedby="a11y-desc"
  tabindex="-1"
  class="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-surface-100 p-6 shadow-xl dark:bg-surface-900"
>
  <!-- Header -->
  <div class="flex items-start justify-between border-b border-surface-200 pb-5 dark:border-surface-700">
    <div class="flex items-center gap-3">
      <iconify-icon 
        icon="mdi:accessibility" 
        width="28" 
        class="text-tertiary-600 dark:text-primary-500" 
        aria-hidden="true"
      ></iconify-icon>
      <div>
        <h2 id="a11y-title" class="h2 font-bold">Accessibility Help</h2>
        <p class="text-sm text-surface-500">WCAG 2.2 AA & ATAG 2.0</p>
      </div>
    </div>

    <button
      onclick={close}
      class="btn-icon btn-icon-lg rounded-full hover:bg-surface-200 dark:hover:bg-surface-800"
      aria-label="Close accessibility help"
    >
      <iconify-icon icon="mdi:close" width="24"></iconify-icon>
    </button>
  </div>

  <div class="space-y-8 py-6">
    <!-- Introduction -->
    <section aria-labelledby="intro-heading">
      <h3 id="intro-heading" class="h4 mb-3 font-semibold">About Accessibility in SveltyCMS</h3>
      <p class="text-surface-600 dark:text-surface-400 leading-relaxed">
        SveltyCMS is built to meet <strong>WCAG 2.2 Level AA</strong> standards for the interface 
        and <strong>ATAG 2.0 Level AA</strong> as an authoring tool. This means both the CMS itself 
        and the content created with it are accessible to people with disabilities.
      </p>
    </section>

    <!-- Keyboard Shortcuts -->
    <section aria-labelledby="shortcuts-heading">
      <h3 id="shortcuts-heading" class="h4 mb-4 flex items-center gap-2 font-semibold">
        <iconify-icon icon="mdi:keyboard" width="22" aria-hidden="true"></iconify-icon>
        Keyboard Shortcuts
      </h3>

      <div class="overflow-hidden rounded-xl border border-surface-200 dark:border-surface-700">
        <table class="w-full text-sm" aria-describedby="shortcuts-desc">
          <caption id="shortcuts-desc" class="sr-only">List of keyboard shortcuts in SveltyCMS</caption>
          <thead class="bg-surface-200 dark:bg-surface-800">
            <tr>
              <th scope="col" class="px-5 py-3 text-left font-semibold">Shortcut</th>
              <th scope="col" class="px-5 py-3 text-left font-semibold">Description</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface-200 dark:divide-surface-700">
            {#each shortcuts as { key, desc }}
              <tr class="hover:bg-surface-50 dark:hover:bg-surface-800/60 transition-colors">
                <td class="px-5 py-3.5">
                  <kbd class="rounded bg-surface-300 px-2.5 py-1 font-mono text-xs dark:bg-surface-700">
                    {key}
                  </kbd>
                </td>
                <td class="px-5 py-3.5 text-surface-600 dark:text-surface-400">{desc}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <p class="mt-3 text-xs text-surface-500">
        Tip: Press <kbd class="rounded bg-surface-200 px-2 py-0.5 font-mono text-xs">?</kbd> 
        anywhere in the app to open this help dialog.
      </p>
    </section>

    <!-- ATAG Compliance -->
    <section aria-labelledby="atag-heading">
      <h3 id="atag-heading" class="h4 mb-4 flex items-center gap-2 font-semibold">
        <iconify-icon icon="mdi:shield-check" width="22" aria-hidden="true"></iconify-icon>
        ATAG 2.0 Compliance
      </h3>

      <div class="grid gap-4 sm:grid-cols-2">
        <!-- Part A -->
        <div class="rounded-2xl border border-primary-200 bg-primary-50 p-5 dark:border-primary-900 dark:bg-primary-950/40">
          <h4 class="mb-3 font-semibold text-primary-700 dark:text-primary-300">Part A: Accessible Interface</h4>
          <ul class="space-y-2 text-sm">
            <li class="flex gap-2">
              <iconify-icon icon="mdi:check-circle" class="mt-0.5 text-primary-600" width="18"></iconify-icon>
              Full keyboard navigation support
            </li>
            <li class="flex gap-2">
              <iconify-icon icon="mdi:check-circle" class="mt-0.5 text-primary-600" width="18"></iconify-icon>
              Compatible with screen readers
            </li>
            <li class="flex gap-2">
              <iconify-icon icon="mdi:check-circle" class="mt-0.5 text-primary-600" width="18"></iconify-icon>
              High color contrast ratios
            </li>
          </ul>
        </div>

        <!-- Part B -->
        <div class="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-900 dark:bg-emerald-950/40">
          <h4 class="mb-3 font-semibold text-emerald-700 dark:text-emerald-300">Part B: Accessible Content Creation</h4>
          <ul class="space-y-2 text-sm">
            <li class="flex gap-2">
              <iconify-icon icon="mdi:check-circle" class="mt-0.5 text-emerald-600" width="18"></iconify-icon>
              Enforces alt text for images
            </li>
            <li class="flex gap-2">
              <iconify-icon icon="mdi:check-circle" class="mt-0.5 text-emerald-600" width="18"></iconify-icon>
              Semantic heading structure
            </li>
            <li class="flex gap-2">
              <iconify-icon icon="mdi:check-circle" class="mt-0.5 text-emerald-600" width="18"></iconify-icon>
              Accessible table and form creation
            </li>
          </ul>
        </div>
      </div>
    </section>
  </div>

  <!-- Footer -->
  <div class="flex flex-col gap-3 border-t border-surface-200 pt-6 dark:border-surface-700 sm:flex-row sm:items-center sm:justify-between">
    <a
      href="/accessibility-statement"
      onclick={close}
      class="text-sm text-primary-600 hover:underline dark:text-primary-400"
    >
      Read full accessibility statement →
    </a>

    <div class="flex gap-3">
      <button
        onclick={() => {
          onRequestFeedback?.();
          close();
        }}
        class="btn preset-outlined flex items-center gap-2"
      >
        <iconify-icon icon="mdi:message-text" width="18"></iconify-icon>
        Give Feedback
      </button>

      <button onclick={close} class="btn preset-filled-primary">
        Close
      </button>
    </div>
  </div>
</div>
