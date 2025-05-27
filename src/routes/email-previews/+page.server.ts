/**
 * @file src/routes/email-previews/+page.server.ts
 * @description Server-side logic for the email preview page.
 *
 * ### Props
 * - `user`: The authenticated user data.
 *
 * ### Features
 * - User authentication and authorization
 * - Proper typing for user data
 *
 */
import { createEmail, emailList, sendEmail, SendEmailFunction } from 'svelte-email-tailwind/preview';

export async function load() {
	// return the list of email components
	return emailList({ path: '/src/components/emails' });
}

// Custom send function using the API endpoint instead of Nodemailer
const sendUsingApiEndpoint: typeof SendEmailFunction = async ({ from, to, subject, templateName, props }) => {
	try {
		const res = await fetch('http://localhost:5173/api/sendMail', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				from,
				to,
				subject,
				templateName: templateName || 'welcomeUser', // fallback for preview
				props: props || {}
			})
		});
		if (!res.ok) {
			const error = await res.text();
			return { success: false, error };
		}
		return { success: true };
	} catch (error) {
		return { success: false, error: error instanceof Error ? error.message : String(error) };
	}
};

export const actions = {
	...createEmail,
	// Use the API endpoint for sending emails
	...sendEmail({ customSendEmailFunction: sendUsingApiEndpoint })
};
