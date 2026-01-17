/**
 * @file shared/stores/src/modeStateMachine.svelte.ts
 * @description Centralized state machine for managing UI modes
 *
 * Features:
 * - Standardized mode transitions (view, edit, create, modify, media)
 * - URL/State consistency
 * - Global mode store management
 */
import { logger } from '@shared/utils/logger';
import { mode, setMode } from './collectionStore.svelte';
import { dataChangeStore } from './store.svelte';

type Mode = 'view' | 'edit' | 'create' | 'modify' | 'media';

interface ModeTransition {
	from: Mode;
	to: Mode;
	validate?: () => boolean;
	beforeTransition?: () => void | Promise<void>;
	afterTransition?: () => void | Promise<void>;
}

/**
 * Validated State Machine for UI Modes
 * Ensures transitions between View, Edit, and Create are safe and valid.
 */
class ModeStateMachine {
	// We use the existing mode store as the source of truth for now to maintain compatibility
	// In the future, this class should own the state directly.

	private transitions: ModeTransition[] = [
		{ from: 'view', to: 'create' },
		{ from: 'view', to: 'edit' },
		{ from: 'view', to: 'media' },
		{ from: 'media', to: 'view' },

		// Transitions from Edit/Create to View require valid state (e.g. no unsaved changes or explicit discard)
		// But often "discard" is the action that triggers the transition.
		// Validation here checks if we *can* transition.
		{
			from: 'create',
			to: 'view',
			validate: () => this.checkUnsavedChanges()
		},
		{
			from: 'edit',
			to: 'view',
			validate: () => this.checkUnsavedChanges()
		},

		// Mode switching
		{ from: 'create', to: 'edit' }, // e.g. after save?
		{ from: 'edit', to: 'create' } // clone?
	];

	/**
	 * Attempt to transition to a new mode.
	 * @returns true if transition successful, false if blocked/invalid.
	 */
	async transitionTo(newMode: Mode): Promise<boolean> {
		const currentMode = mode.value as Mode;

		// Idempotent check
		if (currentMode === newMode) return true;

		const transition = this.transitions.find((t) => t.from === currentMode && t.to === newMode);

		if (!transition) {
			// Allow force-reset to view from weird states, or log warning
			if (newMode === 'view') {
				logger.warn(`[ModeStateMachine] Forcing transition to 'view' from unexpected state '${currentMode}'`);
			} else {
				logger.error(`[ModeStateMachine] Invalid transition: ${currentMode} -> ${newMode}`);
				return false;
			}
		}

		if (transition?.validate && !transition.validate()) {
			logger.warn(`[ModeStateMachine] Transition blocked by validation: ${currentMode} -> ${newMode}`);
			return false;
		}

		if (transition?.beforeTransition) {
			await transition.beforeTransition();
		}

		// Perform the state change
		setMode(newMode);

		if (transition?.afterTransition) {
			await transition.afterTransition();
		}

		logger.debug(`[ModeStateMachine] Transitioned: ${currentMode} -> ${newMode}`);
		return true;
	}

	private checkUnsavedChanges() {
		// If there are changes, we technically shouldn't just "switch" mode without saving or discarding.
		// However, this validation is strict.
		// If the user clicks "Cancel", we discard changes first, THEN transition.
		// So this check is correct: if changes exist, we block.
		return !dataChangeStore.hasChanges;
	}
}

export const modeStateMachine = new ModeStateMachine();
