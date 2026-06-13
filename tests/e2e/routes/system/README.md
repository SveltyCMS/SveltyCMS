# System Configuration and Management E2E Tests

This folder contains Playwright end-to-end tests for global configurations, localization/i18n, granular permissions, and Role-Based Access Control (RBAC).

## Coverage Checklist

- [x] Global system settings editing
- [x] Multilingual / i18n localization transitions
- [x] User role permissions editing (admin panel)
- [x] Role-Based Access Control validation for admin/editor/guest actions
- [ ] Database backup and restore operations - _Gaps identified, pending integration_

## Associated Tests

- [settings.spec.ts](file:///D:/SveltyCMS/tests/e2e/routes/system/settings.spec.ts)
- [permissions.spec.ts](file:///D:/SveltyCMS/tests/e2e/routes/system/permissions.spec.ts)
- [rbac.spec.ts](file:///D:/SveltyCMS/tests/e2e/routes/system/rbac.spec.ts)
- [language.spec.ts](file:///D:/SveltyCMS/tests/e2e/routes/system/language.spec.ts)
