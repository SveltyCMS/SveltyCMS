/**
 * @file src/databases/auth/saml-auth.ts
 * @description Core SAML 2.0 / Enterprise SSO Integration using @boxyhq/saml-jackson.
 *
 * Features:
 * - Dynamic Jackson initialization mapping DB connection from SveltyCMS configs.
 * - IdP Connection Management.
 * - SSO Authentication logic (ACS parsing).
 * - JIT provisioning configuration handling.
 */

import { getPrivateSettingSync, getPublicSettingSync } from '@src/services/settings-service';
import { logger } from '@utils/logger';
import jackson from '@boxyhq/saml-jackson';

// Use any for Jackson instance to avoid version-specific type mismatches in build environments
let jacksonInstance: any = null;
let connectionStringCache = '';

// Derives the database connection URL for Jackson based on SveltyCMS's privateEnv.
function getJacksonDBConnection(): string {
	const config = getPrivateSettingSync('DB_TYPE')
		? {
				DB_TYPE: getPrivateSettingSync('DB_TYPE'),
				DB_USER: getPrivateSettingSync('DB_USER'),
				DB_PASSWORD: getPrivateSettingSync('DB_PASSWORD'),
				DB_HOST: getPrivateSettingSync('DB_HOST'),
				DB_PORT: getPrivateSettingSync('DB_PORT'),
				DB_NAME: getPrivateSettingSync('DB_NAME')
			}
		: null;

	if (!config || !config.DB_TYPE) {
		throw new Error('SveltyCMS private configuration is not loaded yet.');
	}

	const hasAuth = config.DB_USER && config.DB_PASSWORD;
	const authPart = hasAuth ? `${encodeURIComponent(config.DB_USER!)}:${encodeURIComponent(config.DB_PASSWORD!)}@` : '';

	switch (config.DB_TYPE) {
		case 'postgresql':
			return `postgresql://${authPart}${config.DB_HOST}:${config.DB_PORT}/${config.DB_NAME}`;
		case 'mariadb':
			return `mysql://${authPart}${config.DB_HOST}:${config.DB_PORT}/${config.DB_NAME}`;
		case 'mongodb':
			return `mongodb://${authPart}${config.DB_HOST}:${config.DB_PORT}/${config.DB_NAME}${hasAuth ? '?authSource=admin' : ''}`;
		case 'mongodb+srv':
			return `mongodb+srv://${authPart}${config.DB_HOST}/${config.DB_NAME}?retryWrites=true&w=majority`;
		// Note: SQLite isn't natively supported out of the box in the same string format by Jackson right now unless wrapping,
		// but SveltyCMS primarily uses Postgres, Mongo, and MariaDB for prod.
		default:
			throw new Error(
				`SAML Jackson database initialization failed: DB_TYPE '${config.DB_TYPE}' is currently unsupported by SAML Jackson integration.`
			);
	}
}

// Initializes and caches the SAML Jackson instance.
export async function getJackson(): Promise<any> {
	if (jacksonInstance) {
		return jacksonInstance;
	}

	logger.debug('Initializing SAML Jackson...');
	try {
		const dbUrl = getJacksonDBConnection();
		const internalUrl = getPublicSettingSync('HOST_PROD') || getPublicSettingSync('HOST_DEV') || 'http://localhost:5173';

		const opts = {
			externalUrl: internalUrl,
			samlAudience: 'sveltycms',
			samlPath: '/api/auth/saml/acs',
			db: {
				engine: 'sql', // Jackson auto-detects based on connection string for sql vs mongo
				type: getPrivateSettingSync('DB_TYPE') === 'mongodb' || getPrivateSettingSync('DB_TYPE') === 'mongodb+srv' ? 'mongo' : 'sql',
				url: dbUrl
			},
			clientSecretVerifier: 'sveltycms-jackson-secret',
			openid: {
				jwtSigningKeys: { private: 'private-key', public: 'public-key' } // Needed to boot jackson but we rely on its core SAML ACS.
			}
		};

		// If DB string changed (unlikely in prod, but possible in dev), reinit
		if (dbUrl !== connectionStringCache && jacksonInstance !== null) {
			logger.warn('Database connection string changed, re-initializing SAML Jackson');
			// In a real scenario we'd teardown, Jackson doesn't have a clean explicit teardown sync.
		}

		const instance = await jackson(opts as any);
		jacksonInstance = instance;
		connectionStringCache = dbUrl;

		logger.info('✅ SAML Jackson successfully initialized');
		return instance;
	} catch (error) {
		const errMsg = error instanceof Error ? error.message : String(error);
		logger.error(`SAML Jackson initialization error: ${errMsg}`);
		throw new Error(`Failed to boot SAML Single Sign-On module: ${errMsg}`);
	}
}

// Creates a SAML connection (useful for an admin endpoint or script).
export async function createSAMLConnection(params: any): Promise<any> {
	const j = await getJackson();
	return j.connectionAPIController.createSAMLConnection(params);
}

// Generates the redirect URL pointing to the IdP.
export async function generateSAMLAuthUrl(tenant: string, product: string): Promise<string> {
	const j = await getJackson();
	const redirect_uri = `${getPublicSettingSync('HOST_DEV') || getPublicSettingSync('HOST_PROD') || 'http://localhost:5173'}/api/auth/saml/acs`;
	const { redirect_url } = await j.oauthController.authorize({
		tenant,
		product,
		client_id: `tenant=${tenant}&product=${product}`, // Jackson defaults to this mapping
		redirect_uri,
		response_type: 'code',
		state: 'sveltycms'
	});
	return redirect_url as string;
}
