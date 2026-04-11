/**
 * @file src/utils/global-search-index.ts
 * @description Global Search Index with new advanced CMS features.
 */

import ModalEditAvatar from "@src/routes/(app)/user/components/modal-edit-avatar.svelte";
import { logger } from "@utils/logger";
import { modalState } from "@utils/modal-state.svelte";
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
      "Go to System Builder": { path: "/config/collectionbuilder" },
      "Create New Collection": { path: "/config/collectionbuilder/new" },
      "Manage Field Logic": { path: "/config/collectionbuilder?tab=logic" },
    },
  },
  {
    title: "Workflow Engine",
    description: "Visual State Machine for Content Lifecycles.",
    keywords: ["workflow", "automation", "state", "approval", "publishing"],
    triggers: {
      "Go to Workflow Builder": { path: "/config/workflows" },
    },
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
    description: "Global system and plugin settings.",
    keywords: ["config", "settings", "setup"],
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
  logger.info("Global search initialized with Workflow and Batch engines.");
}
