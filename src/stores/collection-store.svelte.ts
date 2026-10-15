/**
 * @file src/stores/collection-store.svelte.ts
 * @description
 * **Active Context Store**: Reactive state for the current collection, mode, and entry values.
 *
 * This store dictates what the user is currently looking at (View, Edit, Create) and holds the reactive transient state of any entry being modified.
 *
 * ### Responsibilities:
 * - Managing the Active Collection Schema.
 * - Mode Switching (View/Edit/Create/Media).
 * - Holding the `activeValue` (Svelte 5 $state) for forms.
 * - Guarding against redundant content structure updates (Circuit Breaker).
 * - Client-side decoration: user favorites, tag taxonomy, and pinned items
 *   (user-scoped localStorage, cross-tab sync via the `storage` event).
 */
import { browser } from "$app/env";
import type { ContentNode, Schema, StatusType, WidgetFieldPermissions } from "@src/content/types";
import { StatusTypes } from "@src/content/types";
import { updateEntryStatus } from "@src/utils/api";
import { toast } from "@src/stores/toast.svelte.ts";
import { logger } from "@utils/logger";

/** Cheap FNV-1a fingerprint — avoids JSON.stringify of large ContentNode trees (client-safe). */
function structureFingerprint(nodes: ContentNode[]): string {
  let h = 2166136261;
  for (const n of nodes) {
    const fieldCount = n.collectionDef?.fields?.length ?? 0;
    const s = `${n._id ?? ""}|${n.path ?? ""}|${n.parentId ?? ""}|${n.order ?? 0}|${n.nodeType ?? ""}|${n.name ?? ""}|${fieldCount}`;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
  }
  return (h >>> 0).toString(36);
}

// Types
export type ModeType = "view" | "edit" | "create" | "delete" | "modify" | "media";

export interface Widget {
  permissions?: Record<string, Record<string, boolean>> | WidgetFieldPermissions;
  [key: string]: Record<string, Record<string, boolean>> | WidgetFieldPermissions | unknown;
}

export const statusMap = {
  publish: "publish",
  unpublish: "unpublish",
  draft: "draft",
  archived: "archived",
} as const;

/**
 * Enterprise-level Collection Management State
 * Consolidates all collection-related reactivity into a single class.
 */
class CollectionState {
  // Record of all collections indexed by UUID (static schema tree - $state.raw eliminates proxy overhead)
  all = $state.raw<Record<string, Schema>>({});

  // Active collection being viewed or edited (immutable replacement)
  active = $state.raw<Schema | null>(null);

  // Data value of the currently active entry (e.g. form data — fine-grained reactive)
  activeValue = $state<Record<string, unknown>>({});

  // Operational mode (view, edit, etc.)
  mode = $state<ModeType>("view");

  loading = $state(false);
  error = $state<string | null>(null);

  // Miscellaneous state
  currentId = $state<string | null>(null);
  unassigned = $state<Schema>({} as Schema);
  modifyEntry = $state<(status?: keyof typeof statusMap) => Promise<void>>(() => Promise.resolve());
  targetWidget = $state<Widget>({ permissions: {} });
  contentStructure = $state.raw<ContentNode[]>([]);
  selectedEntries = $state<string[]>([]);

  // --- Derived Properties ---

  get total() {
    return Object.keys(this.all).length;
  }

  get hasSelected() {
    return this.selectedEntries.length > 0;
  }

  get activeName() {
    return this.active?.name;
  }

  // --- Status & Publishing State ---
  isStatusLoading = $state(false);
  private lastStatusToggleTime = 0;

  get isPublish(): boolean {
    if (this.activeValue?.status) {
      return this.activeValue.status === StatusTypes.publish;
    }
    const collectionStatus = this.active?.status;
    const defaultStatus = collectionStatus || StatusTypes.unpublish;
    return defaultStatus === StatusTypes.publish;
  }

  get currentStatus(): StatusType {
    if (this.activeValue?.status) {
      return this.activeValue.status as StatusType;
    }
    const collectionStatus = this.active?.status;
    return (collectionStatus || StatusTypes.unpublish) as StatusType;
  }

  getStatusForSave(): StatusType {
    return this.currentStatus;
  }

  setStatusLocal(status: StatusType): void {
    logger.debug(`[CollectionState] Setting status locally to ${status}`);
    this.setCollectionValue({
      ...this.activeValue,
      status,
    });
  }

  hasStatus(status: StatusType): boolean {
    return this.currentStatus === status;
  }

  get isScheduled(): boolean {
    return this.currentStatus === StatusTypes.schedule && !!this.activeValue?._scheduled;
  }

  async toggleStatus(newValue: boolean, componentName = "Component"): Promise<boolean> {
    if (newValue === this.isPublish) {
      logger.debug(`[CollectionState] Status already ${newValue ? "published" : "unpublished"}`);
      return true;
    }
    if (this.isStatusLoading) {
      logger.warn("[CollectionState] Status toggle already in progress");
      return false;
    }
    const now = Date.now();
    if (now - this.lastStatusToggleTime < 500) {
      logger.debug("[CollectionState] Throttling rapid status toggle");
      return false;
    }

    this.isStatusLoading = true;
    this.lastStatusToggleTime = now;

    const newStatus = newValue ? StatusTypes.publish : StatusTypes.unpublish;
    logger.debug(`[CollectionState] Toggling status to ${newStatus} (from ${componentName})`);

    try {
      if (this.activeValue?._id && this.active?._id) {
        const result = await updateEntryStatus(
          String(this.active._id),
          String(this.activeValue._id),
          newStatus,
        );

        if (result.success) {
          this.setCollectionValue({
            ...this.activeValue,
            status: newStatus,
            _scheduled: undefined,
          });
          toast.success(
            newValue ? "Entry published successfully" : "Entry unpublished successfully",
          );
          return true;
        }
        toast.error(result.error || `Failed to ${newStatus} entry`);
        return false;
      }

      this.setCollectionValue({
        ...this.activeValue,
        status: newStatus,
      });
      logger.debug(`[CollectionState] Status set to ${newStatus} (unsaved entry)`);
      return true;
    } catch (e) {
      const error = e as Error;
      toast.error(`Error updating status: ${error.message}`);
      logger.error(`[CollectionState] Error in ${componentName}:`, error);
      return false;
    } finally {
      this.isStatusLoading = false;
    }
  }

  // --- Change Tracking State ---
  hasChanges = $state(false);
  initialDataSnapshot = $state("");

  setHasChanges(v: boolean) {
    this.hasChanges = v;
  }

  setInitialSnapshot(data: Record<string, unknown>) {
    this.initialDataSnapshot = JSON.stringify(data);
    this.hasChanges = false;
  }

  compareWithCurrent(currentData: Record<string, unknown>): boolean {
    if (!this.initialDataSnapshot) return false;
    const currentSnapshot = JSON.stringify(currentData);
    const changed = currentSnapshot !== this.initialDataSnapshot;
    if (this.hasChanges !== changed) {
      this.hasChanges = changed;
    }
    return changed;
  }

  resetChanges() {
    this.hasChanges = false;
    this.initialDataSnapshot = "";
  }

  // --- Actions ---

  setCollection(newCollection: Schema | null) {
    this.active = newCollection;
  }

  setMode(newMode: ModeType) {
    logger.debug(`CollectionState: mode changed from ${this.mode} to ${newMode}`);
    this.mode = newMode;
  }

  /**
   * Safe mode transition with unsaved-change guards.
   */
  async transitionTo(newMode: ModeType): Promise<boolean> {
    const currentMode = this.mode;
    if (currentMode === newMode) return true;

    // Check unsaved changes when leaving edit/create to view
    if ((currentMode === "create" || currentMode === "edit") && newMode === "view") {
      if (this.hasChanges) {
        logger.warn(
          `[CollectionState] Transition blocked by unsaved changes: ${currentMode} -> ${newMode}`,
        );
        return false;
      }
    }

    this.setMode(newMode);
    return true;
  }

  setCollectionValue(newValue: Record<string, unknown>) {
    this.activeValue = newValue;
    // Business logic: ensure status is set if not present
    if (this.activeValue && !("status" in this.activeValue)) {
      this.activeValue.status = this.active?.status ?? "unpublish";
    }
  }

  setModifyEntry(newFn: (status?: keyof typeof statusMap) => Promise<void>) {
    this.modifyEntry = newFn;
  }

  private lastStructureHash = "";
  private pendingStructureHash: string | null = null;

  /**
   * Monotonic counter bumped on every applied structure change. Lets an async
   * consumer (e.g. the SSE-driven content refresh) detect that newer state landed
   * while its request was in flight and drop its now-stale snapshot instead of
   * overwriting the newer one. Plain number — a comparison token, not UI state.
   */
  structureRevision = 0;

  setContentStructure(newContentStructure: ContentNode[]) {
    this.pendingStructureHash = null;
    this.applyContentStructure(newContentStructure);
  }

  setDraftContentStructure(newContentStructure: ContentNode[]) {
    this.pendingStructureHash = structureFingerprint(newContentStructure);
    this.applyContentStructure(newContentStructure);
  }

  applyRemoteContentStructure(newContentStructure: ContentNode[]): boolean {
    const incomingHash = structureFingerprint(newContentStructure);
    if (this.pendingStructureHash && incomingHash !== this.pendingStructureHash) {
      logger.debug("CollectionState: ignored stale remote structure while draft is pending");
      return false;
    }
    if (incomingHash === this.pendingStructureHash) {
      this.pendingStructureHash = null;
    }
    this.applyContentStructure(newContentStructure, incomingHash);
    return true;
  }

  private applyContentStructure(newContentStructure: ContentNode[], hash?: string) {
    // Prevent redundant syncs that trigger reactivity loops
    const currentHash = hash ?? structureFingerprint(newContentStructure);
    if (currentHash === this.lastStructureHash) return;
    this.lastStructureHash = currentHash;

    this.structureRevision++;
    this.contentStructure = newContentStructure;
  }

  /**
   * Surgical patch when the active collection schema was recompiled.
   * Preserves mode / activeValue / selection (no session break).
   */
  patchActiveSchema(schema: Schema) {
    if (!schema?._id && !schema?.name) return;
    const id = String(schema._id || schema.name);
    if (this.active) {
      const activeId = String(this.active._id || this.active.name || "");
      if (activeId.toLowerCase() === id.toLowerCase() || this.active.name === schema.name) {
        this.active = { ...this.active, ...schema, fields: schema.fields ?? this.active.fields };
      }
    }
    if (schema._id) {
      this.all = { ...this.all, [String(schema._id)]: schema };
    }
  }

  setTargetWidget(newWidget: Widget) {
    this.targetWidget = newWidget;
    // Sync into active.fields so Save persists label, db_fieldName, required, icon, etc.
    const idx = (newWidget as { __fieldIndex?: number }).__fieldIndex;
    if (
      typeof idx === "number" &&
      this.active?.fields &&
      idx >= 0 &&
      idx < this.active.fields.length
    ) {
      const nextFields = [...this.active.fields];
      const existing = nextFields[idx];
      if (existing != null) {
        const merged = { ...existing, ...newWidget };
        delete (merged as Record<string, unknown>).__fieldIndex;
        nextFields[idx] = merged;
        this.active = { ...this.active, fields: nextFields };
      }
    }
  }

  // Entry selection management
  addEntry(entryId: string) {
    if (!this.selectedEntries.includes(entryId)) {
      this.selectedEntries.push(entryId);
    }
  }

  removeEntry(entryId: string) {
    const index = this.selectedEntries.indexOf(entryId);
    if (index > -1) {
      this.selectedEntries.splice(index, 1);
    }
  }

  clearSelected() {
    this.selectedEntries.length = 0;
  }
}

// Singleton instances
export const collections = new CollectionState();

export const setCollection = (v: Schema | null) => collections.setCollection(v);
export const setMode = (v: ModeType) => collections.setMode(v);
export const setCollectionValue = (v: Record<string, unknown>) => collections.setCollectionValue(v);
export const setModifyEntry = (v: (status?: keyof typeof statusMap) => Promise<void>) =>
  collections.setModifyEntry(v);
export const setContentStructure = (v: ContentNode[]) => collections.setContentStructure(v);
export const setDraftContentStructure = (v: ContentNode[]) =>
  collections.setDraftContentStructure(v);
export const applyRemoteContentStructure = (v: ContentNode[]) =>
  collections.applyRemoteContentStructure(v);
/** Current structure revision — see `CollectionState.structureRevision`. */
export const getStructureRevision = () => collections.structureRevision;
export const setTargetWidget = (v: Widget) => collections.setTargetWidget(v);
export const modeTransitionGuard = {
  setMode: (mode: ModeType) => collections.setMode(mode),
  transitionTo: (mode: ModeType) => collections.transitionTo(mode),
};

// ─── Favorites, tags & pinned items (user-scoped decoration) ────────────────

/** Deterministic WCAG 2.2 AA status-shade palette for tag colors. */
export interface TagColor {
  bg: string;
  text: string;
  border: string;
}

const TAG_PALETTES: TagColor[] = [
  {
    bg: "bg-tertiary-500/10",
    text: "text-tertiary-500 dark:text-tertiary-400",
    border: "border-tertiary-500/30",
  },
  {
    bg: "bg-primary-500/10",
    text: "text-primary-500 dark:text-primary-400",
    border: "border-primary-500/30",
  },
  {
    bg: "bg-secondary-500/10",
    text: "text-secondary-500 dark:text-secondary-400",
    border: "border-secondary-500/30",
  },
  {
    bg: "bg-warning-500/10",
    text: "text-warning-500 dark:text-warning-400",
    border: "border-warning-500/30",
  },
  {
    bg: "bg-success-500/10",
    text: "text-success-500 dark:text-success-400",
    border: "border-success-500/30",
  },
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/** Deterministic token-based color for a tag (stable across sessions and tabs). */
export function getTagColor(tag: string): TagColor {
  const index = hashString(tag.toLowerCase().trim()) % TAG_PALETTES.length;
  return TAG_PALETTES[index];
}

/** Favorites + per-node tag mapping, persisted per user in localStorage. */
class CollectionMetadataStore {
  userId = $state<string>("guest");
  favorites = $state<string[]>([]);
  tagMap = $state<Record<string, string[]>>({});
  isInitialized = $state<boolean>(false);

  constructor() {
    if (browser) {
      this.initFromStorage();
      window.addEventListener("storage", this.handleStorageEvent);
    }
  }

  setUserId(id: string | null | undefined) {
    const nextId = id ? String(id) : "guest";
    if (this.userId !== nextId) {
      this.userId = nextId;
      this.initFromStorage();
    }
  }

  private get favsStorageKey(): string {
    return `sveltycms_favs_${this.userId}`;
  }

  private get tagsStorageKey(): string {
    return `sveltycms_tags_${this.userId}`;
  }

  initFromStorage() {
    if (!browser) return;
    try {
      const favsRaw = localStorage.getItem(this.favsStorageKey);
      this.favorites = favsRaw ? JSON.parse(favsRaw) : [];
    } catch {
      this.favorites = [];
    }

    try {
      const tagsRaw = localStorage.getItem(this.tagsStorageKey);
      this.tagMap = tagsRaw ? JSON.parse(tagsRaw) : {};
    } catch {
      this.tagMap = {};
    }
    this.isInitialized = true;
  }

  private saveFavorites() {
    if (!browser) return;
    try {
      localStorage.setItem(this.favsStorageKey, JSON.stringify(this.favorites));
    } catch (e) {
      logger.error("Failed to save collection favorites:", e);
    }
  }

  private saveTags() {
    if (!browser) return;
    try {
      localStorage.setItem(this.tagsStorageKey, JSON.stringify(this.tagMap));
    } catch (e) {
      logger.error("Failed to save collection tags:", e);
    }
  }

  private handleStorageEvent = (e: StorageEvent) => {
    if (e.key === this.favsStorageKey && e.newValue) {
      try {
        this.favorites = JSON.parse(e.newValue);
      } catch {
        /* no-op */
      }
    } else if (e.key === this.tagsStorageKey && e.newValue) {
      try {
        this.tagMap = JSON.parse(e.newValue);
      } catch {
        /* no-op */
      }
    }
  };

  isFavorite(id: string): boolean {
    return this.favorites.includes(String(id));
  }

  toggleFavorite(id: string): boolean {
    const cleanId = String(id);
    const wasFavorite = this.isFavorite(cleanId);
    if (wasFavorite) {
      this.favorites = this.favorites.filter((favId) => favId !== cleanId);
    } else {
      this.favorites = [...this.favorites, cleanId];
    }
    this.saveFavorites();
    return !wasFavorite;
  }

  getTags(id: string): string[] {
    return this.tagMap[String(id)] || [];
  }

  setTags(id: string, tags: string[]) {
    const cleanId = String(id);
    const cleanedTags = Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean)));

    const next = { ...this.tagMap };
    if (cleanedTags.length > 0) {
      next[cleanId] = cleanedTags;
    } else {
      delete next[cleanId];
    }
    this.tagMap = next;
    this.saveTags();
  }

  addTag(id: string, tag: string) {
    const cleanTag = tag.trim();
    if (!cleanTag) return;
    const current = this.getTags(id);
    if (!current.includes(cleanTag)) {
      this.setTags(id, [...current, cleanTag]);
    }
  }

  removeTag(id: string, tag: string) {
    const current = this.getTags(id);
    this.setTags(
      id,
      current.filter((t) => t !== tag),
    );
  }

  getAllUniqueTags(): string[] {
    const set = new Set<string>();
    for (const tags of Object.values(this.tagMap)) {
      for (const tag of tags) {
        set.add(tag);
      }
    }
    return Array.from(set).sort();
  }
}

export const collectionMetadata = new CollectionMetadataStore();

export interface PinnedItem {
  id: string;
  name: string;
  type: "collection" | "folder";
  path: string;
  icon?: string;
}

/** Sidebar pins — persisted per browser (not per user), survives restarts. */
class PinnedStore {
  items = $state<PinnedItem[]>([]);

  constructor() {
    if (browser) {
      this.load();
    }
  }

  load() {
    try {
      const stored = localStorage.getItem("sveltycms_pinned_items");
      if (stored) {
        this.items = JSON.parse(stored);
      }
    } catch (e) {
      logger.error("Failed to load pinned items from localStorage:", e);
    }
  }

  save() {
    try {
      localStorage.setItem("sveltycms_pinned_items", JSON.stringify(this.items));
    } catch (e) {
      logger.error("Failed to save pinned items to localStorage:", e);
    }
  }

  pin(item: PinnedItem) {
    if (!this.items.some((i) => i.id === item.id)) {
      this.items.push(item);
      this.save();
    }
  }

  unpin(id: string) {
    this.items = this.items.filter((i) => i.id !== id);
    this.save();
  }

  isPinned(id: string): boolean {
    return this.items.some((i) => i.id === id);
  }

  togglePin(item: PinnedItem) {
    if (this.isPinned(item.id)) {
      this.unpin(item.id);
    } else {
      this.pin(item);
    }
  }
}

export const pinnedStore = new PinnedStore();
