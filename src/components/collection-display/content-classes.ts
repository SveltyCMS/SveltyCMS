/**
 * @file src/components/collection-display/content-classes.ts
 * @description
 * Shared layout classes for collection content.
 *
 * The entry list and the entry editor are siblings: one replaces the other when
 * the mode flips between view and edit, so their outer inset has to be defined
 * once. Keeping the string here means both surfaces stay aligned with the page
 * title — and neither route page needs to wrap them in its own padding.
 */

/**
 * Logical start/end inset for collection content.
 *
 * Matches `AdminPageShell`'s `px-2` page gutter so switching between a config
 * page, the entry list and the entry editor never shifts the content edge.
 * Earlier `md:ps-8` pushed the table 24px further in than every other route.
 */
export const CONTENT_PADDING = "ps-2 pe-2";
