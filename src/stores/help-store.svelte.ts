/**
 * @file src/stores/help-store.svelte.ts
 * @description Contextual help store for author briefs.
 * Provides reactive state for the help panel, current field context,
 * and authored guidance content.
 *
 * ### Features:
 * - helpPanel visibility toggle
 * - currentField tracking for context-sensitive help
 * - authored briefs support (rich text guidance per field/schema)
 * - role-based help visibility
 */

import { SvelteMap } from "svelte/reactivity";

interface HelpContext {
  schemaId?: string;
  fieldName?: string;
  widgetType?: string;
}

interface AuthoredBrief {
  id: string;
  title: string;
  content: string; // Markdown/rich text
  targetField?: string;
  targetSchema?: string;
  roles?: string[]; // Role-based visibility
}

function createHelpStore() {
  let helpPanelOpen = $state(false);
  let currentContext = $state<HelpContext>({});
  let authoredBriefs = $state<SvelteMap<string, AuthoredBrief>>(new SvelteMap());
  let beginnerMode = $state(false);

  return {
    get helpPanelOpen() {
      return helpPanelOpen;
    },
    set helpPanelOpen(v: boolean) {
      helpPanelOpen = v;
    },

    get currentContext() {
      return currentContext;
    },

    get beginnerMode() {
      return beginnerMode;
    },
    set beginnerMode(v: boolean) {
      beginnerMode = v;
    },

    toggleHelpPanel() {
      helpPanelOpen = !helpPanelOpen;
    },

    setFieldContext(schemaId: string, fieldName: string, widgetType?: string) {
      currentContext = { schemaId, fieldName, widgetType };
    },

    clearFieldContext() {
      currentContext = {};
    },

    registerBrief(brief: AuthoredBrief) {
      authoredBriefs.set(brief.id, brief);
    },

    getCurrentBrief(): AuthoredBrief | undefined {
      if (!currentContext.fieldName) return undefined;
      // Look for exact field match first, then schema-level
      for (const brief of authoredBriefs.values()) {
        if (
          brief.targetField === currentContext.fieldName &&
          brief.targetSchema === currentContext.schemaId
        ) {
          return brief;
        }
      }
      return undefined;
    },
  };
}

export const helpStore = createHelpStore();
