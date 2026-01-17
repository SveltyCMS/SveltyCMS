/**
 * @file src/hooks.server.ts
 * @description Lightweight hook middleware for the Setup Wizard.
 *
 * This pipeline is stripped down to the bare minimum required to run the
 * Setup Wizard without initializing the full CMS backend.
 *
 * It validates setup status and enforces the installation flow.
 */

import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { isSetupCompleteAsync } from '@shared/utils/setupCheck';
import { logger } from '@shared/utils/logger.server';
import { handleSetup } from './hooks/handleSetup';

// --- Import essential middleware ---
import { handleLocale } from '../../../apps/cms/src/hooks/handleLocale';
import { handleTheme } from '../../../apps/cms/src/hooks/handleTheme';
import { handleStaticAssetCaching } from '../../../apps/cms/src/hooks/handleStaticAssetCaching';
import { handleCompression } from '../../../apps/cms/src/hooks/handleCompression';

// --- MIDDLEWARE SEQUENCE ---
const middleware: Handle[] = [
	// 1. Compression
	handleCompression,

	// 2. Static assets (performance)
	handleStaticAssetCaching,

	// 3. Setup completion enforcement (The core logic for this app)
	handleSetup,

	// 4. Language preferences (i18n)
	handleLocale,

	// 5. Theme management (Dark mode)
	handleTheme
];

export const handle: Handle = sequence(...middleware);
