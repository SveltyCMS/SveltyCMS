import { json, error } from '@sveltejs/kit';
import { d as dbAdapter } from '../../../../chunks/db.js';
import nodemailer from 'nodemailer';
import { l as logger } from '../../../../chunks/logger.server.js';
import { r as render } from '../../../../chunks/index5.js';
const svelteEmailModules = /* @__PURE__ */ Object.assign({});
async function getEmailTemplate(templateName) {
	const path = `/src/components/emails/${templateName}.svelte`;
	const moduleImporter = svelteEmailModules[path];
	if (moduleImporter) {
		try {
			const module = await moduleImporter();
			return module.default;
		} catch (e) {
			logger.error(`Failed to import email template '${templateName}' from path '${path}':`, e);
			return null;
		}
	}
	logger.warn(`Email template '${templateName}' not found at path '${path}'. Available modules:`, Object.keys(svelteEmailModules));
	return null;
}
const renderEmailToStrings = async (component, templateNameForLog, props) => {
	try {
		const result = render(component, { props: props || {} });
		const html = result.body;
		const text = html
			.replace(/<[^>]*>/g, '')
			.replace(/\s+/g, ' ')
			.trim();
		return { html, text };
	} catch (err) {
		const renderError = err;
		logger.error('Failed to render email template to string:', {
			templateName: templateNameForLog,
			error: renderError.message,
			stack: renderError.stack
		});
		throw new Error(`Email template '${templateNameForLog}' rendering failed: ${renderError.message}`);
	}
};
function createErrorResponse(message, status = 500) {
	logger.error(`API Error in /api/sendMail (${status}): ${message}`);
	throw error(status, message);
}
const POST = async ({ request, locals }) => {
	const { user, tenantId } = locals;
	const isInternalCall = request.headers.get('x-internal-call') === 'true';
	if (!isInternalCall) {
		logger.debug(`User '${user?.email || 'Unknown'}' calling /api/sendMail`, { tenantId });
	} else {
		logger.debug('Internal API call to /api/sendMail', { tenantId });
	}
	let requestBody;
	try {
		requestBody = await request.json();
	} catch (error2) {
		logger.error('Invalid JSON in request body:', { error: error2, tenantId });
		return createErrorResponse('Invalid JSON in request body.', 400);
	}
	const { recipientEmail, subject, templateName, props = {}, languageTag = 'en' } = requestBody;
	if (!recipientEmail || !subject || !templateName) {
		return createErrorResponse('Missing required fields: recipientEmail, subject, or templateName.', 400);
	}
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipientEmail)) {
		return createErrorResponse('Invalid recipient email address format.', 400);
	}
	const SelectedTemplateComponent = await getEmailTemplate(templateName);
	if (!SelectedTemplateComponent) {
		const availableTemplateNames = Object.keys(svelteEmailModules).map((path) => path.split('/').pop()?.replace('.svelte', ''));
		return createErrorResponse(`Invalid email template name: '${templateName}'. Available templates: ${availableTemplateNames.join(', ')}`, 400);
	}
	if (!dbAdapter) {
		logger.error('Database adapter is not initialized');
		return createErrorResponse('Database adapter is not available', 500);
	}
	const smtpHostResult = await dbAdapter.systemPreferences.get('SMTP_HOST', 'system');
	const smtpPortResult = await dbAdapter.systemPreferences.get('SMTP_PORT', 'system');
	const smtpUserResult = await dbAdapter.systemPreferences.get('SMTP_USER', 'system');
	const smtpPassResult = await dbAdapter.systemPreferences.get('SMTP_PASS', 'system');
	const smtpHost = smtpHostResult?.success ? smtpHostResult.data : null;
	const smtpPort = smtpPortResult?.success ? smtpPortResult.data : null;
	const smtpUser = smtpUserResult?.success ? smtpUserResult.data : null;
	const smtpPass = smtpPassResult?.success ? smtpPassResult.data : null;
	const missingVars = [];
	if (!smtpHost) missingVars.push('SMTP_HOST');
	if (!smtpPort) missingVars.push('SMTP_PORT');
	if (!smtpUser) missingVars.push('SMTP_USER');
	if (!smtpPass) missingVars.push('SMTP_PASS');
	if (missingVars.length > 0) {
		logger.warn('SMTP configuration incomplete. Email sending skipped.', {
			missingVars,
			tenantId
		});
		return json({
			success: true,
			message: 'SMTP settings not configured. Please configure email settings in System Settings to enable email notifications.',
			dev_mode: true,
			missing_config: missingVars,
			smtp_not_configured: true,
			user_message: 'Email notifications are not configured yet. Please contact your administrator to set up SMTP settings.'
		});
	}
	const dummyHost = String(smtpHost || '').toLowerCase();
	if (/dummy|example|\.invalid$/.test(dummyHost)) {
		logger.warn('SMTP host appears to be a placeholder; skipping email send.', { host: smtpHost, tenantId });
		return json({
			success: true,
			message: 'Email sending skipped due to dummy SMTP host (development mode).',
			dev_mode: true,
			dummy_host: smtpHost
		});
	}
	const templateProps = {
		...props,
		languageTag
	};
	let emailHtml, emailText;
	try {
		const rendered = await renderEmailToStrings(SelectedTemplateComponent, templateName, templateProps);
		emailHtml = rendered.html;
		emailText = rendered.text;
	} catch (renderErr) {
		return createErrorResponse(renderErr.message, 500);
	}
	const smtpPortNum = Number(smtpPort);
	const secureConnection = smtpPortNum === 465;
	const transporter = nodemailer.createTransport({
		host: smtpHost,
		port: smtpPortNum,
		secure: secureConnection,
		auth: {
			user: smtpUser,
			pass: smtpPass
		},
		tls: {
			rejectUnauthorized: process.env.NODE_ENV === 'development' ? false : true
		},
		debug: process.env.NODE_ENV === 'development'
	});
	const fromName = props?.sitename || 'SveltyCMS';
	const smtpMailFromResult = await dbAdapter.systemPreferences.get('SMTP_MAIL_FROM', 'system');
	const mailFrom = (smtpMailFromResult?.success ? smtpMailFromResult.data : null) || smtpUser;
	const mailOptions = {
		from: `"${fromName}" <${mailFrom}>`,
		to: recipientEmail,
		subject,
		text: emailText,
		html: emailHtml
	};
	try {
		const info = await transporter.sendMail(mailOptions);
		logger.info('Email sent successfully via Nodemailer from /api/sendMail:', {
			recipientEmail,
			subject,
			templateName,
			messageId: info.messageId,
			tenantId
		});
		return json({ success: true, message: 'Email sent successfully.' });
	} catch (err) {
		const sendError = err;
		logger.error('Nodemailer failed to send email from /api/sendMail:', {
			recipientEmail,
			subject,
			templateName,
			error: sendError.message,
			tenantId
		});
		return createErrorResponse(`Email sending failed: ${sendError.message}`, 500);
	}
};
export { POST };
//# sourceMappingURL=_server.ts.js.map
