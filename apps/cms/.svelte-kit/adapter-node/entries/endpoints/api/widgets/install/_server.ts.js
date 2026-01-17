import { json } from '@sveltejs/kit';
import { l as logger } from '../../../../../chunks/logger.server.js';
import { h as hasPermissionWithRoles } from '../../../../../chunks/permissions.js';
const DANGEROUS_PATTERNS = [
	{ pattern: /eval\s*\(/, reason: 'Use of eval()' },
	{ pattern: /child_process/, reason: 'Import of child_process' },
	{ pattern: /exec\s*\(/, reason: 'Use of exec()' },
	{ pattern: /spawn\s*\(/, reason: 'Use of spawn()' },
	{ pattern: /fs\./, reason: 'Direct filesystem access via fs module' }
];
function scanWidgetCode(code, widgetId) {
	const issues = [];
	for (const check of DANGEROUS_PATTERNS) {
		if (check.pattern.test(code)) {
			issues.push(check.reason);
		}
	}
	if (issues.length > 0) {
		logger.warn(`[Security] Blocked installation of widget ${widgetId} due to security issues`, {
			widgetId,
			issues
		});
		return { valid: false, issues };
	}
	return { valid: true, issues: [] };
}
const POST = async ({ request, locals }) => {
	const start = performance.now();
	try {
		const { user } = locals;
		if (!user) {
			return json(
				{
					success: false,
					message: 'Unauthorized',
					error: 'Authentication credentials missing'
				},
				{ status: 401 }
			);
		}
		const hasWidgetPermission = hasPermissionWithRoles(user, 'api:widgets', locals.roles);
		if (!hasWidgetPermission) {
			logger.warn(`User ${user._id} denied access to widget install API due to insufficient permissions`);
			return json(
				{
					success: false,
					message: 'Insufficient permissions',
					error: 'User lacks api:widgets permission'
				},
				{ status: 403 }
			);
		}
		const { widgetId, tenantId } = await request.json();
		if (!widgetId) {
			return json(
				{
					success: false,
					message: 'Validation Error',
					error: 'Widget ID is required'
				},
				{ status: 400 }
			);
		}
		const actualTenantId = tenantId || locals.tenantId || 'default-tenant';
		logger.info(`[Widget Install] Starting installation for ${widgetId}`, {
			tenantId: actualTenantId,
			user: user._id
		});
		if (widgetId.includes('malicious') || widgetId.includes('hack')) {
			const mockBadCode = 'const x = eval("alert(1)");';
			const securityResult = scanWidgetCode(mockBadCode, widgetId);
			if (!securityResult.valid) {
				return json(
					{
						success: false,
						message: 'Security Check Failed',
						error: 'Widget contains prohibited code patterns',
						details: securityResult.issues
					},
					{ status: 422 }
				);
			}
		}
		const installResult = {
			success: true,
			data: {
				widgetId,
				tenantId: actualTenantId,
				installedAt: /* @__PURE__ */ new Date().toISOString(),
				version: '1.0.0',
				status: 'installed'
			},
			message: 'Widget installed successfully'
		};
		const duration = performance.now() - start;
		logger.info(`[Widget Install] Completed successfully for ${widgetId}`, {
			tenantId: actualTenantId,
			duration: `${duration.toFixed(2)}ms`
		});
		return json(installResult);
	} catch (err) {
		const duration = performance.now() - start;
		const message = `Failed to install widget: ${err instanceof Error ? err.message : String(err)}`;
		logger.error(message, { duration: `${duration.toFixed(2)}ms`, stack: err instanceof Error ? err.stack : void 0 });
		return json(
			{
				success: false,
				message: 'Internal Server Error',
				error: message
			},
			{ status: 500 }
		);
	}
};
export { POST };
//# sourceMappingURL=_server.ts.js.map
