/**
 * @file src/routes/(site)/checkout/+page.server.ts
 * @description Trader identity for the checkout form. The quote stays on the client.
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
      enabled: state.enabled,
      identityReady: state.identityReady,
      legal: state.legal,
      labels: {
        impressum: copy.impressum,
        privacy: copy.privacy,
        terms: copy.terms,
        withdraw: copy.withdraw,
        pay: copy.pay,
        vatIncluded: copy.vatIncluded,
        termsLabel: copy.termsLabel,
        withdrawalLabel: copy.withdrawalLabel,
        digitalLabel: copy.digitalLabel,
      },
    };
  } catch (err) {
    rethrow(err);
    logger.debug("[Commerce] Checkout legal load failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    return { enabled: false, identityReady: false, legal: null, labels: null };
  }
};
