/**
 * @file src/routes/(site)/legal/[page]/+page.server.ts
 * @description Impressum, privacy, and terms drawn from the Commerce trader settings.
 */

import { raise } from "@utils/error-handling";
import { commerceLegalFor } from "@src/plugins/commerce/storefront.server";
import { consumerCopy } from "@src/plugins/commerce/consumer-copy";
import type { PageServerLoad } from "./$types";

const PAGES = new Set(["impressum", "privacy", "terms"]);

export const load: PageServerLoad = async ({ locals, params }) => {
  if (!PAGES.has(params.page)) raise(404, "Page not found");
  const state = await commerceLegalFor(locals.tenantId as string | null);
  const copy = consumerCopy(state.legal);
  return {
    page: params.page,
    enabled: state.enabled,
    legal: state.legal,
    labels: {
      impressum: copy.impressum,
      privacy: copy.privacy,
      terms: copy.terms,
      withdraw: copy.withdraw,
    },
  };
};
