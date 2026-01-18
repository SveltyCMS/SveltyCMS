/**
 * @file shared/services/src/pubSub.ts
 * @description PubSub service for cross-module events
 * Global singleton PubSub instance for cross-module events
 * Note: In a clustered/serverless environment, this should be replaced with Redis PubSub
 */

import { createPubSub } from 'graphql-yoga';

export const pubSub = createPubSub<{
	contentStructureUpdated: [event: { version: number; timestamp: string; affectedCollections: string[]; changeType: string }];
	entryUpdated: [event: { collection: string; id: string; action: string; data: any; timestamp: string; user?: any }];
}>();
