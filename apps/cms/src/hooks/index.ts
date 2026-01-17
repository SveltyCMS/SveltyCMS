/**
 * @files apps/cms/src/hooks/index.ts
 * @description
 * Server hooks for authentication, authorization, rate limiting, etc.
 */

export * from './handleAuthentication';
export * from './handleAuthorization';
export * from './handleRateLimit';
export * from './handleFirewall';
export * from './handleSystemState';
export * from './handleLocale';
export * from './handleTheme';
export * from './addSecurityHeaders';
