/**
 * @file src/routes/(site)/account/+layout.server.ts
 * @description Store account area requires a signed-in customer.
 */

import { redirect } from "@sveltejs/kit";
import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = async ({ locals, url }) => {
  const user = locals.user as { _id?: string; isAnonymous?: boolean; email?: string } | null;
  if (!user || user.isAnonymous) {
    throw redirect(302, `/login?redirect=${encodeURIComponent(url.pathname)}`);
  }
  return { customerId: String(user._id), email: user.email || "" };
};
