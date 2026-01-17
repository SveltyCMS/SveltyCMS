import { w as i } from './DvgRl2rN.js';
const a = [
	{
		id: 'licensing',
		name: 'Licensing & Compliance',
		icon: '⚖️',
		description: 'Manage commercial licensing (BSL 1.1) and usage data settings',
		enabled: !0,
		requiresRestart: !1,
		adminOnly: !0,
		permissionId: 'config:settings:licensing',
		fields: [
			{
				key: 'LICENSE_KEY',
				label: 'Enterprise License Key',
				description: 'Required if your organization revenue exceeds $1M USD (BSL 1.1). Leave empty for free usage.',
				type: 'password',
				category: 'private',
				placeholder: 'SK-XXXX-XXXX-XXXX'
			},
			{
				key: 'SVELTY_TELEMETRY_DISABLED',
				label: 'Disable Telemetry',
				description: 'Opt-out of anonymous usage statistics (Heartbeat).',
				type: 'boolean',
				category: 'private'
			},
			{
				key: 'DO_NOT_TRACK',
				label: 'Do Not Track (Strict)',
				description: 'Enforces strict privacy mode. Disables all external calls/checks.',
				type: 'boolean',
				category: 'private'
			}
		]
	},
	{
		id: 'cache',
		name: 'Cache & Performance',
		icon: '⚡',
		description: 'Configure cache TTLs and performance optimization settings',
		enabled: !0,
		requiresRestart: !1,
		adminOnly: !0,
		permissionId: 'config:settings:cache',
		fields: [
			{
				key: 'CACHE_TTL_SCHEMA',
				label: 'Schema Cache TTL',
				description: 'Time-to-live for collection schemas and definitions (rarely change)',
				type: 'number',
				category: 'private',
				min: 1,
				max: 86400,
				unit: 'seconds'
			},
			{
				key: 'CACHE_TTL_WIDGET',
				label: 'Widget Cache TTL',
				description: 'Time-to-live for widget configurations (relatively stable)',
				type: 'number',
				category: 'private',
				min: 1,
				max: 86400,
				unit: 'seconds'
			},
			{
				key: 'CACHE_TTL_THEME',
				label: 'Theme Cache TTL',
				description: 'Time-to-live for theme configurations and assets (occasional updates)',
				type: 'number',
				category: 'private',
				min: 1,
				max: 86400,
				unit: 'seconds'
			},
			{
				key: 'CACHE_TTL_CONTENT',
				label: 'Content Cache TTL',
				description: 'Time-to-live for content entries (frequent updates)',
				type: 'number',
				category: 'private',
				min: 1,
				max: 86400,
				unit: 'seconds'
			},
			{
				key: 'CACHE_TTL_MEDIA',
				label: 'Media Cache TTL',
				description: 'Time-to-live for media metadata and references (fairly stable)',
				type: 'number',
				category: 'private',
				min: 1,
				max: 86400,
				unit: 'seconds'
			},
			{
				key: 'CACHE_TTL_SESSION',
				label: 'Session Cache TTL',
				description: 'Time-to-live for user session data (long-lived)',
				type: 'number',
				category: 'private',
				min: 1,
				max: 86400,
				unit: 'seconds'
			},
			{
				key: 'CACHE_TTL_USER',
				label: 'User Cache TTL',
				description: 'Time-to-live for user permissions (frequently checked)',
				type: 'number',
				category: 'private',
				min: 1,
				max: 86400,
				unit: 'seconds'
			},
			{
				key: 'CACHE_TTL_API',
				label: 'API Cache TTL',
				description: 'Time-to-live for API responses (moderate caching)',
				type: 'number',
				category: 'private',
				min: 1,
				max: 86400,
				unit: 'seconds'
			}
		]
	},
	{
		id: 'database',
		name: 'Database',
		icon: '🗄️',
		description: 'Database connection and configuration settings (managed in config/private.ts)',
		enabled: !1,
		requiresRestart: !0,
		adminOnly: !0,
		permissionId: 'config:settings:database',
		fields: [
			{
				key: 'DB_TYPE',
				label: 'Database Type',
				description: 'Type of database system to use',
				type: 'select',
				category: 'private',
				required: !0,
				options: [
					{ value: 'mongodb', label: 'MongoDB' },
					{ value: 'mariadb', label: 'MariaDB' }
				]
			},
			{
				key: 'DB_HOST',
				label: 'Database Host',
				description: 'Hostname or IP address of the database server',
				type: 'text',
				category: 'private',
				required: !0,
				placeholder: 'localhost'
			},
			{
				key: 'DB_PORT',
				label: 'Database Port',
				description: 'Port number for database connection',
				type: 'number',
				category: 'private',
				required: !0,
				min: 1,
				max: 65535,
				placeholder: '27017'
			},
			{
				key: 'DB_NAME',
				label: 'Database Name',
				description: 'Name of the database to connect to',
				type: 'text',
				category: 'private',
				required: !0,
				placeholder: 'sveltycms'
			},
			{
				key: 'DB_USER',
				label: 'Database Username',
				description: 'Username for database authentication (optional for some setups)',
				type: 'text',
				category: 'private',
				placeholder: 'admin'
			},
			{
				key: 'DB_PASSWORD',
				label: 'Database Password',
				description: 'Password for database authentication (optional for some setups)',
				type: 'password',
				category: 'private'
			},
			{
				key: 'DB_RETRY_ATTEMPTS',
				label: 'Retry Attempts',
				description: 'Number of connection retry attempts on failure',
				type: 'number',
				category: 'private',
				min: 1,
				max: 10,
				placeholder: '3'
			},
			{
				key: 'DB_RETRY_DELAY',
				label: 'Retry Delay',
				description: 'Delay between retry attempts in milliseconds',
				type: 'number',
				category: 'private',
				min: 100,
				max: 1e4,
				unit: 'ms',
				placeholder: '2000'
			},
			{
				key: 'DB_POOL_SIZE',
				label: 'Connection Pool Size',
				description: 'Maximum number of concurrent database connections',
				type: 'number',
				category: 'private',
				min: 1,
				max: 100,
				placeholder: '10'
			}
		]
	},
	{
		id: 'redis',
		name: 'Redis Cache',
		icon: '💾',
		description: 'Redis server configuration and cache settings (optional - no defaults, configure only if using Redis)',
		enabled: !0,
		requiresRestart: !0,
		adminOnly: !0,
		permissionId: 'config:settings:redis',
		fields: [
			{
				key: 'USE_REDIS',
				label: 'Enable Redis',
				description: 'Use Redis for caching (recommended for production)',
				type: 'boolean',
				category: 'private'
			},
			{
				key: 'REDIS_HOST',
				label: 'Redis Host',
				description: 'Hostname or IP address of Redis server (optional - no default)',
				type: 'text',
				category: 'private',
				placeholder: 'localhost'
			},
			{
				key: 'REDIS_PORT',
				label: 'Redis Port',
				description: 'Port number for Redis connection (optional - no default)',
				type: 'number',
				category: 'private',
				min: 1,
				max: 65535,
				placeholder: '6379'
			},
			{
				key: 'REDIS_PASSWORD',
				label: 'Redis Password',
				description: 'Password for Redis authentication (optional - no default)',
				type: 'password',
				category: 'private'
			}
		]
	},
	{
		id: 'email',
		name: 'Email / SMTP',
		icon: '📧',
		description: 'Email server and SMTP configuration',
		enabled: !0,
		requiresRestart: !1,
		adminOnly: !0,
		permissionId: 'config:settings:email',
		fields: [
			{
				key: 'SMTP_HOST',
				label: 'SMTP Host',
				description: 'Hostname of your SMTP mail server',
				type: 'text',
				category: 'private',
				placeholder: 'smtp.gmail.com'
			},
			{
				key: 'SMTP_PORT',
				label: 'SMTP Port',
				description: 'Port number for SMTP connection',
				type: 'number',
				category: 'private',
				min: 1,
				max: 65535,
				placeholder: '587'
			},
			{
				key: 'SMTP_USER',
				label: 'SMTP Username',
				description: 'Username for SMTP authentication',
				type: 'text',
				category: 'private',
				placeholder: 'your-email@gmail.com'
			},
			{ key: 'SMTP_PASS', label: 'SMTP Password', description: 'Password or app-specific password for SMTP', type: 'password', category: 'private' },
			{
				key: 'SMTP_MAIL_FROM',
				label: 'From Address',
				description: 'Email address shown as sender',
				type: 'text',
				category: 'private',
				placeholder: 'noreply@yoursite.com'
			},
			{
				key: 'SMTP_EMAIL',
				label: 'Reply-To Address',
				description: 'Email address for replies',
				type: 'text',
				category: 'private',
				placeholder: 'support@yoursite.com'
			}
		]
	},
	{
		id: 'security',
		name: 'Security',
		icon: '🔒',
		description: 'Security settings including JWT, encryption, and authentication',
		enabled: !0,
		requiresRestart: !0,
		adminOnly: !0,
		permissionId: 'config:settings:security',
		fields: [
			{
				key: 'JWT_SECRET_KEY',
				label: 'JWT Secret Key',
				description: 'Secret key for JSON Web Token signing (read-only, configured via environment)',
				type: 'password',
				category: 'private',
				required: !0,
				readonly: !0
			},
			{
				key: 'ENCRYPTION_KEY',
				label: 'Encryption Key',
				description: 'Key for encrypting sensitive data (min 32 characters)',
				type: 'password',
				category: 'private',
				required: !0,
				validation: (e) => (!e || typeof e != 'string' || e.length < 32 ? 'Encryption Key must be at least 32 characters long' : null)
			},
			{
				key: 'PASSWORD_LENGTH',
				label: 'Minimum Password Length',
				description: 'Minimum required length for user passwords',
				type: 'number',
				category: 'public',
				required: !0,
				min: 8,
				max: 128,
				placeholder: '8'
			}
		]
	},
	{
		id: 'oauth',
		name: 'OAuth & Social Login',
		icon: '🔐',
		description: 'Third-party authentication providers (optional - no defaults, configure only if using OAuth)',
		enabled: !0,
		requiresRestart: !1,
		adminOnly: !0,
		permissionId: 'config:settings:oauth',
		fields: [
			{
				key: 'USE_GOOGLE_OAUTH',
				label: 'Enable Google OAuth',
				description: 'Allow users to login with Google accounts',
				type: 'boolean',
				category: 'public'
			},
			{
				key: 'GOOGLE_CLIENT_ID',
				label: 'Google Client ID',
				description: 'OAuth 2.0 client ID from Google Cloud Console (optional - no default)',
				type: 'text',
				category: 'private',
				placeholder: 'xxxxx.apps.googleusercontent.com'
			},
			{
				key: 'GOOGLE_CLIENT_SECRET',
				label: 'Google Client Secret',
				description: 'OAuth 2.0 client secret from Google Cloud Console (optional - no default)',
				type: 'password',
				category: 'private'
			},
			{
				key: 'GOOGLE_API_KEY',
				label: 'Google API Key',
				description: 'API key for Google services (optional - no default)',
				type: 'password',
				category: 'private'
			}
		]
	},
	{
		id: 'media',
		name: 'Media Storage',
		icon: '🖼️',
		description: 'Media storage, processing, and upload configuration',
		enabled: !0,
		requiresRestart: !1,
		adminOnly: !0,
		permissionId: 'config:settings:media',
		fields: [
			{
				key: 'MEDIA_FOLDER',
				label: 'Media Folder Path',
				description: 'Server path where media files are stored',
				type: 'text',
				category: 'private',
				placeholder: './mediaFolder'
			},
			{
				key: 'MEDIASERVER_URL',
				label: 'Media Server URL',
				description: 'URL of separate media server (optional)',
				type: 'text',
				category: 'public',
				placeholder: 'https://cdn.yoursite.com'
			},
			{
				key: 'MAX_FILE_SIZE',
				label: 'Max File Size',
				description: 'Maximum file size for uploads in bytes',
				type: 'number',
				category: 'public',
				min: 1024,
				max: 1073741824,
				unit: 'bytes',
				placeholder: '10485760'
			},
			{
				key: 'BODY_SIZE_LIMIT',
				label: 'Body Size Limit',
				description: 'Maximum size for request body in bytes',
				type: 'number',
				category: 'public',
				min: 1024,
				max: 1073741824,
				unit: 'bytes',
				placeholder: '10485760'
			},
			{
				key: 'USE_ARCHIVE_ON_DELETE',
				label: 'Archive on Delete',
				description: 'Archive files instead of permanent deletion',
				type: 'boolean',
				category: 'public'
			}
		]
	},
	{
		id: 'languages',
		name: 'Languages & Localization',
		icon: '🌐',
		description: 'Language, locale, and internationalization settings',
		enabled: !0,
		requiresRestart: !1,
		adminOnly: !1,
		permissionId: 'config:settings:languages',
		fields: [
			{
				key: 'DEFAULT_CONTENT_LANGUAGE',
				label: 'Default Content Language',
				description: 'Default language for content creation',
				type: 'language-select',
				category: 'public',
				required: !0,
				placeholder: 'en'
			},
			{
				key: 'AVAILABLE_CONTENT_LANGUAGES',
				label: 'Available Content Languages',
				description: 'Languages available for content',
				type: 'language-multi',
				category: 'public',
				required: !0,
				placeholder: 'en,de'
			},
			{
				key: 'BASE_LOCALE',
				label: 'Base Locale',
				description: 'Default locale for the CMS interface',
				type: 'language-select',
				category: 'public',
				required: !0,
				placeholder: 'en'
			},
			{
				key: 'LOCALES',
				label: 'Available Locales',
				description: 'Locales available for the interface',
				type: 'language-multi',
				category: 'public',
				required: !0,
				placeholder: 'en,de'
			}
		]
	},
	{
		id: 'integrations',
		name: 'Third-Party Integrations',
		icon: '🧩',
		description: 'External service integrations and API tokens',
		enabled: !0,
		requiresRestart: !1,
		adminOnly: !0,
		permissionId: 'config:settings:integrations',
		fields: [
			{
				key: 'TWITCH_CLIENT_ID',
				label: 'Twitch Client ID',
				description: 'Client ID for Twitch API integration',
				type: 'text',
				category: 'private',
				placeholder: 'your_twitch_client_id'
			},
			{ key: 'TWITCH_TOKEN', label: 'Twitch Access Token', description: 'Access token for Twitch API', type: 'password', category: 'private' },
			{ key: 'TIKTOK_TOKEN', label: 'TikTok API Token', description: 'Access token for TikTok API', type: 'password', category: 'private' }
		]
	},
	{
		id: 'site',
		name: 'Site Configuration',
		icon: '🌍',
		description: 'General site settings and configuration',
		enabled: !0,
		requiresRestart: !1,
		adminOnly: !1,
		permissionId: 'config:settings:site',
		fields: [
			{
				key: 'SITE_NAME',
				label: 'Site Name',
				description: 'The public name of your website',
				type: 'text',
				category: 'public',
				required: !0,
				placeholder: 'My Awesome Site'
			},
			{
				key: 'HOST_DEV',
				label: 'Development URL',
				description: 'Development server URL',
				type: 'text',
				category: 'public',
				required: !0,
				placeholder: 'http://localhost:5173'
			},
			{
				key: 'HOST_PROD',
				label: 'Production URL',
				description: 'Production server URL',
				type: 'text',
				category: 'public',
				required: !0,
				placeholder: 'https://yoursite.com'
			},
			{
				key: 'EXTRACT_DATA_PATH',
				label: 'Data Export Path',
				description: 'File path for exported collection data',
				type: 'text',
				category: 'public',
				placeholder: './exports/data.json'
			},
			{ key: 'MULTI_TENANT', label: 'Multi-Tenant Mode', description: 'Enable multi-tenant database support', type: 'boolean', category: 'private' },
			{ key: 'DEMO', label: 'Demo Mode', description: 'Enable demo mode (restricts certain features)', type: 'boolean', category: 'public' }
		]
	},
	{
		id: 'appearance',
		name: 'Appearance & Themes',
		icon: '🎨',
		description: 'Visual appearance and seasonal themes',
		enabled: !0,
		requiresRestart: !1,
		adminOnly: !1,
		permissionId: 'config:settings:appearance',
		fields: [
			{
				key: 'SEASONS',
				label: 'Enable Seasonal Themes',
				description: 'Show seasonal decorations on login page',
				type: 'boolean',
				category: 'public'
			},
			{
				key: 'SEASON_REGION',
				label: 'Season Region',
				description: 'Geographic region for determining seasons',
				type: 'select',
				category: 'public',
				options: [
					{ value: 'Western_Europe', label: 'Western Europe' },
					{ value: 'South_Asia', label: 'South Asia' },
					{ value: 'East_Asia', label: 'East Asia' },
					{ value: 'Global', label: 'Global' }
				]
			}
		]
	},
	{
		id: 'logging',
		name: 'Logging & Monitoring',
		icon: '📊',
		description: 'Application logging and monitoring configuration',
		enabled: !0,
		requiresRestart: !1,
		adminOnly: !0,
		permissionId: 'config:settings:logging',
		fields: [
			{
				key: 'LOG_LEVELS',
				label: 'Log Levels',
				description: 'Active logging levels (none, fatal, error, warn, info, debug, trace)',
				type: 'loglevel-multi',
				category: 'public',
				required: !0,
				placeholder: 'error,warn,info'
			},
			{
				key: 'LOG_RETENTION_DAYS',
				label: 'Log Retention Days',
				description: 'Number of days to keep log files',
				type: 'number',
				category: 'public',
				min: 1,
				max: 365,
				unit: 'days',
				placeholder: '30'
			},
			{
				key: 'LOG_ROTATION_SIZE',
				label: 'Log Rotation Size',
				description: 'Maximum log file size before rotation',
				type: 'number',
				category: 'public',
				min: 1024,
				max: 104857600,
				unit: 'bytes',
				placeholder: '10485760'
			}
		]
	},
	{
		id: 'customCss',
		name: 'Custom CSS',
		icon: '💅',
		description: 'Add custom CSS to your site for advanced styling.',
		enabled: !0,
		requiresRestart: !1,
		adminOnly: !0,
		permissionId: 'config:settings:customCss',
		fields: [
			{
				key: 'CUSTOM_SITE_CSS',
				label: 'Custom Site CSS',
				description: "Enter your custom CSS here. This will be injected directly into your site's <head>.",
				type: 'textarea',
				category: 'public',
				placeholder: '/* Your custom CSS here */',
				rows: 10
			}
		]
	}
];
function r(e) {
	return a.filter((t) => t.enabled && (!t.adminOnly || e));
}
const n = i(new Set());
export { r as a, n as g };
//# sourceMappingURL=eT0aqHlv.js.map
