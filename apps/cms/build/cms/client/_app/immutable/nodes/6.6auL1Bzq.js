import { i as j } from '../chunks/zi73tRJP.js';
import { o as B } from '../chunks/CMZtchEj.js';
import { p as z, f as C, g as e, u as q, s as f, c, t as l, a as L, r as s } from '../chunks/DrlZFkx8.js';
import { d as Q, f as h, s as u, a as g, c as W } from '../chunks/CTjXDULS.js';
import { e as D } from '../chunks/BXe5mj2j.js';
import { b as I, a as o, c as p } from '../chunks/MEFvoR_D.js';
import { P as U } from '../chunks/C6jjkVLf.js';
import { P as F } from '../chunks/Ds4HF5TW.js';
import { c as J, d as K, f as N, g as O, m as V, h as X, i as Y, j as Z, k as ee, l as re, n as ae } from '../chunks/N8Jg0v49.js';
import { c as te, u as oe } from '../chunks/-PV6rnhC.js';
var ie = h('<a><iconify-icon></iconify-icon> <p class="w-full truncate text-xs font-medium uppercase lg:text-sm"> </p></a>', 2),
	se = h('<a><iconify-icon></iconify-icon> <p class="w-full truncate text-xs font-medium uppercase lg:text-sm"> </p></a>', 2),
	ne = h(
		'<!> <div class="wrapper mb-2 max-h-[calc(100vh-65px)] overflow-auto p-2"><h2 class="h2 mb-4 text-center font-bold text-tertiary-600 dark:text-primary-500"> </h2> <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4"></div></div>',
		1
	);
function xe(T, R) {
	(z(R, !0),
		B(() => {
			te.setCollection(null);
		}));
	function x() {
		typeof window < 'u' && window.innerWidth < 768 && oe.toggle('leftSidebar', 'hidden');
	}
	const P = [
		{
			id: 'collectionbuilder',
			href: '/config/collectionbuilder',
			label: J(),
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
			label: K(),
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
			label: N(),
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
			label: O(),
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
			label: V(),
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
			label: X(),
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
			label: Y(),
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
			label: Z(),
			icon: 'uil:setting',
			classes:
				'border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 hover:border-primary-500 dark:hover:border-primary-500 text-surface-900 dark:text-white',
			iconColor: 'text-surface-500',
			permission: {
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
		{
			id: 'accessManagement',
			href: '/config/accessManagement',
			label: ee(),
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
	var y = ne(),
		v = C(y);
	{
		let i = q(() => ae());
		U(v, {
			get name() {
				return e(i);
			},
			showBackButton: !0,
			backUrl: '/',
			icon: 'material-symbols:build-circle'
		});
	}
	var k = f(v, 2),
		b = c(k),
		S = c(b, !0);
	s(b);
	var w = f(b, 2);
	(D(
		w,
		21,
		() => P,
		(i) => i.id,
		(i, r) => {
			const $ = q(() => !!e(r).permission);
			var _ = W(),
				E = C(_);
			{
				var A = (n) => {
						F(n, {
							get config() {
								return e(r).permission;
							},
							children: (t, m) => {
								var a = ie();
								a.__click = x;
								var d = c(a);
								l(() => I(d, 'icon', e(r).icon));
								var M = f(d, 2),
									H = c(M, !0);
								(s(M),
									s(a),
									l(() => {
										(o(a, 'href', e(r).href),
											p(
												a,
												1,
												`flex h-24 flex-col items-center justify-center gap-2 rounded p-2 text-center shadow-md transition-all duration-200 ease-in-out hover:scale-105 hover:shadow-lg lg:h-20 ${e(r).classes}`
											),
											o(a, 'aria-label', e(r).label),
											o(a, 'target', e(r).target),
											o(a, 'rel', e(r).target === '_blank' ? 'noopener noreferrer' : void 0),
											o(a, 'data-sveltekit-preload-data', e(r).target === '_blank' ? void 0 : 'hover'),
											p(d, 1, `text-3xl lg:text-2xl ${e(r).iconColor || ''}`),
											u(H, e(r).label));
									}),
									g(t, a));
							},
							$$slots: { default: !0 }
						});
					},
					G = (n) => {
						var t = se();
						t.__click = x;
						var m = c(t);
						l(() => I(m, 'icon', e(r).icon));
						var a = f(m, 2),
							d = c(a, !0);
						(s(a),
							s(t),
							l(() => {
								(o(t, 'href', e(r).href),
									p(
										t,
										1,
										`flex h-24 flex-col items-center justify-center gap-2 rounded p-2 text-center shadow-md transition-all duration-200 ease-in-out hover:scale-105 hover:shadow-lg lg:h-20 ${e(r).classes}`
									),
									o(t, 'aria-label', e(r).label),
									o(t, 'target', e(r).target),
									o(t, 'rel', e(r).target === '_blank' ? 'noopener noreferrer' : void 0),
									o(t, 'data-sveltekit-preload-data', e(r).target === '_blank' ? void 0 : 'hover'),
									p(m, 1, `text-3xl lg:text-2xl ${e(r).iconColor || ''}`),
									u(d, e(r).label));
							}),
							g(n, t));
					};
				j(E, (n) => {
					e($) ? n(A) : n(G, !1);
				});
			}
			g(i, _);
		}
	),
		s(w),
		s(k),
		l((i) => u(S, i), [() => re()]),
		g(T, y),
		L());
}
Q(['click']);
export { xe as component };
//# sourceMappingURL=6.6auL1Bzq.js.map
