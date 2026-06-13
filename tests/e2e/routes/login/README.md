# Authentication and Login E2E Tests (`/login`)

This folder contains Playwright end-to-end tests for the authentication and registration systems, including first-user sign-up, session creation, OAuth login, and universal accessibility/RTL checks.

## Coverage Checklist

- [x] Standard email/password login
- [x] First-user registration (via invitation tokens)
- [x] OAuth signup and authentication (Google, GitHub)
- [x] Accessibility (Axe-Core, WCAG 2.2 AA / WCAG 3.0 focus traversal)
- [x] RTL directionality audit & layout mirroring
- [ ] Two-factor authentication (2FA) verification - _Gaps identified, pending integration_
- [ ] Rate limiting & account lockout - _Gaps identified, pending integration_

## Associated Tests

- [login.spec.ts](file:///D:/SveltyCMS/tests/e2e/routes/login/login.spec.ts)
- [signup.spec.ts](file:///D:/SveltyCMS/tests/e2e/routes/login/signup.spec.ts)
- [oauth.spec.ts](file:///D:/SveltyCMS/tests/e2e/routes/login/oauth.spec.ts)
- [accessibility.spec.ts](file:///D:/SveltyCMS/tests/e2e/routes/login/accessibility.spec.ts)
