import { d as escape_html, g as attr_class, a as attr, c as stringify } from './index5.js';
import { p as page } from './index6.js';
function PermissionGuard($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const { config, messages = {}, silent = false, showLoadingState = true, logDenials = true, children, fallback } = $$props;
		const defaultMessages = {
			rateLimited: 'Rate limit reached. Please try again later.',
			missingConfig: 'Permission configuration is missing.',
			insufficientPermissions: 'You do not have permission to access this content.',
			loadingPermissions: 'Loading permissions...'
		};
		const finalMessages = { ...defaultMessages, ...messages };
		const permissions = page.data?.permissions || {};
		const isAdmin = page.data?.isAdmin || false;
		const isLoading = page.data?.isLoadingPermissions || false;
		const permissionData = (() => {
			if (!config?.contextId) {
				return { hasPermission: false, isRateLimited: false };
			}
			return permissions[config.contextId] ?? { hasPermission: false, isRateLimited: false };
		})();
		const hasPermission = isAdmin || permissionData.hasPermission;
		const isRateLimited = permissionData.isRateLimited;
		const shouldShowContent = !!config && hasPermission && !isRateLimited && !isLoading;
		const errorMessage = (() => {
			if (!config) return finalMessages.missingConfig;
			if (isRateLimited) return finalMessages.rateLimited;
			if (!hasPermission) return finalMessages.insufficientPermissions;
			return null;
		})();
		const errorIcon = (() => {
			if (!config) return '⚙️';
			if (isRateLimited) return '⏱️';
			if (!hasPermission) return '🔒';
			return '❌';
		})();
		const errorRole = isRateLimited ? 'status' : 'alert';
		if (isLoading && showLoadingState) {
			$$renderer2.push('<!--[-->');
			$$renderer2.push(
				`<div class="flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-50 p-4 dark:border-gray-700 dark:bg-gray-800" role="status" aria-live="polite"><div class="h-4 w-4 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" aria-hidden="true"></div> <span class="text-sm text-gray-600 dark:text-gray-400">${escape_html(finalMessages.loadingPermissions)}</span></div>`
			);
		} else {
			$$renderer2.push('<!--[!-->');
			if (shouldShowContent) {
				$$renderer2.push('<!--[-->');
				children?.($$renderer2);
				$$renderer2.push(`<!---->`);
			} else {
				$$renderer2.push('<!--[!-->');
				if (fallback) {
					$$renderer2.push('<!--[-->');
					fallback($$renderer2);
					$$renderer2.push(`<!---->`);
				} else {
					$$renderer2.push('<!--[!-->');
					if (!silent && errorMessage) {
						$$renderer2.push('<!--[-->');
						$$renderer2.push(
							`<div${attr_class(`flex items-start gap-3 rounded-lg border p-4 ${stringify(isRateLimited ? 'border-warning-200 bg-warning-50 dark:border-warning-800 dark:bg-warning-900/20' : 'border-error-200 bg-error-50 dark:border-error-800 dark:bg-error-900/20')}`)}${attr('role', errorRole)} aria-live="polite"><span class="text-2xl" role="img"${attr('aria-label', isRateLimited ? 'Rate limited' : 'Access denied')}>${escape_html(errorIcon)}</span> <div class="flex-1"><h3${attr_class(`font-semibold ${stringify(isRateLimited ? 'text-warning-800 dark:text-warning-200' : 'text-error-800 dark:text-error-200')}`)}>${escape_html(isRateLimited ? 'Rate Limit Exceeded' : 'Access Denied')}</h3> <p${attr_class(`mt-1 text-sm ${stringify(isRateLimited ? 'text-warning-700 dark:text-warning-300' : 'text-error-700 dark:text-error-300')}`)}>${escape_html(errorMessage)}</p> `
						);
						if (!config && false) {
							$$renderer2.push('<!--[-->');
							$$renderer2.push(
								`<p class="mt-2 text-xs text-gray-500 dark:text-gray-400"><strong>Dev Note:</strong> No permission config provided. Pass a valid PermissionConfig object to this component.</p>`
							);
						} else {
							$$renderer2.push('<!--[!-->');
						}
						$$renderer2.push(`<!--]--></div></div>`);
					} else {
						$$renderer2.push('<!--[!-->');
					}
					$$renderer2.push(`<!--]-->`);
				}
				$$renderer2.push(`<!--]-->`);
			}
			$$renderer2.push(`<!--]-->`);
		}
		$$renderer2.push(`<!--]-->`);
	});
}
export { PermissionGuard as P };
//# sourceMappingURL=PermissionGuard.js.map
