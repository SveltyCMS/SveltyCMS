/**
 * @file src/stores/mode-transition-guard.svelte.ts
 * @description Single source of truth for mode changes with Svelte 5 fine-grained reactivity.
 *
 * Consolidates mode management:
 * - `setMode(mode)` — instant, no validation (GUI clicks, save/delete actions)
 * - `transitionTo(mode)` — validated (NavigationManager, programmatic transitions)
 *
 * Validation blocks edit/create → view if there are unsaved changes.
 */
import { logger } from "@utils/logger";
import { setMode as _setMode, collections } from "./collection-store.svelte";

type Mode = "view" | "edit" | "create" | "modify" | "media";

interface ModeTransition {
  afterTransition?: () => void | Promise<void>;
  beforeTransition?: () => void | Promise<void>;
  from: Mode;
  to: Mode;
  validate?: () => boolean;
}

class ModeStateMachine {
  setMode(newMode: Mode): void {
    _setMode(newMode);
  }

  private readonly transitions: ModeTransition[] = [
    { from: "view", to: "create" },
    { from: "view", to: "edit" },
    { from: "view", to: "media" },
    { from: "media", to: "view" },
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
    { from: "create", to: "edit" },
    { from: "edit", to: "create" },
  ];

  async transitionTo(newMode: Mode): Promise<boolean> {
    const currentMode = collections.mode as Mode;
    if (currentMode === newMode) return true;

    const transition = this.transitions.find((t) => t.from === currentMode && t.to === newMode);
    if (!transition) {
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

    _setMode(newMode);

    if (transition?.afterTransition) {
      await transition.afterTransition();
    }

    logger.debug(`[ModeStateMachine] Transitioned: ${currentMode} -> ${newMode}`);
    return true;
  }

  private checkUnsavedChanges() {
    return !collections.hasChanges;
  }
}

export const modeTransitionGuard = new ModeStateMachine();
