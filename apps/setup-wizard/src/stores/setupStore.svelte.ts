/**
 * @file setupStore.svelte.ts
 * @description Svelte 5 rune-based store for setup wizard with reactive state management
 */

// --- Types ---
export type SupportedDbType = 'mongodb' | 'mongodb+srv' | 'postgresql' | 'mysql' | 'mariadb' | '';

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
		firstCollection: null as { name: string; path: string } | null
	});

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

	return {
		get wizard() {
			return wizard;
		},

		// Call this from component to enable persistence
		setupPersistence,

		load() {
			if (isLoaded || !storage) return;
			try {
				const rawDb = storage.getItem(KEYS.db);
				if (rawDb) {
					// ✅ FIX: Merge with defaults to prevent missing properties from old storage data.
					wizard.dbConfig = { ...initialDbConfig, ...JSON.parse(rawDb) };
				}

				const rawAdmin = storage.getItem(KEYS.admin);
				if (rawAdmin) {
					wizard.adminUser = { ...initialAdminUser, ...JSON.parse(rawAdmin) };
				}

				const rawSystem = storage.getItem(KEYS.system);
				if (rawSystem) {
					const loadedSystem = JSON.parse(rawSystem);

					// Migration: If old data only has ['en'], upgrade to ['en', 'de'] to match new defaults
					if (Array.isArray(loadedSystem.systemLanguages) && loadedSystem.systemLanguages.length === 1 && loadedSystem.systemLanguages[0] === 'en') {
						loadedSystem.systemLanguages = ['en', 'de'];
					}
					if (
						Array.isArray(loadedSystem.contentLanguages) &&
						loadedSystem.contentLanguages.length === 1 &&
						loadedSystem.contentLanguages[0] === 'en'
					) {
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
				this.clear();
			} finally {
				isLoaded = true;
			}
		},

		clear() {
			// ✅ FIX: Simplify state reset by creating a single initial state object.
			const initialState = {
				dbConfig: { ...initialDbConfig },
				adminUser: { ...initialAdminUser },
				systemSettings: { ...initialSystemSettings },
				emailSettings: { ...initialEmailSettings },
				currentStep: 0,
				highestStepReached: 0,
				dbTestPassed: false
			};
			Object.assign(wizard, initialState);

			if (storage) {
				// Your key-by-key removal is safer than `storage.clear()`
				for (const key of Object.values(KEYS)) {
					storage.removeItem(key);
				}
			}
		}
	};
}

export const setupStore = createSetupStore();
