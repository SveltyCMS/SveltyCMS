/**
 * Assertive ARIA live region for keyboard drag announcements (#24).
 *
 * Creates a single visually-hidden region on first use and reuses it for
 * all subsequent announces so screen readers get immediate status updates.
 *
 * @module live-region
 */
declare function ensureRegion(): HTMLElement | null;
/**
 * Announces a message to assistive technology via an assertive live region.
 * Empty strings are ignored. The region is cleared briefly before setting
 * text so repeated identical messages are still announced.
 */
export declare function announce(message: string): void;
/** Remove the live region (tests / full teardown). */
export declare function destroyLiveRegion(): void;
/** Testing helpers */
export declare const _testing: {
  LIVE_REGION_ID: string;
  ensureRegion: typeof ensureRegion;
  getRegion: () => HTMLElement | null;
};
export {};
