ts

/**
 * @file src/hooks.server.ts
 * @description Hook middleware pipeline with unified metrics and automated security response
 */

import { building } from '$app/environment';
import type { Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { logger } from '@utils/logger.server';
import { metricsService } from '@src/services/MetricsService';

// --- Import middleware hooks ---
import { handleSystemState } from './hooks/handleSystemState';
import { handleSetup } from './hooks/handleSetup';
import { handleAuthentication } from './hooks/handleAuthentication';
import { handleAuthorization } from './hooks/handleAuthorization';
import { handleLocale } from './hooks/handleLocale';
import { handleTheme } from './hooks/handleTheme';
import { addSecurityHeaders } from './hooks/addSecurityHeaders';
import { handleTokenResolution } from './hooks/tokenResolution';
import { handleStaticAssetCaching } from './hooks/handleStaticAssetCaching';
import { handleRateLimit } from './hooks/handleRateLimit';
import { handleFirewall } from './hooks/handleFirewall';
import { handleApiRequests } from './hooks/handleApiRequests';
import { handleCompression } from './hooks/handleCompression';

// --- Token services ---
import { TokenRegistry } from '@src/services/token/engine';
import { getRelationTokens } from '@src/services/token/relationEngine';

// --- Server startup logic ---
if (!building) {
	// Ensure DB initializes once
	import('@src/databases/db');

	// Inject relation engine
	TokenRegistry.setRelationTokenGenerator(getRelationTokens);

	logger.info('✅ DB module loaded. System will initialize on first request.');
}

// --- Middleware sequence ---
const middleware: Handle[] = [
	// 1. Static assets (fast-path)
	handleStaticAssetCaching,

	// 2. System state gatekeeper
	handleSystemState,

	// 3. Rate limiting
	handleRateLimit,

	// 4. Firewall
	handleFirewall,

	// 5. Setup enforcement
	handleSetup,

	// 6. Locale handling
	handleLocale,

	// 7. Theme handling
	handleTheme,

	// 8. Authentication
	handleAuthentication,

	// 9. Authorization
	handleAuthorization,

	// 10. API handling
	handleApiRequests,

	// 11. Token resolution
	handleTokenResolution,

	// 12. Security headers
	addSecurityHeaders,

	// 13. Compression
	handleCompression
];

// --- Main handle export ---
export const handle: Handle = sequence(...middleware);

// --- Public utility export (SAFE) ---
export const getHealthMetrics = () => metricsService.getReport();
