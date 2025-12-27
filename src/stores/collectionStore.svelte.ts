import type { Schema, ContentNode } from '@src/content/types';
import { logger } from '@utils/logger';

// Types
export type ModeType = 'view' | 'edit' | 'create' | 'delete' | 'modify' | 'media';

export interface Widget {
	permissions: Record<string, Record<string, boolean>>;
	[key: string]: Record<string, Record<string, boolean>> | unknown;
}

export const statusMap = {
	publish: 'publish',
	unpublish: 'unpublish',
	draft: 'draft',
	archived: 'archived'
} as const;

/**
 * Enterprise-level Collection Management State
 * Consolidates all collection-related reactivity into a single class.
 */
class CollectionState {
	// Record of all collections indexed by UUID
	all = $state<Record<string, Schema>>({});

	// Active collection being viewed or edited
	active = $state<Schema | null>(null);

	// Data value of the currently active entry (e.g. form data)
	activeValue = $state<Record<string, unknown>>({});

	// Operational mode (view, edit, etc.)
	mode = $state<ModeType>('view');

	loading = $state(false);
	error = $state<string | null>(null);

	// Miscellaneous state
	currentId = $state<string | null>(null);
	unassigned = $state<Schema>({} as Schema);
	modifyEntry = $state<(status?: keyof typeof statusMap) => Promise<void>>(() => Promise.resolve());
	targetWidget = $state<Widget>({ permissions: {} });
	contentStructure = $state<ContentNode[]>([]);
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

	// --- Actions ---

	setCollection(newCollection: Schema | null) {
		this.active = newCollection;
	}

	setMode(newMode: ModeType) {
		logger.debug(`CollectionState: mode changed from ${this.mode} to ${newMode}`);
		this.mode = newMode;
	}

	setCollectionValue(newValue: Record<string, unknown>) {
		this.activeValue = newValue;
		// Business logic: ensure status is set if not present
		if (this.activeValue && !('status' in this.activeValue)) {
			this.activeValue.status = this.active?.status ?? 'unpublish';
		}
	}

	setModifyEntry(newFn: (status?: keyof typeof statusMap) => Promise<void>) {
		this.modifyEntry = newFn;
	}

	setContentStructure(newContentStructure: ContentNode[]) {
		this.contentStructure = newContentStructure;
	}

	setTargetWidget(newWidget: Widget) {
		this.targetWidget = newWidget;
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

	// Legacy compatibility getters/setters for smooth migration
	get current() {
		return this.active;
	}
	set current(v) {
		this.active = v;
	}
}

// Singleton instances
export const collections = new CollectionState();

/**
 * BACKWARD COMPATIBILITY LAYER
 * These exports are maintained to prevent immediate breakage.
 * TODO: Migrate all consumers to use the 'collections' singleton.
 */

// Legacy 'collections' was a record. We bridge it to collections.all
// This is tricky because it was a direct export of a $state object.
// We'll provide a Proxy or just keep the old collections record for now if needed,
// but let's try to migrate.

// Actually, let's keep the discrete exports for now but wire them to the singleton.

export const collection = {
	get value() {
		return collections.active;
	},
	set value(v) {
		collections.active = v;
	}
};

export const collectionValue = {
	get value() {
		return collections.activeValue;
	},
	set value(v) {
		collections.setCollectionValue(v);
	}
};

export const mode = {
	get value() {
		return collections.mode;
	},
	set value(v) {
		collections.setMode(v);
	}
};

export const contentStructure = {
	get value() {
		return collections.contentStructure;
	},
	set value(v) {
		collections.contentStructure = v;
	}
};

export const modifyEntry = {
	get value() {
		return collections.modifyEntry;
	},
	set value(v) {
		collections.modifyEntry = v;
	}
};

export const targetWidget = {
	get value() {
		return collections.targetWidget;
	},
	set value(v) {
		collections.targetWidget = v;
	}
};

// Action functions
export const setCollection = (v: Schema | null) => collections.setCollection(v);
export const setMode = (v: ModeType) => collections.setMode(v);
export const setCollectionValue = (v: Record<string, unknown>) => collections.setCollectionValue(v);
export const setModifyEntry = (v: (status?: keyof typeof statusMap) => Promise<void>) => collections.setModifyEntry(v);
export const setContentStructure = (v: ContentNode[]) => collections.setContentStructure(v);
export const setTargetWidget = (v: Widget) => collections.setTargetWidget(v);

// Legacy derived/utility functions
export const getTotalCollections = () => collections.total;
export const getHasSelectedEntries = () => collections.hasSelected;
export const getCurrentCollectionName = () => collections.activeName;

export const entryActions = {
	addEntry: (id: string) => collections.addEntry(id),
	removeEntry: (id: string) => collections.removeEntry(id),
	clear: () => collections.clearSelected()
};

// Direct state exports for legacy components that don't use the objects
// Note: These might lose reactivity if rebound elsewhere, but should work for direct imports.
export const currentCollectionId = collections.currentId;
export const collectionsLoading = collections.loading;
export const collectionsError = collections.error;
export const unAssigned = collections.unassigned;
export const selectedEntries = collections.selectedEntries;
