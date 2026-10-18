/**
 * @file src/plugins/cookie-consent/consent-store.svelte.ts
 * @description Plugin store for managing user consent preferences (GDPR).
 * Uses Svelte 5 runes for fine-grained reactivity.
 */
import { logger } from "@utils/logger";
import { browser } from "$app/env";
import { fetchApi } from "@utils/api";
import { nowISODateString } from "@utils/date";

export type ConsentCategory = "necessary" | "analytics" | "marketing";

export interface ConsentState {
  analytics: boolean;
  marketing: boolean;
  necessary: boolean; // Always true
  responded: boolean; // True if user has made a choice (accepted/rejected/custom)
}

const STORAGE_KEY = "sveltycms_consent";

function createConsentStore() {
  // Initialize with defaults
  const state = $state<ConsentState>({
    necessary: true,
    analytics: false,
    marketing: false,
    responded: false,
  });

  // Load from localStorage on client-side mount
  if (browser) {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        Object.assign(state, parsed, { necessary: true }); // Ensure necessary is always true
      } catch (e) {
        logger.error("Failed to parse consent cookie", e);
      }
    }
  }

  function save() {
    if (browser) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }

  function logConsentToServer() {
    if (!browser) return;
    try {
      let consentId = localStorage.getItem("sveltycms_consent_id");
      if (!consentId) {
        consentId =
          typeof globalThis.crypto?.randomUUID === "function"
            ? globalThis.crypto.randomUUID()
            : `cid_${Date.now()}`;
        localStorage.setItem("sveltycms_consent_id", consentId);
      }
      void fetchApi("/api/plugins/cookie-consent/consent", {
        method: "POST",
        body: JSON.stringify({
          consentId,
          categories: {
            necessary: true,
            analytics: state.analytics,
            marketing: state.marketing,
          },
          acceptedAt: nowISODateString(),
          origin: window.location.origin,
          userAgent: navigator.userAgent,
        }),
      }).catch((err) => {
        logger.debug("[ConsentStore] Non-blocking consent log error:", err);
      });
    } catch {
      // Fire and forget
    }
  }

  return {
    get necessary() {
      return state.necessary;
    },
    get analytics() {
      return state.analytics;
    },
    get marketing() {
      return state.marketing;
    },
    get responded() {
      return state.responded;
    },

    acceptAll: () => {
      state.analytics = true;
      state.marketing = true;
      state.responded = true;
      save();
      logConsentToServer();
    },

    rejectAll: () => {
      state.analytics = false;
      state.marketing = false;
      state.responded = true;
      save();
      logConsentToServer();
    },

    update: (preferences: Partial<ConsentState>) => {
      if (preferences.analytics !== undefined) {
        state.analytics = preferences.analytics;
      }
      if (preferences.marketing !== undefined) {
        state.marketing = preferences.marketing;
      }
      state.responded = true;
      save();
      logConsentToServer();
    },

    reset: () => {
      state.analytics = false;
      state.marketing = false;
      state.responded = false;
      if (browser) {
        localStorage.removeItem(STORAGE_KEY);
      }
    },
  };
}

export const consentStore = createConsentStore();
