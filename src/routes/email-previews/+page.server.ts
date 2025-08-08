/**
 * @file src/routes/email-previews/+page.server.ts
 * @description Server-side logic for the email preview page.
 *
 * ### Props
 * - `user`: The authenticated user data.
 *
 * ### Features
 * - User authentication and authorization (now tenant-aware)
 * - Proper typing for user data
 *
 */

import { createEmail, emailList, sendEmail } from 'svelte-email-tailwind/preview';
import type { PageData as AppPageData } from './$types';

// Auth
import type { User } from '@root/src/auth';

// Roles
import { roles } from '@root/config/roles';

// System Logger
import { logger } from '@utils/logger.svelte';

// Create a global variable to store the fetch function for actions
let eventFetch: typeof globalThis.fetch;

// Define what your load function expects for user data and email list data
interface ExpectedPageData extends AppPageData {
	user?: User | null; // Properties from emailList (components, emails etc.)
	emails?: { name: string; path: string; [key: string]: unknown }[];
	components?: Record<string, unknown>;
	[key: string]: unknown; // Allow other properties from emailList
}

export async function load({ locals, fetch }: { locals: App.Locals; fetch: typeof globalThis.fetch }): Promise<ExpectedPageData> {
	const { user: userData, tenantId, roles: tenantRoles } = locals; // Store the fetch function for use in actions

	eventFetch = fetch; // Permission check: only allow admins to view email previews
	// Use tenant-specific roles from locals if available, otherwise fallback to global roles.

	const rolesToUse = tenantRoles && tenantRoles.length > 0 ? tenantRoles : roles;
	const userRole = rolesToUse.find((role) => role._id === userData?.role);
	const isAdmin = Boolean(userRole?.isAdmin);

	if (!userData || !isAdmin) {
		logger.warn(`Unauthorized attempt to access email previews by user: ${userData?.username || 'Guest'}`, { tenantId });
	}

	const emailListData = await emailList({ path: '/src/components/emails' });

	return {
		user: userData,
		...emailListData
	};
}

export const actions = {
	...createEmail, // Use the API endpoint for sending emails with proper fetch handling
	...sendEmail({
		customSendEmailFunction: async ({ /* from, */ to, subject /* html */ }) => {
			// Extract template name from subject or use default
			const templateName = subject?.includes('Preview:') ? subject.replace('Preview:', '').trim() : 'welcomeUser';

			logger.info('Email preview attempting to send via API:', {
				recipientEmail: to,
				subject,
				templateName
			}); // Ensure essential props have fallbacks for robust previewing

			const previewProps = {
				username: 'Preview User',
				email: to,
				sitename: 'SveltyCMS (Preview)',
				hostLink: 'http://localhost:5173' // Add any other commonly required props with sensible defaults
			};

			try {
				const res = await eventFetch('/api/sendMail', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json'
					},
					body: JSON.stringify({
						recipientEmail: to,
						subject: subject || `Preview: ${templateName}`,
						templateName: templateName,
						props: previewProps,
						languageTag: 'en'
					})
				});

				if (!res.ok) {
					const errorText = await res.text();
					logger.error(`Error from /api/sendMail endpoint during preview: ${res.status} ${errorText}`);
					return { success: false, error: `API Error (${res.status}): ${errorText}` };
				}
				const result = await res.json();
				if (result.success) {
					logger.info('Email preview sent successfully via API.');
				} else {
					logger.warn('Email preview API call reported not successful:', { message: result.message });
				}
				return result;
			} catch (error) {
				logger.error('Failed to send email via API endpoint during preview', { error });
				return { success: false, error: error instanceof Error ? error.message : String(error) };
			}
		}
	})
};
