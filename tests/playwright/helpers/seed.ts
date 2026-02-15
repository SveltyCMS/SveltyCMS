import { type Page } from '@playwright/test';

export const TEST_USERS = {
	developer: {
		email: 'developer@example.com',
		password: 'Developer123!',
		role: 'developer'
	},
	editor: {
		email: 'editor@example.com',
		password: 'Editor123!',
		role: 'editor'
	}
};

/**
 * Seeds the database with additional test users (Developer, Editor)
 * using the API. Assumes Admin is already logged in or setup is complete.
 */
export async function seedTestUsers(page: Page) {
	// First ensuring we are logged in as admin is required to create users
	// This function assumes the caller handles admin login if not already logged in

	// We use the internal API to create users
	// If the API isn't publicly exposed for user creation without various checks,
	// we might need to go through the UI or use a direct DB adapter if possible (but Playwright is client-side driven typically).
	// However, for E2E, UI or API is best.

	// Let's try to check if they exist first to avoid errors
	// Actually, the easiest way is to try to create them and ignore 409s

	for (const [key, user] of Object.entries(TEST_USERS)) {
		console.log(`Seeding user: ${user.email}...`);

		// This requires a valid session.
		const response = await page.request.post('/api/users', {
			data: {
				email: user.email,
				password: user.password,
				confirmpassword: user.password, // API typically expects this
				role: user.role,
				username: key.charAt(0).toUpperCase() + key.slice(1) // Developer, Editor
			}
		});

		if (response.status() === 200 || response.status() === 201) {
			console.log(`✅ User ${user.email} created.`);
		} else if (response.status() === 409 || (await response.text()).includes('exists')) {
			console.log(`ℹ️ User ${user.email} already exists.`);
		} else {
			console.error(`❌ Failed to create user ${user.email}: ${response.status()} ${await response.text()}`);
		}
	}
}
