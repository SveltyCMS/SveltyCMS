/**
 * @file src/utils/server/deferred-elements.ts
 * @description Deferred element callback registry for SSR hydration batching.
 *
 * Accumulates (collection, id, callback) triples during SSR,
 * then resolves all via `getAll()` in a single DB batch.
 *
 * Planned: wire to SSR hydration pipeline for batch DB reads.
 */

interface ElementStore {
  [key: string]: {
    id: string;
    callback: (data: unknown) => void;
  }[];
}

export const get_elements_by_id = {
  store: {} as ElementStore,

  add(collection: string, id: string, callback: (data: unknown) => void) {
    if (!this.store[collection]) this.store[collection] = [];
    this.store[collection].push({ id, callback });
  },

  async getAll(dbAdapter: { get: (id: string) => Promise<unknown> }) {
    for (const collection in this.store) {
      if (!Object.hasOwn(this.store, collection)) continue;
      for (const item of this.store[collection]) {
        const data = await dbAdapter.get(item.id);
        item.callback(data);
      }
    }
  },
};
