/**
 * @file src/stores/setupStore.svelte.ts
 * @description Enterprise-grade Service Store for setup wizard
 *
 * ARCHITECTURE: Service Store Pattern
 * - State management (wizard data, validation, errors)
 * - Business logic (validation rules)
 * - API integration (database test, seed, complete)
 * - Loading states (isLoading, isSubmitting)
 * - Error handling (centralized error messages)
 *
 * BENEFITS:
 * - Single source of truth for all setup logic
 * - Testable business logic separate from UI
 * - Consistent error handling across all API calls
 * - Simplified components (pure UI, no fetch calls)
 */

import { safeParse } from 'valibot';
import { setupAdminSchema, dbConfigSchema, systemSettingsSchema } from '@utils/formSchemas';
import { logger } from '@utils/logger';
import { toaster } from '@stores/store.svelte';
import { goto } from '$app/navigation';

// --- Types ---
export type SupportedDbType = 'mongodb' | 'mongodb+srv' | 'postgresql' | 'mysql' | 'mariadb' | '';
export type ValidationErrors = Record<string, string>;

export type PasswordRequirements = {
	length: boolean;
	letter: boolean;
	number: boolean;
	special: boolean;
	match: boolean;
};

export type DbConfig = {
	type: SupportedDbType;
	host: string;
	port: string;
	name: string;
	user: string;
	password: string;
};
export type AdminUser = {
	username: string;
	email: string;
	password: string;
	confirmPassword: string;
};
export type SystemSettings = {
	siteName: string;
	hostProd: string;
	defaultSystemLanguage: string;
	systemLanguages: string[];
	defaultContentLanguage: string;
	contentLanguages: string[];
	mediaStorageType: 'local' | 's3' | 'r2' | 'cloudinary';
	mediaFolder: string;
	timezone: string;
};
export type EmailSettings = {
	smtpConfigured: boolean;
	skipWelcomeEmail: boolean;
};

// --- API Response Types ---
export type DatabaseTestResult = {
	success: boolean;
	message?: string;
	error?: string;
	userFriendly?: string;
	latencyMs?: number;
	classification?: string;
	details?: unknown;
};

export type SetupCompleteResponse = {
	success: boolean;
	error?: string;
	redirectPath?: string;
	loggedIn?: boolean;
};

export type SeedDatabaseResponse = {
	success: boolean;
	error?: string;
	firstCollection?: { name: string; path: string } | null;
};

// --- Initial State Constants ---
const initialDbConfig: DbConfig = { type: 'mongodb', host: 'localhost', port: '27017', name: 'SveltyCMS', user: '', password: '' };
const initialAdminUser: AdminUser = { username: '', email: '', password: '', confirmPassword: '' };
const initialSystemSettings: SystemSettings = {
	siteName: 'SveltyCMS',
	hostProd: 'https://localhost:5173',
	defaultSystemLanguage: 'en',
	systemLanguages: ['en', 'de'], // Will be populated from DB after seeding (reads from settings.json)
	defaultContentLanguage: 'en',
	contentLanguages: ['en', 'de'], // Will be populated from DB after seeding (reads from settings.json)
	mediaStorageType: 'local',
	mediaFolder: './mediaFolder',
	timezone: 'UTC'
};
const initialEmailSettings: EmailSettings = {
	smtpConfigured: false,
	skipWelcomeEmail: true
};
// ✅ FIX: Explicitly type initialStepErrors as a Record<number, string[]>
const initialStepErrors: Record<number, string[]> = {
	0: [], // Database config errors
	1: [], // Admin user errors
	2: [], // System settings errors
	3: [], // Email (no validation errors expected)
	4: [] // Complete (no validation errors expected)
};

// --- Persistence Keys ---
const KEY_PREFIX = 'setupWizard:';
const KEYS = {
	db: `${KEY_PREFIX}dbConfig`,
	admin: `${KEY_PREFIX}adminUser`,
	system: `${KEY_PREFIX}systemSettings`,
	email: `${KEY_PREFIX}emailSettings`,
	step: `${KEY_PREFIX}currentStep`,
	highestStep: `${KEY_PREFIX}highestStep`,
	dbTest: `${KEY_PREFIX}dbTestPassed`
} as const;

// --- Storage Utility ---
function getStorage(): Storage | null {
	if (typeof window === 'undefined') return null;
	try {
		// Test and return localStorage
		localStorage.setItem('__test', '1');
		localStorage.removeItem('__test');
		return localStorage;
	} catch {
		console.warn('localStorage is not available. Setup state will not be persisted across sessions.');
		return null; // Don't fall back to sessionStorage, it's better to be explicit.
	}
}

// --- Store Implementation ---
function createSetupStore() {
	const storage = getStorage();
	let isLoaded = false;

	const wizard = $state({
		dbConfig: { ...initialDbConfig },
		adminUser: { ...initialAdminUser },
		systemSettings: { ...initialSystemSettings },
		emailSettings: { ...initialEmailSettings },
		currentStep: 0,
		highestStepReached: 0,
		dbTestPassed: false,
		firstCollection: null as { name: string; path: string } | null,
		// Validation state
		validationErrors: {} as ValidationErrors,
		stepErrors: { ...initialStepErrors },
		// API Loading states
		isLoading: false,
		isSubmitting: false,
		// UI state for database test
		lastDbTestResult: null as DatabaseTestResult | null,
		lastTestFingerprint: null as string | null,
		errorMessage: '',
		successMessage: '',
		showDbDetails: false
	});

	// --- Validation Logic (Moved from Page) ---
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const validationMap: Record<number, { schema: any; data: () => any }> = {
		0: { schema: dbConfigSchema, data: () => wizard.dbConfig },
		1: { schema: setupAdminSchema, data: () => wizard.adminUser },
		2: { schema: systemSettingsSchema, data: () => wizard.systemSettings }
		// Steps 3 (Email) and 4 (Review) have no validation, so they are omitted
	};

	function validateStep(step: number, mutateErrors = true): boolean {
		const validationEntry = validationMap[step];

		// If no entry, the step is valid (e.g., Email or Review)
		if (!validationEntry) {
			if (mutateErrors) {
				// Ensure the step index exists before assigning
				if (step in wizard.stepErrors) {
					wizard.stepErrors[step] = [];
				}
			}
			return true;
		}

		const { schema, data: getData } = validationEntry;
		const data = getData();
		const result = safeParse(schema, data);

		// Get a fresh copy of current errors
		const currentErrors = { ...wizard.validationErrors };

		// Get the keys for the data we are validating (e.g., 'host', 'port', 'name')
		const dataKeys = Object.keys(data);

		// Clear only the errors for the fields we are about to validate
		if (mutateErrors) {
			for (const key of dataKeys) {
				delete currentErrors[key];
			}
		}

		if (result.success) {
			if (mutateErrors) {
				if (step in wizard.stepErrors) {
					wizard.stepErrors[step] = [];
				}
				wizard.validationErrors = currentErrors; // Save the cleared state
			}
			return true;
		}

		// Handle validation failure
		const newErrors: ValidationErrors = {};
		const errorMessages: string[] = [];

		for (const issue of result.issues) {
			const path = issue.path?.[0]?.key as string;
			if (path) {
				newErrors[path] = issue.message;
				errorMessages.push(`${path}: ${issue.message}`);
			}
		}

		if (mutateErrors) {
			// Merge the new errors with the (now-cleared) existing errors
			wizard.validationErrors = { ...currentErrors, ...newErrors };
			if (step in wizard.stepErrors) {
				wizard.stepErrors[step] = errorMessages;
			}
		}

		return false;
	}

	// Function to setup persistence effect - will be called from component
	function setupPersistence() {
		$effect(() => {
			if (!isLoaded) return;
			if (!storage) return;
			try {
				storage.setItem(KEYS.db, JSON.stringify(wizard.dbConfig));
				storage.setItem(KEYS.admin, JSON.stringify(wizard.adminUser));
				storage.setItem(KEYS.system, JSON.stringify(wizard.systemSettings));
				storage.setItem(KEYS.email, JSON.stringify(wizard.emailSettings));
				storage.setItem(KEYS.step, String(wizard.currentStep));
				storage.setItem(KEYS.highestStep, String(wizard.highestStepReached));
				storage.setItem(KEYS.dbTest, String(wizard.dbTestPassed));
			} catch (e) {
				console.error('Failed to persist setup state:', e);
			}
		});
	}

	// --- Derived State (Moved from Page) ---
	const stepCompleted = $derived<boolean[]>([
		wizard.dbTestPassed || wizard.highestStepReached > 0,
		wizard.highestStepReached > 1 && validateStep(1, false),
		wizard.highestStepReached > 2 && validateStep(2, false),
		wizard.highestStepReached > 3, // Email is optional, always considered complete
		false
	]);

	const stepClickable = $derived<boolean[]>([
		true, // Step 0 (Database) is always clickable
		wizard.highestStepReached >= 1, // Step 1 (Admin) is clickable if we've reached it
		wizard.highestStepReached >= 2, // Step 2 (System) is clickable if we've reached it
		wizard.highestStepReached >= 3, // Step 3 (Email) is clickable if we've reached it
		wizard.highestStepReached >= 4 // Step 4 (Complete) is clickable if we've reached it
	]);

	const canProceed = $derived.by<boolean>(() => {
		if (wizard.currentStep === 0) return wizard.dbTestPassed;
		if (wizard.currentStep === 1 || wizard.currentStep === 2) return validateStep(wizard.currentStep, false);
		if (wizard.currentStep === 3) return true; // Email step is optional, always can proceed
		return false;
	});

	// Password requirements checker for admin password
	const passwordRequirements = $derived({
		length: wizard.adminUser.password.length >= 8,
		letter: /[a-zA-Z]/.test(wizard.adminUser.password),
		number: /[0-9]/.test(wizard.adminUser.password),
		special: /[!@#$%^&*()_+\-=[\]{};':"\\|,.<>?]/.test(wizard.adminUser.password),
		match: wizard.adminUser.password === wizard.adminUser.confirmPassword && wizard.adminUser.password !== ''
	});

	// DB config fingerprint for change detection
	const dbConfigFingerprint = $derived<string>(JSON.stringify(wizard.dbConfig));
	const dbConfigChangedSinceTest = $derived<boolean>(wizard.lastTestFingerprint !== null && wizard.lastTestFingerprint !== dbConfigFingerprint);

	// --- API METHODS (Enterprise Service Store Pattern) ---

	/**
	 * Test database connection
	 * @returns Promise<boolean> - true if connection successful
	 */
	async function testDatabaseConnection(): Promise<boolean> {
		// Validate before testing
		if (!validateStep(0, true)) {
			wizard.errorMessage = 'Please fill in all required fields before testing.';
			wizard.lastDbTestResult = { success: false, error: 'Client-side validation failed.' };
			wizard.showDbDetails = true;
			return false;
		}

		wizard.isLoading = true;
		wizard.errorMessage = '';
		wizard.successMessage = '';
		wizard.lastDbTestResult = null;

		try {
			const response = await fetch('/api/setup/test-database', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(wizard.dbConfig)
			});

			const data: DatabaseTestResult = await response.json();
			wizard.lastDbTestResult = data;

			if (data.success) {
				wizard.successMessage = data.message || 'Connection successful!';
				wizard.dbTestPassed = true;
				wizard.lastTestFingerprint = dbConfigFingerprint;
				wizard.errorMessage = '';
				wizard.showDbDetails = false;
				wizard.validationErrors = {};
				return true;
			} else {
				wizard.errorMessage = data.userFriendly || data.error || 'Database connection failed.';
				wizard.dbTestPassed = false;
				wizard.successMessage = '';
				wizard.showDbDetails = true;

				// Map error classifications to field-specific errors
				const newValidationErrors: ValidationErrors = {};
				if (data.classification) {
					switch (data.classification) {
						case 'authentication_failed':
						case 'user_not_found':
						case 'wrong_password':
							newValidationErrors.user = 'Please check your username';
							newValidationErrors.password = 'Please check your password';
							break;
						case 'credentials_required':
						case 'auth_required':
						case 'likely_auth_required':
						case 'password_required':
							newValidationErrors.user = 'Username required';
							newValidationErrors.password = 'Password required';
							break;
						case 'dns_not_found':
						case 'connection_refused':
							newValidationErrors.host = 'Check hostname or server status';
							break;
						case 'invalid_port':
							newValidationErrors.port = 'Check port number';
							break;
						case 'database_not_found':
							newValidationErrors.name = 'Database not found';
							break;
						case 'invalid_hostname':
						case 'invalid_uri':
							newValidationErrors.host = 'Invalid host/URI format';
							break;
					}
				}

				if (Object.keys(newValidationErrors).length > 0) {
					wizard.validationErrors = newValidationErrors;
				}

				logger.error('Database test failed:', data);
				return false;
			}
		} catch (e) {
			const errorMsg = e instanceof Error ? e.message : 'A network error occurred.';
			wizard.errorMessage = `Network error: ${errorMsg}`;
			wizard.dbTestPassed = false;
			wizard.successMessage = '';
			logger.error('Network error during database test:', e);
			return false;
		} finally {
			wizard.isLoading = false;
		}
	}

	/**
	 * Seed database with initial data
	 * @returns Promise<boolean> - true if seeding successful
	 */
	async function seedDatabase(): Promise<boolean> {
		if (!wizard.dbTestPassed) {
			logger.warn('Cannot seed database: connection not tested');
			return false;
		}

		wizard.isLoading = true;

		try {
			const response = await fetch('/api/setup/seed', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(wizard.dbConfig)
			});

			const data: SeedDatabaseResponse = await response.json();

			if (data.success) {
				logger.debug('✅ Database initialized successfully');
				toaster.success({ description: 'Database initialized successfully! ✨' });

				if (data.firstCollection) {
					wizard.firstCollection = data.firstCollection;
				}
				return true;
			} else {
				logger.warn('⚠️  Database initialization had issues:', data.error);
				toaster.info({ description: 'Setup will continue, data will be created as needed.' });
				return false;
			}
		} catch (error) {
			logger.warn('⚠️  Error during database initialization:', error);
			return false;
		} finally {
			wizard.isLoading = false;
		}
	}

	/**
	 * Complete setup process
	 * @param onSuccess - Optional callback to run on successful completion (e.g., for redirect)
	 * @returns Promise<boolean> - true if setup completed successfully
	 */
	async function completeSetup(onSuccess?: (redirectPath: string) => void): Promise<boolean> {
		if (wizard.isSubmitting) {
			logger.warn('Setup already in progress');
			return false;
		}

		// Final validation of all steps
		const step0Valid = validateStep(0, true);
		const step1Valid = validateStep(1, true);
		const step2Valid = validateStep(2, true);

		if (!step0Valid || !step1Valid || !step2Valid) {
			toaster.error({ description: 'Please fix validation errors before completing setup.' });

			// Navigate to first invalid step
			if (!step0Valid) wizard.currentStep = 0;
			else if (!step1Valid) wizard.currentStep = 1;
			else if (!step2Valid) wizard.currentStep = 2;

			return false;
		}

		wizard.isSubmitting = true;
		wizard.isLoading = true;
		wizard.errorMessage = '';

		try {
			const response = await fetch('/api/setup/complete', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({
					database: wizard.dbConfig,
					admin: wizard.adminUser,
					system: wizard.systemSettings,
					firstCollection: wizard.firstCollection,
					skipWelcomeEmail: wizard.emailSettings.skipWelcomeEmail
				})
			});

			const data: SetupCompleteResponse = await response.json();

			if (!response.ok || !data.success) {
				const errorMsg = data.error || 'Failed to finalize setup.';
				toaster.error({ description: errorMsg });
				wizard.errorMessage = errorMsg;
				throw new Error(errorMsg);
			}

			// Success!
			toaster.success({ description: 'Setup complete! Welcome to SveltyCMS! 🎉' });

			// Clear store
			clear();

			// Call the onSuccess callback with redirect path
			if (onSuccess && data.redirectPath) {
				onSuccess(data.redirectPath!);
			} else {
				// Fallback: direct redirect
				if (typeof window !== 'undefined') {
					goto(data.redirectPath || '/config/collectionbuilder');
				}
			}

			return true;
		} catch (e) {
			const errorMsg = e instanceof Error ? e.message : 'An unknown error occurred.';
			wizard.errorMessage = errorMsg;

			if (!wizard.errorMessage.includes('Failed to')) {
				toaster.error({ description: errorMsg });
			}

			return false;
		} finally {
			wizard.isLoading = false;
			wizard.isSubmitting = false;
		}
	}

	/**
	 * Clear database test error and reset UI state
	 */
	function clearDbTestError() {
		wizard.errorMessage = '';
		wizard.successMessage = '';
		wizard.lastDbTestResult = null;
		wizard.lastTestFingerprint = null;
		wizard.dbTestPassed = false;
		wizard.showDbDetails = false;

		// Clear field-specific validation errors
		const clearedErrors: ValidationErrors = {};
		for (const key in wizard.validationErrors) {
			if (!['host', 'port', 'name', 'user', 'password'].includes(key)) {
				clearedErrors[key] = wizard.validationErrors[key];
			}
		}
		wizard.validationErrors = clearedErrors;
	}

	// --- CLEAR METHOD (Updated) ---
	function clear() {
		const initialState = {
			dbConfig: { ...initialDbConfig },
			adminUser: { ...initialAdminUser },
			systemSettings: { ...initialSystemSettings },
			emailSettings: { ...initialEmailSettings },
			currentStep: 0,
			highestStepReached: 0,
			dbTestPassed: false,
			firstCollection: null,
			validationErrors: {},
			stepErrors: { ...initialStepErrors },
			isLoading: false,
			isSubmitting: false,
			lastDbTestResult: null,
			lastTestFingerprint: null,
			errorMessage: '',
			successMessage: '',
			showDbDetails: false
		};

		Object.assign(wizard, initialState);

		if (storage) {
			for (const key of Object.values(KEYS)) {
				storage.removeItem(key);
			}
		}
	}

	// --- LOAD METHOD ---
	function load() {
		if (isLoaded || !storage) return;
		try {
			const rawDb = storage.getItem(KEYS.db);
			if (rawDb) {
				wizard.dbConfig = { ...initialDbConfig, ...JSON.parse(rawDb) };
			}

			const rawAdmin = storage.getItem(KEYS.admin);
			if (rawAdmin) {
				wizard.adminUser = { ...initialAdminUser, ...JSON.parse(rawAdmin) };
			}

			const rawSystem = storage.getItem(KEYS.system);
			if (rawSystem) {
				const loadedSystem = JSON.parse(rawSystem);

				// Migration: If old data only has ['en'], upgrade to ['en', 'de']
				if (Array.isArray(loadedSystem.systemLanguages) && loadedSystem.systemLanguages.length === 1 && loadedSystem.systemLanguages[0] === 'en') {
					loadedSystem.systemLanguages = ['en', 'de'];
				}
				if (Array.isArray(loadedSystem.contentLanguages) && loadedSystem.contentLanguages.length === 1 && loadedSystem.contentLanguages[0] === 'en') {
					loadedSystem.contentLanguages = ['en', 'de'];
				}

				wizard.systemSettings = { ...initialSystemSettings, ...loadedSystem };
			}

			const rawEmail = storage.getItem(KEYS.email);
			if (rawEmail) {
				wizard.emailSettings = { ...initialEmailSettings, ...JSON.parse(rawEmail) };
			}

			wizard.currentStep = parseInt(storage.getItem(KEYS.step) || '0', 10);
			wizard.highestStepReached = parseInt(storage.getItem(KEYS.highestStep) || '0', 10);
			wizard.dbTestPassed = storage.getItem(KEYS.dbTest) === 'true';

			// Sanity check
			if (wizard.currentStep > 0 && !wizard.dbTestPassed) {
				wizard.currentStep = 0;
				wizard.highestStepReached = 0;
			}
		} catch (e) {
			console.error('Failed to load persisted state, clearing for safety:', e);
			clear();
		} finally {
			isLoaded = true;
		}
	}

	return {
		// Export the writable $state rune directly
		wizard,

		// Core methods
		setupPersistence,
		validateStep,
		load,
		clear,

		// API methods (Enterprise Service Store)
		testDatabaseConnection,
		seedDatabase,
		completeSetup,
		clearDbTestError,

		// Derived state as getters
		get stepCompleted() {
			return stepCompleted;
		},
		get stepClickable() {
			return stepClickable;
		},
		get canProceed() {
			return canProceed;
		},
		get passwordRequirements() {
			return passwordRequirements;
		},
		get dbConfigFingerprint() {
			return dbConfigFingerprint;
		},
		get dbConfigChangedSinceTest() {
			return dbConfigChangedSinceTest;
		}
	};
}

// Create and export the singleton store instance
export const setupStore = createSetupStore();
