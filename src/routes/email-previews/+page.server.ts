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

import { createEmail, emailList, sendEmail } from 'svelte-email-tailwind/preview';
//import { PRIVATE_RESEND_API_KEY } from '$env/static/private';

export async function load() {
    // return the list of email components
    return emailList({ path: '/src/components/emails' });
}

export const actions = {
    ...createEmail,
    ...sendEmail({ resendApiKey: '1234' })
    // ...sendEmail({ resendApiKey: PRIVATE_RESEND_API_KEY })
};