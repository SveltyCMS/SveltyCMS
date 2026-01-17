import { d as escape_html, e as ensure_array_like, a as attr, g as attr_class } from '../../../chunks/index5.js';
import { P as PageTitle } from '../../../chunks/PageTitle.js';
import { P as PermissionGuard } from '../../../chunks/PermissionGuard.js';
import {
	p as config_pagetitle,
	q as config_body,
	r as config_collectionbuilder,
	s as config_graphql,
	u as config_emailpreviews1,
	v as dashboard,
	w as marketplace,
	x as config_widgetmanagement1,
	y as config_thememanagement1,
	z as config_settings,
	A as config_accessmanagement1
} from '../../../chunks/_index.js';
import '../../../chunks/collectionStore.svelte.js';
import '../../../chunks/UIStore.svelte.js';
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer2) => {
		const configItems = [
			{
				id: 'collectionbuilder',
				href: '/config/collectionbuilder',
				label: config_collectionbuilder(),
				icon: 'fluent-mdl2:build-definition',
				classes:
					'border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:border-primary-500 dark:hover:border-primary-500 text-surface-900 dark:text-white',
				iconColor: 'text-tertiary-600',
				permission: {
					contextId: 'config:collectionManagement',
					name: 'Collection Builder',
					description: 'Manage and build collections',
					requiredRole: 'admin',
					action: 'manage',
					contextType: 'configuration'
				}
			},
			{
				id: 'graphql',
				href: '/api/graphql',
				label: config_graphql(),
				icon: 'teenyicons:graphql-solid',
				classes:
					'border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:border-primary-500 dark:hover:border-primary-500 text-surface-900 dark:text-white',
				iconColor: 'text-warning-600',
				target: '_blank',
				permission: {
					contextId: 'api:graphql',
					name: 'GraphQL',
					description: 'Access GraphQL API',
					requiredRole: 'developer',
					action: 'access',
					contextType: 'system'
				}
			},
			{
				id: 'emailPreviews',
				href: '/email-previews',
				label: config_emailpreviews1(),
				icon: 'mdi:email-outline',
				classes:
					'border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:border-primary-500 dark:hover:border-primary-500 text-surface-900 dark:text-white',
				iconColor: 'text-primary-600',
				target: '_blank',
				permission: {
					contextId: 'system:admin',
					name: 'Email Previews',
					description: 'Preview system emails',
					requiredRole: 'admin',
					action: 'access',
					contextType: 'system'
				}
			},
			{
				id: 'dashboard',
				href: '/dashboard',
				label: dashboard(),
				icon: 'bi:bar-chart-line',
				classes:
					'border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:border-primary-500 dark:hover:border-primary-500 text-surface-900 dark:text-white',
				iconColor: 'text-error-600',
				permission: {
					contextId: 'system:dashboard',
					name: 'Dashboard',
					description: 'Access system dashboard',
					requiredRole: 'user',
					action: 'access',
					contextType: 'system'
				}
			},
			{
				id: 'marketplace',
				href: 'https://www.sveltyCMS.com',
				label: marketplace(),
				icon: 'icon-park-outline:shopping-bag',
				classes:
					'border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:border-primary-500 dark:hover:border-primary-500 text-surface-900 dark:text-white',
				iconColor: 'text-secondary-500',
				target: '_blank',
				permission: null
			},
			{
				id: 'widgetManagement',
				href: '/config/widgetManagement',
				label: config_widgetmanagement1(),
				icon: 'mdi:widgets',
				classes:
					'border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:border-primary-500 dark:hover:border-primary-500 text-surface-900 dark:text-white',
				iconColor: 'text-tertiary-500',
				permission: {
					contextId: 'config:widgetManagement',
					name: 'Widget Management',
					description: 'Manage system widgets',
					requiredRole: 'admin',
					action: 'manage',
					contextType: 'configuration'
				}
			},
			{
				id: 'themeManagement',
				href: '/config/themeManagement',
				label: config_thememanagement1(),
				icon: 'ph:layout',
				classes:
					'border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:border-primary-500 dark:hover:border-primary-500 text-surface-900 dark:text-white',
				iconColor: 'text-primary-500',
				permission: {
					contextId: 'config:themeManagement',
					name: 'Theme Management',
					description: 'Manage system themes',
					requiredRole: 'admin',
					action: 'manage',
					contextType: 'configuration'
				}
			},
			{
				id: 'settings',
				href: '/config/systemsetting',
				label: config_settings(),
				icon: 'uil:setting',
				classes:
					'border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:border-primary-500 dark:hover:border-primary-500 text-surface-900 dark:text-white',
				iconColor: 'text-surface-500',
				permission: {
					// FIX: Changed from 'system:settings' to 'config:settings' to match +page.server.ts
					contextId: 'config:settings',
					name: 'Settings',
					description: 'Manage system settings',
					requiredRole: 'admin',
					action: 'manage',
					contextType: 'system'
				}
			},
			{
				id: 'importExport',
				href: '/config/import-export',
				label: 'Import & Export',
				icon: 'mdi:database-import',
				classes:
					'border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:border-primary-500 dark:hover:border-primary-500 text-surface-900 dark:text-white',
				iconColor: 'text-warning-500',
				permission: {
					contextId: 'config:importExport',
					name: 'Import & Export',
					description: 'Import and export system data',
					requiredRole: 'admin',
					action: 'manage',
					contextType: 'system'
				}
			},
			// START: New Configuration Manager Button
			{
				id: 'configurationManager',
				href: '/config/configurationManager',
				label: 'Config Manager',
				icon: 'mdi:sync-circle',
				classes:
					'border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:border-primary-500 dark:hover:border-primary-500 text-surface-900 dark:text-white',
				iconColor: 'text-secondary-500',
				permission: {
					contextId: 'config:synchronization',
					name: 'Configuration Manager',
					description: 'Synchronize configuration between filesystem and database.',
					requiredRole: 'admin',
					action: 'manage',
					contextType: 'system'
				}
			},
			// END: New Configuration Manager Button
			// START: System Health Monitor
			{
				id: 'systemHealth',
				href: '/config/system-health',
				label: 'System Health',
				icon: 'mdi:heart-pulse',
				classes:
					'border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:border-primary-500 dark:hover:border-primary-500 text-surface-900 dark:text-white',
				iconColor: 'text-success-500',
				permission: {
					contextId: 'config:systemHealth',
					name: 'System Health',
					description: 'Monitor system services and health status',
					requiredRole: 'admin',
					action: 'view',
					contextType: 'system'
				}
			},
			// END: System Health Monitor
			{
				id: 'accessManagement',
				// FIX: Corrected typo from 'assessManagement'
				href: '/config/accessManagement',
				label: config_accessmanagement1(),
				icon: 'mdi:account-group',
				classes:
					'border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:border-primary-500 dark:hover:border-primary-500 text-surface-900 dark:text-white',
				iconColor: 'text-error-500',
				permission: {
					contextId: 'config:accessManagement',
					name: 'Access Management',
					description: 'Manage user access and roles',
					requiredRole: 'admin',
					action: 'manage',
					contextType: 'configuration'
				}
			}
		];
		PageTitle($$renderer2, {
			name: config_pagetitle(),
			showBackButton: true,
			backUrl: '/',
			icon: 'material-symbols:build-circle'
		});
		$$renderer2.push(
			`<!----> <div class="wrapper mb-2 max-h-[calc(100vh-65px)] overflow-auto p-2"><h2 class="h2 mb-4 text-center font-bold text-tertiary-600 dark:text-primary-500">${escape_html(config_body())}</h2> <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"><!--[-->`
		);
		const each_array = ensure_array_like(configItems);
		for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
			let item = each_array[$$index];
			const usePermissionGuard = !!item.permission;
			if (usePermissionGuard) {
				$$renderer2.push('<!--[-->');
				PermissionGuard($$renderer2, {
					config: item.permission,
					children: ($$renderer3) => {
						$$renderer3.push(
							`<a${attr('href', item.href)}${attr_class(`flex h-24 flex-col items-center justify-center gap-2 rounded p-2 text-center shadow-md transition-all duration-200 ease-in-out hover:scale-105 hover:shadow-lg lg:h-20 ${item.classes}`)}${attr('aria-label', item.label)}${attr('target', item.target)}${attr('rel', item.target === '_blank' ? 'noopener noreferrer' : void 0)}${attr('data-sveltekit-preload-data', item.target === '_blank' ? void 0 : 'hover')}><iconify-icon${attr('icon', item.icon)}${attr_class(`text-3xl lg:text-2xl ${item.iconColor || ''}`)}></iconify-icon> <p class="w-full truncate text-xs font-medium uppercase lg:text-sm">${escape_html(item.label)}</p></a>`
						);
					}
				});
			} else {
				$$renderer2.push('<!--[!-->');
				$$renderer2.push(
					`<a${attr('href', item.href)}${attr_class(`flex h-24 flex-col items-center justify-center gap-2 rounded p-2 text-center shadow-md transition-all duration-200 ease-in-out hover:scale-105 hover:shadow-lg lg:h-20 ${item.classes}`)}${attr('aria-label', item.label)}${attr('target', item.target)}${attr('rel', item.target === '_blank' ? 'noopener noreferrer' : void 0)}${attr('data-sveltekit-preload-data', item.target === '_blank' ? void 0 : 'hover')}><iconify-icon${attr('icon', item.icon)}${attr_class(`text-3xl lg:text-2xl ${item.iconColor || ''}`)}></iconify-icon> <p class="w-full truncate text-xs font-medium uppercase lg:text-sm">${escape_html(item.label)}</p></a>`
				);
			}
			$$renderer2.push(`<!--]-->`);
		}
		$$renderer2.push(`<!--]--></div></div>`);
	});
}
export { _page as default };
//# sourceMappingURL=_page.svelte.js.map
