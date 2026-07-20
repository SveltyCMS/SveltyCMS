/**
 * @file src/services/outbox/index.ts
 * @description Barrel exports for the Transactional Outbox pattern.
 *
 * The outbox ensures that events (webhooks, audit logs, automation triggers)
 * are emitted atomically with the database state changes that caused them.
 *
 * ### Features:
 * - transaction-aware event emission
 * - background polling with configurable interval
 * - exponential backoff for failed deliveries
 * - fail-close delivery processing
 * - tenant-scoped isolation
 */
export {
  outboxService,
  OUTBOX_COLLECTION,
  OUTBOX_MAX_ATTEMPTS,
  outboxBackoffMs,
  isOutboxEventReady,
} from "./outbox-service.ts";
export type { OutboxEvent, OutboxEventStatus, OutboxService } from "./outbox-service.ts";
