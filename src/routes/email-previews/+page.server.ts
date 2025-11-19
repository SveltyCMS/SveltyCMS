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

import { createEmail, emailList, sendEmail } from 'better-svelte-email/preview';

// Auth
import type { User } from '@src/databases/auth/types';

// System Logger
import { logger } from '@utils/logger.server';
import { error } from '@sveltejs/kit';

// Create a global variable to store the fetch function for actions
let eventFetch: typeof globalThis.fetch;

// Define the return type for the load function.
// `emailList` from `better-svelte-email/preview` exposes:
// - `path: string`
// - `files: string[] | null`
// - `emails`, `components`, etc. as helper metadata.
// We mirror that shape here so `PageData` and `EmailPreview` agree.
interface PreviewData {
	user?: User | null;
	path?: string;
	files: string[] | null;
	emails?: { name: string; path: string }[];
	components?: Record<string, unknown>;
	[key: string]: unknown;
}

export async function load({ locals, fetch }: { locals: App.Locals; fetch: typeof globalThis.fetch }): Promise<PreviewData> {
	const { user: userData, isAdmin } = locals;

	// Store the fetch function for use in actions
	eventFetch = fetch;

	// Permission check: only allow admins to view email previews
	if (!userData) {
		logger.warn('Unauthenticated attempt to access email previews');
		throw error(401, 'Authentication required');
	}

	if (!isAdmin) {
		logger.warn(`Unauthorized attempt to access email previews by user: ${userData._id}`);
		throw error(403, 'Insufficient permissions - admin access required');
	}

	const emailListData = await emailList({ path: '/src/components/emails' });

	return {
		user: userData,
		...emailListData
	};
}

export const actions = {
	...createEmail,
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
