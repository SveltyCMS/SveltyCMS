/**
 * @file src/routes/(app)/config/collectionbuilder/NestedContent/types.ts
 * @description Defines the DndItem type, extending ExtendedContentNode for Svelte DND Actions.
 *
 * #Features:
 * - Adds an `id` property required by `svelte-dnd-action` for item identification.
 * - Extends with an optional `children` array to represent nesting for DND purposes.
 */

import type { ExtendedContentNode } from '@root/src/content/utils';

// DndItem extends ExtendedContentNode to add the `id` property required by `svelte-dnd-action`
// and ensures `children` are also of type DndItem for recursive operations.
export type DndItem = ExtendedContentNode & { id: string; children?: DndItem[]; isCategory?: boolean };
