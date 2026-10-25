/**
 * @file src/routes/(app)/config/automations/automation-step-guard.ts
 * @description Pure "can I continue?" rules for the automation editor steps.
 *
 * Kept free of Svelte imports so the guard can be unit-tested and so the
 * disabled Next button always comes with a concrete explanation for new users.
 */

/** Why the current step cannot be completed yet. */
export type AutomationBlockReason = "name" | "events" | "cron" | "operations" | null;

export interface AutomationGuardInput {
  step: number;
  name: string;
  triggerType: "event" | "schedule" | "manual";
  events?: readonly string[] | null;
  cron?: string | null;
  operationCount: number;
}

/**
 * Return the first unmet requirement for `step`, or `null` when it is ready.
 *
 * Step 1 needs a name plus a trigger that can actually fire (at least one
 * event, or a cron expression). Step 2 needs at least one operation.
 */
export function automationBlockReason(input: AutomationGuardInput): AutomationBlockReason {
  if (input.step === 1) {
    if (!input.name.trim()) return "name";
    if (input.triggerType === "event" && (input.events?.length ?? 0) === 0) return "events";
    if (input.triggerType === "schedule" && !input.cron?.trim()) return "cron";
  }

  if (input.step === 2 && input.operationCount === 0) return "operations";

  return null;
}
