<!--
 @file src/components/system/floating-nav.svelte
 @description Draggable floating action button that opens a radial navigation menu.
-->

<script lang="ts">
import { onMount, onDestroy, tick } from "svelte";
import { browser } from "$app/environment";
import { page } from "$app/state";

import SystemTooltip from "@src/components/system/system-tooltip.svelte";
import { modalState } from "@utils/modal-state.svelte";
import { ui } from "@src/stores/ui-store.svelte";
import { setMode } from "@src/stores/collection-store.svelte";
import { logger } from "@utils/logger";

import type { User } from "@src/databases/auth/types";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const BUTTON_RADIUS = 28;
const EDGE_MARGIN = 16;
const MENU_RADIUS = 168;
const DRAG_THRESHOLD = 12;

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────
interface Endpoint {
  tooltip: string;
  icon: string;
  color?: string;
  url: {
    external: boolean;
    path: string;
  };
}

// ─────────────────────────────────────────────────────────────
// Data
// ─────────────────────────────────────────────────────────────
const user = $derived(page.data.user as User | undefined);

const ALL_ENDPOINTS: Endpoint[] = [
  { tooltip: "Home", icon: "solar:home-bold", url: { external: false, path: "/" } },
  {
    tooltip: "Dashboard",
    icon: "mdi:view-dashboard",
    color: "bg-blue-500",
    url: { external: false, path: "/dashboard" },
  },
  {
    tooltip: "User Profile",
    icon: "radix-icons:avatar",
    color: "bg-orange-500",
    url: { external: false, path: "/user" },
  },
  {
    tooltip: "Collection Builder",
    icon: "fluent-mdl2:build-definition",
    color: "bg-green-500",
    url: { external: false, path: "/config/collectionbuilder" },
  },
  {
    tooltip: "GraphQL Explorer",
    icon: "teenyicons:graphql-outline",
    color: "bg-pink-500",
    url: { external: true, path: "/api/graphql" },
  },
  {
    tooltip: "System Configuration",
    icon: "mynaui:config",
    color: "bg-surface-400",
    url: { external: false, path: "/config" },
  },
  {
    tooltip: "Access Management",
    icon: "mdi:shield-account",
    color: "bg-purple-500",
    url: { external: false, path: "/config/accessManagement" },
  },
  {
    tooltip: "Marketplace",
    icon: "icon-park-outline:shopping-bag",
    color: "bg-primary-700",
    url: { external: true, path: "https://www.sveltycms.com" },
  },
];

// Filter endpoints based on user permissions
const endpoints = $derived(
  ALL_ENDPOINTS.filter((ep) => {
    if (user?.role === "admin") return true;
    // Example: hide certain routes for non-admins
    return ep.url.path !== "/collection";
  })
);

// ─────────────────────────────────────────────────────────────
// State
// ─────────────────────────────────────────────────────────────
let showMenu = $state(false);

let buttonPos = $state({ x: 0, y: 0 });
let center = $state({ x: 0, y: 0 });

// Refs
let menuItems: (HTMLAnchorElement | undefined)[] = $state([]);

// Calculated positions for radial menu
const menuItemsWithPos = $derived(
  endpoints.map((endpoint, i) => {
    const angle = ((Math.PI * 2) / endpoints.length) * (i + 1.3);
    const x = center.x + MENU_RADIUS * Math.cos(angle);
    const y = center.y + MENU_RADIUS * Math.sin(angle);
    return { ...endpoint, x, y };
  })
);

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────
function getCurrentPageKey(): string {
  return page.url.pathname.replace(/\/$/, "") || "/";
}

function loadSavedPosition() {
  if (!browser) return;

  try {
    const saved = JSON.parse(localStorage.getItem("floatingNav") || "{}");
    const pos = saved[getCurrentPageKey()];

    if (pos?.x && pos?.y) {
      buttonPos = { x: pos.x, y: pos.y };
    } else {
      // Default: bottom-right
      buttonPos = {
        x: window.innerWidth - (BUTTON_RADIUS + EDGE_MARGIN),
        y: window.innerHeight - (BUTTON_RADIUS + EDGE_MARGIN),
      };
    }
  } catch {
    buttonPos = {
      x: window.innerWidth - (BUTTON_RADIUS + EDGE_MARGIN),
      y: window.innerHeight - (BUTTON_RADIUS + EDGE_MARGIN),
    };
  }
}

function savePosition() {
  if (!browser) return;
  try {
    const saved = JSON.parse(localStorage.getItem("floatingNav") || "{}");
    saved[getCurrentPageKey()] = { x: buttonPos.x, y: buttonPos.y };
    localStorage.setItem("floatingNav", JSON.stringify(saved));
  } catch (err) {
    logger.error("Failed to save floating nav position", err);
  }
}

function vibrate(ms: number) {
  if (browser) navigator.vibrate?.(ms);
}

function closeMenu() {
  if (!showMenu) return;
  showMenu = false;
  vibrate(6);
}

async function toggleMenu() {
  if (showMenu) {
    closeMenu();
  } else {
    center = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    await tick();
    showMenu = true;
    vibrate(12);
    await tick();
    menuItems[0]?.focus();
  }
}

// ─────────────────────────────────────────────────────────────
// Drag Handler
// ─────────────────────────────────────────────────────────────
function makeDraggable(node: HTMLDivElement) {
  let isDragging = false;
  let startX = 0;
  let startY = 0;

  node.onpointerdown = (e) => {
    startX = e.clientX;
    startY = e.clientY;
    isDragging = false;
    node.setPointerCapture(e.pointerId);
  };

  node.onpointermove = (e) => {
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > DRAG_THRESHOLD) {
      isDragging = true;

      buttonPos = {
        x: e.clientX - BUTTON_RADIUS,
        y: e.clientY - BUTTON_RADIUS,
      };
    }
  };

  node.onpointerup = async (e) => {
    node.releasePointerCapture(e.pointerId);

    if (!isDragging) {
      // Click → toggle menu
      await toggleMenu();
      return;
    }

    // Snap to nearest edge
    const right = window.innerWidth - (BUTTON_RADIUS + EDGE_MARGIN);
    const bottom = window.innerHeight - (BUTTON_RADIUS + EDGE_MARGIN);

    const distances = [
      buttonPos.x,                    // left
      right - buttonPos.x,            // right
      buttonPos.y,                    // top
      bottom - buttonPos.y,           // bottom
    ];

    const closest = distances.indexOf(Math.min(...distances));

    if (closest === 0) buttonPos.x = EDGE_MARGIN;                    // left
    else if (closest === 1) buttonPos.x = right;                     // right
    else if (closest === 2) buttonPos.y = EDGE_MARGIN;               // top
    else buttonPos.y = bottom;                                       // bottom

    savePosition();
  };
}

// Keydown listener for Escape
function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Escape" && showMenu) closeMenu();
}

// ─────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────
onMount(() => {
  if (!browser) return;

  loadSavedPosition();

  window.addEventListener("resize", loadSavedPosition);
  window.addEventListener("keydown", handleKeydown);
});

onDestroy(() => {
  if (!browser) return;
  window.removeEventListener("resize", loadSavedPosition);
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<!-- Floating Button -->
<SystemTooltip title="Quick Navigation" positioning={{ placement: "top" }}>
  <div
    use:makeDraggable
    role="button"
    aria-label="Open quick navigation"
    aria-expanded={showMenu}
    tabindex="0"
    class="fixed z-[999999] flex h-14 w-14 items-center justify-center rounded-full bg-tertiary-600 shadow-lg active:scale-90 cursor-pointer touch-none"
    style="top: {buttonPos.y}px; left: {buttonPos.x}px;"
    onkeydown={(e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleMenu();
      }
    }}
  >
    <iconify-icon icon="tdesign:map-route-planning" width="34" style="color: white;"></iconify-icon>
  </div>
</SystemTooltip>

<!-- Radial Menu -->
{#if showMenu}
  <button
    onclick={closeMenu}
    class="fixed inset-0 z-[999998] bg-black/20"
    aria-label="Close navigation menu"
  ></button>

  <svg
    class="pointer-events-none fixed inset-0 z-[999999] h-full w-full"
    aria-hidden="true"
  >
    <!-- Lines from center to menu items -->
    {#each menuItemsWithPos as item}
      <line
        x1={center.x}
        y1={center.y}
        x2={item.x}
        y2={item.y}
        stroke="#da1f1f"
        stroke-width="3"
      ></line>
    {/each}
  </svg>

  <!-- Center Home Button -->
  <SystemTooltip title={endpoints[0]?.tooltip || "Home"}>
    <a
      bind:this={menuItems[0]}
      href={endpoints[0]?.url.path || "/"}
      target={endpoints[0]?.url.external ? "_blank" : undefined}
      class="fixed z-[999999] flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-tertiary-600 border-2 border-white shadow-xl"
      style="top: {center.y}px; left: {center.x}px;"
      aria-label={endpoints[0]?.tooltip || "Home"}
      onclick={() => {
        setMode("view");
        modalState.clear();
        ui.toggle("leftSidebar", "hidden");
        closeMenu();
      }}
    >
      <iconify-icon icon={endpoints[0]?.icon} width="28" style="color:white"></iconify-icon>
    </a>
  </SystemTooltip>

  <!-- Other Menu Items -->
  {#each menuItemsWithPos.slice(1) as item, i}
    <SystemTooltip title={item.tooltip}>
      <a
        bind:this={menuItems[i + 1]}
        href={item.url.path}
        target={item.url.external ? "_blank" : undefined}
        rel={item.url.external ? "noopener noreferrer" : undefined}
        class="fixed z-[999999] flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full shadow-xl hover:scale-125 active:scale-95 transition-transform {item.color || 'bg-tertiary-600'}"
        style="top: {item.y}px; left: {item.x}px;"
        aria-label={item.tooltip}
        onclick={closeMenu}
      >
        <iconify-icon icon={item.icon} width="28" style="color:white"></iconify-icon>
      </a>
    </SystemTooltip>
  {/each}
{/if}

<style>
  /* Optional: Add subtle animation for menu items if needed */
</style>
