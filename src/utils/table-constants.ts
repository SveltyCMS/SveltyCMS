/**
 * @file src/utils/table-constants.ts
 * @description Shared constants for entry-list table rendering and row virtualization.
 *
 * ### Features:
 * - ROW_HEIGHT: approximate pixel height per table row (used for virtual scroll calculations)
 * - VIRTUAL_BUFFER: extra rows rendered above/below the viewport for smooth scroll
 */

/** Approximate row height in pixels (44px = 40px content + 4px border) */
export const ROW_HEIGHT = 44;

/** Extra rows rendered above and below the visible viewport to prevent blank flashes during scroll */
export const VIRTUAL_BUFFER = 5;

/** Minimum page size threshold for enabling row virtualization */
export const VIRTUALIZATION_THRESHOLD = 25;
