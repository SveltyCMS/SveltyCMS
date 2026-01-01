/**
 * @file src/stores/activeInputStore.svelte.ts
 * @description Global singleton for the currently active token input using Svelte 5 runes.
 *
 * Features:
 * - Reactive tracking of focused input (element + metadata)
 * - Class-based singleton pattern
 * - Type-safe interface for token insertion
 */

export interface ActiveTokenInput {
	/** The DOM input/textarea element */
	element: HTMLInputElement | HTMLTextAreaElement | null;
	/** Field metadata for context (e.g., token picker UI) */
	field: {
		name: string;
		label?: string;
		collection?: string;
		[key: string]: any;
	};
	/** Optional custom insertion handler (e.g., for rich text editors) */
	onInsert?: (token: string) => void;
}

class ActiveInputState {
	#current = $state<ActiveTokenInput | null>(null);

	/** The currently active input metadata */
	get current() {
		return this.#current;
	}

	/** Sets the active input state */
	set(input: ActiveTokenInput | null) {
		this.#current = input;
	}

	/** Clears the active input and closes the picker */
	clear() {
		this.#current = null;
	}
}

/**
 * Global singleton instance for managing focus-driven token input targets.
 * Use this to set which input should receive tokens from the TokenPicker.
 */
export const activeInput = new ActiveInputState();
export const activeInputStore = activeInput;
