// tests/bun/mocks/setup.ts
// Test setup file for Bun tests - Mocks for SveltyCMS environment
/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-expect-error - Bun types are not available in TypeScript
import { mock } from 'bun:test';

// =============================================================================
// 1. SVELTEKIT ENVIRONMENT MOCKS
// =============================================================================

mock.module('$app/environment', () => ({
	dev: true,
	browser: true,
	building: false,
	version: '1.0.0-test'
}));

mock.module('$app/stores', () => ({
	page: {
		subscribe: (fn: any) => fn({ url: { pathname: '/test' }, params: {}, route: { id: null } })
	},
	navigating: {
		subscribe: (fn: any) => fn(null)
	},
	updated: {
		subscribe: (fn: any) => fn(false),
		check: () => Promise.resolve(false)
	}
}));

// =============================================================================
// 2. ENVIRONMENT CONFIGURATION MOCKS
// =============================================================================

(globalThis as any).publicEnv = {
	DEFAULT_CONTENT_LANGUAGE: 'en',
	AVAILABLE_CONTENT_LANGUAGES: ['en', 'de', 'fr'],
	HOST_DEV: 'localhost:5173',
	HOST_PROD: 'example.com',
	SITE_NAME: 'SveltyCMS',
	PASSWORD_LENGTH: 8,
	BASE_LOCALE: 'en',
	LOCALES: ['en', 'de', 'fr']
};

(globalThis as any).privateEnv = {
	DB_TYPE: 'mongodb',
	DB_HOST: 'localhost',
	DB_PORT: 27017,
	DB_NAME: 'sveltycms_test',
	DB_USER: 'test',
	DB_PASSWORD: 'test',
	JWT_SECRET_KEY: 'test-secret-key-for-testing-only',
	ENCRYPTION_KEY: 'test-encryption-key-32-bytes!!'
};

// =============================================================================
// 3. SVELTE 5 RUNES MOCKS
// =============================================================================

(globalThis as any).$state = (initialValue: any) => initialValue;
(globalThis as any).$derived = (fn: any) => (typeof fn === 'function' ? fn() : fn);
(globalThis as any).$effect = (fn: any) => {
	if (typeof fn === 'function') fn();
};

// =============================================================================
// 4. STORE MOCKS
// =============================================================================

mock.module('@src/stores/globalSettings', () => ({
	publicEnv: (globalThis as any).publicEnv,
	privateEnv: (globalThis as any).privateEnv
}));

mock.module('@src/stores/globalSettings.svelte.ts', () => ({
	publicEnv: (globalThis as any).publicEnv,
	privateEnv: (globalThis as any).privateEnv,
	initPublicEnv: () => {},
	initPrivateEnv: () => {}
}));

// Mock setup wizard store
mock.module('@src/stores/setupStore.svelte', () => ({
	setupStore: {
		wizard: {
			currentStep: 0,
			highestStepReached: 0,
			dbTestPassed: false,
			dbConfig: {
				type: 'mongodb',
				host: 'localhost',
				port: 27017,
				name: 'sveltycms_test',
				user: '',
				password: ''
			},
			adminUser: {
				username: '',
				email: '',
				password: '',
				confirmPassword: '',
				firstName: '',
				lastName: ''
			},
			systemSettings: {
				siteName: 'SveltyCMS',
				defaultLanguage: 'en',
				availableLanguages: ['en']
			},
			emailSettings: {
				skipWelcomeEmail: true
			},
			firstCollection: null
		},
		load: () => {},
		clear: () => {},
		setupPersistence: () => {}
	}
}));

mock.module('@src/stores/store.svelte', () => ({
	systemLanguage: {
		value: 'en',
		set: (_lang: string) => {}
	}
}));

// =============================================================================
// 5. PARAGLIDE i18n MOCKS
// =============================================================================

mock.module('@src/paraglide/messages', () => ({
	widgets_nodata: () => 'No Data',
	widget_richText_description: () => 'Rich text widget description',
	setup_step_database: () => 'Database Configuration',
	setup_step_database_desc: () => 'Configure your database connection',
	setup_step_admin: () => 'Admin Account',
	setup_step_admin_desc: () => 'Create your admin user',
	setup_step_system: () => 'System Settings',
	setup_step_system_desc: () => 'Configure system preferences',
	setup_step_email: () => 'Email Settings',
	setup_step_email_desc: () => 'Configure SMTP (optional)',
	setup_step_complete: () => 'Review & Complete',
	setup_step_complete_desc: () => 'Review and finalize setup',
	setup_heading_badge: () => 'Setup Wizard',
	setup_heading_subtitle: (params: any) => `Welcome to ${params.siteName} Setup`,
	setup_search_placeholder: () => 'Search languages...',
	setup_legend_completed: () => 'Completed',
	setup_legend_current: () => 'Current',
	setup_legend_pending: () => 'Pending',
	setup_db_test_details_hide: () => 'Hide Details',
	setup_db_test_details_show: () => 'Show Details',
	setup_db_test_latency: () => 'Latency',
	setup_db_test_engine: () => 'Engine',
	setup_db_test_user: () => 'User',
	label_host: () => 'Host',
	label_port: () => 'Port',
	label_database: () => 'Database',
	label_user: () => 'User',
	button_previous: () => 'Previous',
	button_next: () => 'Next',
	button_complete: () => 'Complete Setup',
	setup_progress_step_of: (params: any) => `Step ${params.current} of ${params.total}`
}));

mock.module('@src/paraglide/runtime', () => ({
	getLocale: () => 'en',
	setLocale: (_locale: string) => {},
	locales: ['en', 'de', 'fr', 'es', 'it', 'pt']
}));

// =============================================================================
// 6. UTILITY MOCKS
// =============================================================================

mock.module('@utils/logger', () => ({
	logger: {
		debug: (...args: any[]) => console.log('[DEBUG]', ...args),
		info: (...args: any[]) => console.log('[INFO]', ...args),
		warn: (...args: any[]) => console.warn('[WARN]', ...args),
		error: (...args: any[]) => console.error('[ERROR]', ...args)
	}
}));

mock.module('@utils/languageUtils', () => ({
	getLanguageName: (code: string, _displayLang?: string) => {
		const names: Record<string, string> = {
			en: 'English',
			de: 'German',
			fr: 'French',
			es: 'Spanish',
			it: 'Italian',
			pt: 'Portuguese'
		};
		return names[code] || code.toUpperCase();
	}
}));

mock.module('@utils/toast', () => ({
	setGlobalToastStore: (_store: any) => {},
	showToast: (message: string, type?: string, _duration?: number) => {
		console.log(`[TOAST ${type || 'info'}]`, message);
	}
}));

const loggerServerPath = process.cwd() + '/src/utils/logger.server.ts';
mock.module(loggerServerPath, () => ({
	logger: {
		debug: () => {},
		info: () => {},
		warn: () => {},
		error: () => {},
		trace: () => {}
	}
}));

mock.module('@utils/logger.server', () => ({
	logger: {
		debug: () => {},
		info: () => {},
		warn: () => {},
		error: () => {},
		trace: () => {}
	}
}));

// =============================================================================
// 7. SKELETON LABS MOCKS
// =============================================================================

mock.module('@skeletonlabs/skeleton', () => ({
	getModalStore: () => ({
		trigger: (_settings: any) => {},
		close: () => {},
		clear: () => {}
	}),
	getToastStore: () => ({
		trigger: (_settings: any) => {}
	}),
	Modal: null,
	Toast: null
}));

// =============================================================================
// 8. WIDGET FACTORY MOCK
// =============================================================================

mock.module('@src/widgets/factory', () => ({
	createWidget: (config: any) => {
		// Return a factory function that creates field instances
		const factory = (fieldConfig: any) => ({
			widget: {
				widgetId: config.Name,
				Name: config.Name,
				Icon: config.Icon,
				Description: config.Description,
				inputComponentPath: config.inputComponentPath || '',
				displayComponentPath: config.displayComponentPath || '',
				validationSchema: config.validationSchema,
				defaults: config.defaults,
				GuiFields: config.GuiSchema || {}
			},
			...fieldConfig
		});

		// Attach metadata to factory function
		factory.Name = config.Name;
		factory.Icon = config.Icon;
		factory.Description = config.Description;
		factory.GuiSchema = config.GuiSchema;
		factory.GraphqlSchema = config.GraphqlSchema;
		factory.aggregations = config.aggregations;
		factory.__inputComponentPath = config.inputComponentPath || '';
		factory.__displayComponentPath = config.displayComponentPath || '';
		factory.toString = () => '';

		return factory;
	}
}));

mock.module('@src/databases/db', () => ({
	auth: {
		getUserCount: () => Promise.resolve(1),
		getAllRoles: () => Promise.resolve([
			{ _id: 'admin', name: 'Administrator', isAdmin: true, permissions: [] },
			{ _id: 'editor', name: 'Editor', isAdmin: false, permissions: [] }
		]),
		getUserById: () => Promise.resolve(null)
	},
	dbAdapter: {
		auth: {
			getUserCount: () => Promise.resolve(1),
			getAllRoles: () => Promise.resolve([
				{ _id: 'admin', name: 'Administrator', isAdmin: true, permissions: [] },
				{ _id: 'editor', name: 'Editor', isAdmin: false, permissions: [] }
			])
		}
	}
}));

console.log('✅ Test environment setup complete');
