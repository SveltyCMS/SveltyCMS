/**
 * @file apps/setup-wizard/src/stores/setupStore.simple.svelte.ts
 * @description Simplified setup wizard store - all state in one place
 */

// ===== UI STATE =====
export const ui = $state({
	currentStep: 0,
	isDarkMode: false,
	language: 'en'
});

// ===== FORM DATA =====
export const db = $state({
	type: 'mongodb' as 'mongodb' | 'postgresql' | 'mysql' | 'mariadb',
	host: 'localhost',
	port: '27017',
	name: 'SveltyCMS',
	user: '',
	password: ''
});

export const admin = $state({
	username: '',
	email: '',
	password: '',
	confirmPassword: ''
});

export const system = $state({
	siteName: 'SveltyCMS',
	hostProd: 'https://localhost:5173',
	systemLanguages: ['en', 'de'],
	contentLanguages: ['en', 'de'],
	timezone: 'UTC'
});

// ===== THEME FUNCTIONS =====
export function initDarkMode() {
	if (typeof document === 'undefined') return;

	const stored = localStorage.getItem('theme-mode');
	const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

	ui.isDarkMode = stored === 'dark' || (!stored && prefersDark);
	document.documentElement.classList.toggle('dark', ui.isDarkMode);
	document.documentElement.setAttribute('data-theme', ui.isDarkMode ? 'dark' : 'light');
}

export function toggleDarkMode() {
	ui.isDarkMode = !ui.isDarkMode;
	localStorage.setItem('theme-mode', ui.isDarkMode ? 'dark' : 'light');
	document.documentElement.classList.toggle('dark', ui.isDarkMode);
	document.documentElement.setAttribute('data-theme', ui.isDarkMode ? 'dark' : 'light');
}
