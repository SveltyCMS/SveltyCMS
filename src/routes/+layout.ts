/**
 * @file src/routes/+layout.ts
 * @description SSR/CSR policy for the CMS.
 *
 * SSR is ON for the whole tree: the public site starter is a consumer-facing
 * frontend (real HTML for SEO, HTTP 404 for missing paths) and the admin
 * panels render safely server-side (browser-only APIs are guarded with
 * `browser`/`$effect`/`onMount`). A previous revert set `ssr = false` to keep
 * the admin an SPA, but that also turned every public 404 into a 200 client
 * shell — SvelteKit resolves the 404 error path against the ROOT layout only
 * (group overrides like `(site)/+layout.ts` are not consulted), so the
 * setting must live here.
 */
export const ssr = true;
export const prerender = false;
