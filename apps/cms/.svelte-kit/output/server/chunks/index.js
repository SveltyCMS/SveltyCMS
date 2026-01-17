import { p, a, c, f, g, h, d, n, b, m, o, k, l, i, j, e } from './handleFirewall.js';
import { handleAuthorization, invalidateRolesCache, invalidateUserCountCache } from './handleAuthorization.js';
export {
	p as addSecurityHeaders,
	a as clearAllSessionCaches,
	c as clearSessionRefreshAttempt,
	f as forceSessionRotation,
	g as getSessionCacheStats,
	h as handleAuthentication,
	handleAuthorization,
	d as handleFirewall,
	n as handleLocale,
	b as handleRateLimit,
	m as handleSystemState,
	o as handleTheme,
	k as hasApplicationThreat,
	l as hasSuspiciousPattern,
	invalidateRolesCache,
	i as invalidateSessionCache,
	invalidateUserCountCache,
	j as isAdvancedBot,
	e as isLegitimateBot
};
//# sourceMappingURL=index.js.map
