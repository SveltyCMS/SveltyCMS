/**
 * @file src/stores/mode-transition-guard.svelte.ts
 * @description Single source of truth for mode changes.
 *
 * Consolidates mode management into one place:
 * - `setMode(mode)` — instant, no validation (GUI clicks, save/delete actions)
 * - `transitionTo(mode)` — validated (NavigationManager, programmatic transitions)
 *
 * Validation blocks edit/create → view if there are unsaved changes.
 *
 * Features:
 * - Unsaved changes detection (edit/create → view blocked)
 * - beforeTransition / afterTransition hooks
 * - Graceful force-reset to 'view' from unexpected states
 */
import { logger } from "@utils/logger";
import { mode, setMode as _setMode } from "./collection-store.svelte";
import { dataChangeStore } from "./store.svelte";

type Mode = "view" | "edit" | "create" | "modify" | "media";

interface ModeTransition {
  afterTransition?: () => void | Promise<void>;
  beforeTransition?: () => void | Promise<void>;
  from: Mode;
  to: Mode;
  validate?: () => boolean;
}

/**
 * Validated State Machine for UI Modes
 * Ensures transitions between View, Edit, and Create are safe and valid.
 */
class ModeStateMachine {
  // Use collection-store.mode as the underlying reactive value.
  // All writes go through this class — setMode() for instant, transitionTo() for validated.

  /**
   * Instant mode change — no validation (GUI clicks, save/delete).
   * For safe programmatic transitions, use transitionTo().
   */
  setMode(newMode: Mode): void {
    _setMode(newMode);
  }

  private readonly transitions: ModeTransition[] = [
    { from: "view", to: "create" },
    { from: "view", to: "edit" },
    { from: "view", to: "media" },
    { from: "media", to: "view" },

    // Transitions from Edit/Create to View require valid state (e.g. no unsaved changes or explicit discard)
    // But often "discard" is the action that triggers the transition.
    // Validation here checks if we *can* transition.
    {
      from: "create",
      to: "view",
      validate: () => this.checkUnsavedChanges(),
    },
    {
      from: "edit",
      to: "view",
      validate: () => this.checkUnsavedChanges(),
    },

    // Mode switching
    { from: "create", to: "edit" }, // e.g. after save?
    { from: "edit", to: "create" }, // clone?
  ];

  /**
   * Attempt to transition to a new mode.
   * @returns true if transition successful, false if blocked/invalid.
   */
  async transitionTo(newMode: Mode): Promise<boolean> {
    const currentMode = mode.value as Mode;

    // Idempotent check
    if (currentMode === newMode) {
      return true;
    }

    const transition = this.transitions.find((t) => t.from === currentMode && t.to === newMode);

    if (!transition) {
      // Allow force-reset to view from weird states, or log warning
      if (newMode === "view") {
        logger.warn(
          `[ModeStateMachine] Forcing transition to 'view' from unexpected state '${currentMode}'`,
        );
      } else {
        logger.error(`[ModeStateMachine] Invalid transition: ${currentMode} -> ${newMode}`);
        return false;
      }
    }

    if (transition?.validate && !transition.validate()) {
      logger.warn(
        `[ModeStateMachine] Transition blocked by validation: ${currentMode} -> ${newMode}`,
      );
      return false;
    }

    if (transition?.beforeTransition) {
      await transition.beforeTransition();
    }

    // Perform the state change
    _setMode(newMode);

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

export const modeTransitionGuard = new ModeStateMachine();
