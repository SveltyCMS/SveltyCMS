import type { ContentNode } from "@root/src/databases/dbInterface";

export type DndItem = ContentNode & { id: string; children?: DndItem[] };
