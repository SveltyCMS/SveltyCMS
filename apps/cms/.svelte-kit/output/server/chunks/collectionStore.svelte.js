import 'clsx';
import { logger } from './logger.js';
class CollectionState {
	// Record of all collections indexed by UUID
	all = {};
	// Active collection being viewed or edited
	active = null;
	// Data value of the currently active entry (e.g. form data)
	activeValue = {};
	// Operational mode (view, edit, etc.)
	mode = 'view';
	loading = false;
	error = null;
	// Miscellaneous state
	currentId = null;
	unassigned = {};
	modifyEntry = () => Promise.resolve();
	targetWidget = { permissions: {} };
	contentStructure = [];
	selectedEntries = [];
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
	setCollection(newCollection) {
		this.active = newCollection;
	}
	setMode(newMode) {
		logger.debug(`CollectionState: mode changed from ${this.mode} to ${newMode}`);
		this.mode = newMode;
	}
	setCollectionValue(newValue) {
		this.activeValue = newValue;
		if (this.activeValue && !('status' in this.activeValue)) {
			this.activeValue.status = this.active?.status ?? 'unpublish';
		}
	}
	setModifyEntry(newFn) {
		this.modifyEntry = newFn;
	}
	setContentStructure(newContentStructure) {
		this.contentStructure = newContentStructure;
	}
	setTargetWidget(newWidget) {
		this.targetWidget = newWidget;
	}
	// Entry selection management
	addEntry(entryId) {
		if (!this.selectedEntries.includes(entryId)) {
			this.selectedEntries.push(entryId);
		}
	}
	removeEntry(entryId) {
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
const collections = new CollectionState();
const collection = {
	get value() {
		return collections.active;
	},
	set value(v) {
		collections.active = v;
	}
};
const collectionValue = {
	get value() {
		return collections.activeValue;
	},
	set value(v) {
		collections.setCollectionValue(v);
	}
};
const mode = {
	get value() {
		return collections.mode;
	},
	set value(v) {
		collections.setMode(v);
	}
};
const contentStructure = {
	get value() {
		return collections.contentStructure;
	},
	set value(v) {
		collections.contentStructure = v;
	}
};
const setCollection = (v) => collections.setCollection(v);
const setMode = (v) => collections.setMode(v);
const setCollectionValue = (v) => collections.setCollectionValue(v);
const setModifyEntry = (v) => collections.setModifyEntry(v);
collections.currentId;
collections.loading;
collections.error;
const unAssigned = collections.unassigned;
collections.selectedEntries;
export {
	contentStructure as a,
	setCollectionValue as b,
	collections as c,
	setMode as d,
	collection as e,
	setModifyEntry as f,
	collectionValue as g,
	mode as m,
	setCollection as s,
	unAssigned as u
};
//# sourceMappingURL=collectionStore.svelte.js.map
