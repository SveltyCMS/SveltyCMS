/**
 * @file src/utils/global-search-index.ts
 * @description
 * Global Search Index for managing searchable CMS content.
 *
 * Features:
 * - **Local State**: Maintains the index in a reactive writable store.
 *
 * ### Refactoring Note:
 * This currently uses a client-side `writable` store which is suitable for small-to-medium datasets.
 * **Technical Debt**: If server-side search is implemented, this module must be refactored to support
 * asynchronous remote indexing and pagination to maintain "sub-millisecond" goals at enterprise scale.
 */

import ModalEditAvatar from "@src/routes/(app)/user/components/modal-edit-avatar.svelte";
import { logger } from "@utils/logger";
import { modalState } from "@utils/modal.svelte";
import { writable } from "svelte/store";

export const isSearchVisible = writable(false);
export const triggerActionStore = writable<(() => void | Promise<void>)[]>([]);

export interface SearchData {
  description: string;
  keywords: string[];
  title: string;
  triggers: {
    [title: string]: {
      path: string;
      action?: (() => void | Promise<void>)[];
    };
  };
}

export const globalSearchIndex = writable<SearchData[]>([
  {
    title: "Home",
    description: "System Overview and Activity.",
    keywords: ["home", "dashboard"],
    triggers: { "Go to Home Page": { path: "/" } },
  },
  {
    title: "Media Gallery",
    description: "DAM Engine with AI Tagging & Batch Editing.",
    keywords: ["media", "gallery", "images", "batch", "processing", "transcode"],
    triggers: {
      "Go to Media Gallery": { path: "/mediagallery" },
      "Batch Image Processor": { path: "/mediagallery?mode=batch" },
      "Video Transcoding Hub": { path: "/mediagallery?mode=transcode" },
    },
  },
  {
    title: "Collection Builder",
    description: "Build schemas with Visual Logic and BuzzForms.",
    keywords: ["builder", "collection", "logic", "conditional", "schema"],
    triggers: {
      "Go to Collection Builder": { path: "/config/collectionbuilder" },
      "Create New Collection": { path: "/config/collectionbuilder/new" },
      "Manage Field Logic": { path: "/config/collectionbuilder?tab=logic" },
    },
  },
  {
    title: "System Settings",
    description: "Database and infrastructure configuration — extensible via plugins.",
    keywords: ["settings", "config", "smtp", "email", "site", "cache", "security"],
    triggers: { "Go to System Settings": { path: "/config/system-settings" } },
  },
  {
    title: "System Monitor",
    description: "Health dashboard, audit log, and plugin status overview.",
    keywords: ["monitor", "health", "audit", "status", "logs"],
    triggers: { "Go to System Monitor": { path: "/config/monitor" } },
  },
  {
    title: "Access Management",
    description: "Users, roles, permissions, and website tokens.",
    keywords: ["access", "users", "roles", "permissions", "tokens", "rbac"],
    triggers: {
      "Go to Access Management": { path: "/config/access-management" },
    },
  },
  {
    title: "Extensions",
    description: "Plugins, widgets, themes, and marketplace.",
    keywords: ["extensions", "plugins", "widgets", "themes", "marketplace"],
    triggers: { "Go to Extensions": { path: "/config/extensions" } },
  },
  {
    title: "Automations",
    description: "Event-driven workflow automations.",
    keywords: ["automation", "workflow", "trigger", "action", "event"],
    triggers: { "Go to Automations": { path: "/config/automations" } },
  },
  {
    title: "Background Queue",
    description: "Monitor background jobs and retry failed tasks.",
    keywords: ["queue", "jobs", "tasks", "background", "retry"],
    triggers: { "Go to Background Queue": { path: "/config/queue" } },
  },
  {
    title: "Data Sync",
    description: "Import content from external platforms and sync config to filesystem.",
    keywords: ["sync", "import", "export", "migrate", "config"],
    triggers: {
      "Go to Data Sync": { path: "/config/sync" },
      "Smart Importer": { path: "/config/importer" },
    },
  },
  {
    title: "Webhooks",
    description: "Outgoing HTTP callbacks on content events.",
    keywords: ["webhook", "callback", "http", "event", "integration"],
    triggers: { "Go to Webhooks": { path: "/config/webhooks" } },
  },
  {
    title: "Redirects",
    description: "301/302 redirect rules with regex support.",
    keywords: ["redirect", "seo", "301", "302", "regex"],
    triggers: { "Go to Redirects": { path: "/config/redirects" } },
  },
  {
    title: "Trash",
    description: "Recover or permanently delete soft-deleted content.",
    keywords: ["trash", "delete", "recover", "restore", "soft-delete"],
    triggers: { "Go to Trash": { path: "/config/trash" } },
  },
  {
    title: "User Profile",
    description: "Account and Security settings.",
    keywords: ["user", "avatar", "profile", "security"],
    triggers: {
      "Show User Profile": { path: "/user" },
      "Edit Avatar": {
        path: "/user",
        action: [() => modalState.trigger(ModalEditAvatar, { title: "Edit Avatar" })],
      },
    },
  },
  {
    title: "System Dashboard",
    description: "Global analytics and health.",
    keywords: ["dashboard", "analytics", "health"],
    triggers: { "Go to Dashboard": { path: "/dashboard" } },
  },
  {
    title: "Configuration",
    description: "System configuration overview and navigation.",
    keywords: ["config", "settings", "setup", "administration"],
    triggers: { "Go to Configuration": { path: "/config" } },
  },
]);

export function addToglobalSearchIndex(newItem: SearchData) {
  globalSearchIndex.update((currentIndex) => [...currentIndex, newItem]);
}

export function searchGlobalIndex(query: string): SearchData[] {
  let results: SearchData[] = [];
  globalSearchIndex.subscribe((index) => {
    const q = query.toLowerCase();
    results = index.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.keywords.some((k) => k.toLowerCase().includes(q)),
    );
  })();
  return results;
}

export function initializeGlobalSearch() {
  logger.info("Global search initialized with full config index.");
}
