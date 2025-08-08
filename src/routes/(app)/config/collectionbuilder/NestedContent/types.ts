/**
 * @file src/routes/(app)/config/collectionbuilder/NestedContent/types.ts
 * @description Defines the DndItem type, extending NestedContentNode for Svelte DND Actions.
 *
 * #Features:
 * - Adds an `id` property required by `svelte-dnd-action` for item identification.
 * - Extends with an optional `children` array to represent nesting for DND purposes.
 */

import type { NestedContentNode } from '@root/src/databases/dbInterface';

// DndItem extends NestedContentNode to add the `id` property required by `svelte-dnd-action`
// and ensures `children` are also of type DndItem for recursive operations.
export type DndItem = NestedContentNode & { id: string; children?: DndItem[]; isCategory?: boolean };
