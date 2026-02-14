# E2E Test Fix Report

**Date:** 2026-02-14
**Branch:** `next`
**Status:** All 3 databases passing (MongoDB, MariaDB, PostgreSQL)

## Summary

E2E tests were disabled (`if: false`) since commit `67c94ffa`. This report documents the issues found and fixed to get them passing again.

## Issues Fixed

### 1. Welcome Modal Blocking Interactions

**Problem:** Skeleton v4 Dialog/Portal rendered the welcome modal via `<Portal>`, setting `aria-hidden="true"` on background content and intercepting all pointer events. Playwright could not click any element.

**Fix:** Pre-set sessionStorage before page load to skip the modal:
```ts
await page.addInitScript(() => {
  sessionStorage.setItem('sveltycms_welcome_modal_shown', 'true');
});
```

### 2. "Connected Successfully" Strict Mode Violation

**Problem:** `getByText(/connected successfully/i)` resolved to 2 elements (alert + status display).

**Fix:** Added `.first()` to the locator.

### 3. "Next" Button Not Found

**Problem:** Button text is inside `<span class="hidden sm:inline">` paired with `<iconify-icon>`. Anchored regex `/^next$/i` failed because Playwright saw the icon as part of the text content.

**Fix (attempt 1):** `getByRole('button', { name: /next/i })` - failed due to SystemTooltip (Ark UI) creating a duplicate trigger `<button data-part="trigger">`.

**Fix (final):** `getByLabel('Next', { exact: true })` - uses the button's `aria-label` attribute, avoids tooltip trigger collision.

### 4. "Complete" Button Strict Mode Violation

**Problem:** `getByLabel(/^complete/i)` matched both the stepper indicator (`aria-label="Complete - Current step"`) and the actual button (`aria-label="Complete"`).

**Fix:** `getByLabel('Complete', { exact: true })` - exact match avoids stepper indicator.

### 5. Setup Wizard Used MongoDB-Specific Env Vars

**Problem:** Test used `MONGO_HOST`, `MONGO_PORT`, etc. which only worked for MongoDB.

**Fix:** Changed to generic `DB_TYPE`, `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` with dynamic defaults per database type.

### 6. Login Page Requires "Sign In" Click First

**Problem:** Login page starts with Sign In / Sign Up selection (`active = undefined`). The form is not visible until the user clicks "Go to Sign In". RBAC tests failed because they tried to fill the form immediately.

**Fix:** Added click on "Sign In" button before filling the login form in both `loginAsAdmin()` helper and RBAC test's `login()` function.

### 7. loginAsAdmin Redirect Pattern Mismatch

**Problem:** `waitForURL(/(Collections|admin|dashboard)/)` didn't match the actual redirect `/en/Menu/Menu`.

**Fix:** Made `waitForUrl` optional, defaulting to `not.toHaveURL(/\/login/)`.

### 8. "System Settings" Text Resolved to 3 Elements

**Problem:** Page title is "Dynamic System Settings", matching `getByText(/system settings/i)` in 3 places (heading, sr-only span, description paragraph).

**Fix:** Added `.first()`.

### 9. Admin Test URL and Button Mismatches

**Problem:** `/config/user` redirects to `/user`. Button is labeled "Email User Registration token" not "Email Token".

**Fix:** Relaxed URL pattern to `/\/user/` and button regex to `/email.*token/i`.

### 10. `__dirname` Not Defined in ESM

**Problem:** `user.spec.ts` used `__dirname` which is not available in ES modules.

**Fix:** Replaced with `fileURLToPath(import.meta.url)` + `path.dirname()`.

### 11. MariaDB/PostgreSQL E2E Jobs Missing Setup Flow

**Problem:** SQL E2E jobs pre-created config files, skipping the setup wizard. No admin user was created, causing all subsequent tests to fail.

**Fix:** Changed to same pattern as MongoDB: remove config, start server, run setup wizard via UI.

## Tests Currently Running

| Test | Status |
|------|--------|
| Setup Wizard | Passing (all 3 DBs) |
| RBAC - Admin Access | Passing (all 3 DBs) |
| RBAC - Developer | Skipped (user not created by seed) |
| RBAC - Editor | Skipped (user not created by seed) |
| Main E2E Suite | Disabled (legacy selectors need updates) |

## Remaining Work

- Fix legacy E2E test specs (login, collection-builder, collection, language, user, user-crud, signupfirstuser, oauth-signup-firstuser)
- Create developer/editor seed users to enable RBAC role tests
