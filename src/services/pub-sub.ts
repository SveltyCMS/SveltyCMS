/**
 * @file src/services/pub-sub.ts
 * @description PubSub service for cross-module events.
 * Global singleton PubSub instance for cross-module events.
 */

import { createPubSub } from "graphql-yoga";

export const pubSub = createPubSub<{
  contentStructureUpdated: [
    event: {
      version: number;
      timestamp: string;
      affectedCollections: string[];
      changeType: string;
    },
  ];
  entryUpdated: [
    event: {
      collection: string;
      id: string;
      action: string;
      data: unknown;
      timestamp: string;
      user?: import("@src/databases/auth/types").User;
    },
  ];
  "webhook:failed": [
    event: {
      webhookId: string;
      deliveryId: string;
      error: string;
      tenantId: string;
    },
  ];
  "yjs:update": [
    event: {
      docId: string;
      update: Uint8Array;
      origin?: string;
      tenantId: string;
    },
  ];
  "yjs:sync": [
    event: {
      docId: string;
      update: Uint8Array;
      origin: string;
      tenantId: string;
    },
  ];
}>();
