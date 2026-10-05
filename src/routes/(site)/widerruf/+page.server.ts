/**
 * @file src/routes/(site)/widerruf/+page.server.ts
 * @description Labels for the two-step consumer withdrawal.
 */

import { commerceLegalFor } from "@src/plugins/commerce/storefront.server";
import { consumerCopy } from "@src/plugins/commerce/consumer-copy";
import { rethrow } from "@utils/error-handling";
import { logger } from "@utils/logger";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
  try {
    const state = await commerceLegalFor(locals.tenantId as string | null);
    const copy = consumerCopy(state.legal);
    return {
      legalName: state.legal.legalName,
      labels: {
        impressum: copy.impressum,
        privacy: copy.privacy,
        terms: copy.terms,
        withdraw: copy.withdraw,
        confirm: copy.confirmWithdrawal,
      },
    };
  } catch (err) {
    rethrow(err);
    logger.debug("[Commerce] Withdrawal page load failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return { legalName: "", labels: null };
  }
};
