import type { NestedContentNode } from '@root/src/databases/dbInterface';

export type DndItem = NestedContentNode & { id: string; children?: DndItem[] };
