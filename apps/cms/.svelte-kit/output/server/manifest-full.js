export const manifest = (() => {
	function __memo(fn) {
		let value;
		return () => (value ??= value = fn());
	}

	return {
		appDir: '_app',
		appPath: '_app',
		assets: new Set(['Default_User.svg', 'Spinner.svg', 'SveltyCMS.png', 'SveltyCMS_Logo.svg', 'robots.txt']),
		mimeTypes: { '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain' },
		_: {
			client: {
				start: '_app/immutable/entry/start.BafGuJ-Z.js',
				app: '_app/immutable/entry/app.CrSKIZW0.js',
				imports: [
					'_app/immutable/entry/start.BafGuJ-Z.js',
					'_app/immutable/chunks/DHPSYX_z.js',
					'_app/immutable/chunks/CMZtchEj.js',
					'_app/immutable/chunks/DrlZFkx8.js',
					'_app/immutable/chunks/rsSWfq8L.js',
					'_app/immutable/chunks/CTjXDULS.js',
					'_app/immutable/chunks/DhHAlOU0.js',
					'_app/immutable/chunks/B17Q6ahh.js',
					'_app/immutable/chunks/DvgRl2rN.js',
					'_app/immutable/chunks/XmViZn7X.js',
					'_app/immutable/entry/app.CrSKIZW0.js',
					'_app/immutable/chunks/PPVm8Dsz.js',
					'_app/immutable/chunks/B17Q6ahh.js',
					'_app/immutable/chunks/Bg__saH3.js',
					'_app/immutable/chunks/BvngfGKt.js',
					'_app/immutable/chunks/PsFRGuNZ.js',
					'_app/immutable/chunks/B_fImZOG.js',
					'_app/immutable/chunks/_c0O0354.js',
					'_app/immutable/chunks/DvgRl2rN.js',
					'_app/immutable/chunks/DrlZFkx8.js',
					'_app/immutable/chunks/rsSWfq8L.js',
					'_app/immutable/chunks/C9E6SjbS.js',
					'_app/immutable/chunks/DaWZu8wl.js',
					'_app/immutable/chunks/C-hhfhAN.js',
					'_app/immutable/chunks/BKIh0tuc.js',
					'_app/immutable/chunks/CTjXDULS.js',
					'_app/immutable/chunks/zi73tRJP.js',
					'_app/immutable/chunks/CMZtchEj.js',
					'_app/immutable/chunks/DhHAlOU0.js',
					'_app/immutable/chunks/7bh91wXp.js',
					'_app/immutable/chunks/YQp2a1pQ.js',
					'_app/immutable/chunks/DePHBZW_.js'
				],
				stylesheets: [],
				fonts: [],
				uses_env_dynamic_public: false
			},
			nodes: [
				__memo(() => import('./nodes/0.js')),
				__memo(() => import('./nodes/1.js')),
				__memo(() => import('./nodes/2.js')),
				__memo(() => import('./nodes/3.js')),
				__memo(() => import('./nodes/4.js')),
				__memo(() => import('./nodes/5.js')),
				__memo(() => import('./nodes/6.js')),
				__memo(() => import('./nodes/7.js')),
				__memo(() => import('./nodes/8.js')),
				__memo(() => import('./nodes/9.js')),
				__memo(() => import('./nodes/10.js')),
				__memo(() => import('./nodes/11.js')),
				__memo(() => import('./nodes/12.js')),
				__memo(() => import('./nodes/13.js')),
				__memo(() => import('./nodes/14.js')),
				__memo(() => import('./nodes/15.js')),
				__memo(() => import('./nodes/16.js')),
				__memo(() => import('./nodes/17.js')),
				__memo(() => import('./nodes/18.js')),
				__memo(() => import('./nodes/19.js')),
				__memo(() => import('./nodes/20.js')),
				__memo(() => import('./nodes/21.js')),
				__memo(() => import('./nodes/22.js')),
				__memo(() => import('./nodes/23.js'))
			],
			remotes: {},
			routes: [
				{
					id: '/',
					pattern: /^\/$/,
					params: [],
					page: { layouts: [0], errors: [1], leaf: 3 },
					endpoint: null
				},
				{
					id: '/api/admin/tokens',
					pattern: /^\/api\/admin\/tokens\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/admin/tokens/_server.ts.js'))
				},
				{
					id: '/api/admin/users',
					pattern: /^\/api\/admin\/users\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/admin/users/_server.ts.js'))
				},
				{
					id: '/api/auth/2fa/backup-codes',
					pattern: /^\/api\/auth\/2fa\/backup-codes\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/auth/2fa/backup-codes/_server.ts.js'))
				},
				{
					id: '/api/auth/2fa/disable',
					pattern: /^\/api\/auth\/2fa\/disable\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/auth/2fa/disable/_server.ts.js'))
				},
				{
					id: '/api/auth/2fa/setup',
					pattern: /^\/api\/auth\/2fa\/setup\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/auth/2fa/setup/_server.ts.js'))
				},
				{
					id: '/api/auth/2fa/verify-setup',
					pattern: /^\/api\/auth\/2fa\/verify-setup\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/auth/2fa/verify-setup/_server.ts.js'))
				},
				{
					id: '/api/auth/2fa/verify',
					pattern: /^\/api\/auth\/2fa\/verify\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/auth/2fa/verify/_server.ts.js'))
				},
				{
					id: '/api/cache/clear',
					pattern: /^\/api\/cache\/clear\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/cache/clear/_server.ts.js'))
				},
				{
					id: '/api/collections',
					pattern: /^\/api\/collections\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/collections/_server.ts.js'))
				},
				{
					id: '/api/collections/warm-cache',
					pattern: /^\/api\/collections\/warm-cache\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/collections/warm-cache/_server.ts.js'))
				},
				{
					id: '/api/collections/[collectionId]',
					pattern: /^\/api\/collections\/([^/]+?)\/?$/,
					params: [{ name: 'collectionId', optional: false, rest: false, chained: false }],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/collections/_collectionId_/_server.ts.js'))
				},
				{
					id: '/api/collections/[collectionId]/batch',
					pattern: /^\/api\/collections\/([^/]+?)\/batch\/?$/,
					params: [{ name: 'collectionId', optional: false, rest: false, chained: false }],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/collections/_collectionId_/batch/_server.ts.js'))
				},
				{
					id: '/api/collections/[collectionId]/export',
					pattern: /^\/api\/collections\/([^/]+?)\/export\/?$/,
					params: [{ name: 'collectionId', optional: false, rest: false, chained: false }],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/collections/_collectionId_/export/_server.ts.js'))
				},
				{
					id: '/api/collections/[collectionId]/import',
					pattern: /^\/api\/collections\/([^/]+?)\/import\/?$/,
					params: [{ name: 'collectionId', optional: false, rest: false, chained: false }],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/collections/_collectionId_/import/_server.ts.js'))
				},
				{
					id: '/api/collections/[collectionId]/[entryId]',
					pattern: /^\/api\/collections\/([^/]+?)\/([^/]+?)\/?$/,
					params: [
						{ name: 'collectionId', optional: false, rest: false, chained: false },
						{ name: 'entryId', optional: false, rest: false, chained: false }
					],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/collections/_collectionId_/_entryId_/_server.ts.js'))
				},
				{
					id: '/api/collections/[collectionId]/[entryId]/revisions',
					pattern: /^\/api\/collections\/([^/]+?)\/([^/]+?)\/revisions\/?$/,
					params: [
						{ name: 'collectionId', optional: false, rest: false, chained: false },
						{ name: 'entryId', optional: false, rest: false, chained: false }
					],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/collections/_collectionId_/_entryId_/revisions/_server.ts.js'))
				},
				{
					id: '/api/collections/[collectionId]/[entryId]/status',
					pattern: /^\/api\/collections\/([^/]+?)\/([^/]+?)\/status\/?$/,
					params: [
						{ name: 'collectionId', optional: false, rest: false, chained: false },
						{ name: 'entryId', optional: false, rest: false, chained: false }
					],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/collections/_collectionId_/_entryId_/status/_server.ts.js'))
				},
				{
					id: '/api/config_sync',
					pattern: /^\/api\/config_sync\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/config_sync/_server.ts.js'))
				},
				{
					id: '/api/content-structure',
					pattern: /^\/api\/content-structure\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/content-structure/_server.ts.js'))
				},
				{
					id: '/api/content/nodes',
					pattern: /^\/api\/content\/nodes\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/content/nodes/_server.ts.js'))
				},
				{
					id: '/api/content/version',
					pattern: /^\/api\/content\/version\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/content/version/_server.ts.js'))
				},
				{
					id: '/api/dashboard/cache-metrics',
					pattern: /^\/api\/dashboard\/cache-metrics\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/dashboard/cache-metrics/_server.ts.js'))
				},
				{
					id: '/api/dashboard/health',
					pattern: /^\/api\/dashboard\/health\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/dashboard/health/_server.ts.js'))
				},
				{
					id: '/api/dashboard/last5Content',
					pattern: /^\/api\/dashboard\/last5Content\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/dashboard/last5Content/_server.ts.js'))
				},
				{
					id: '/api/dashboard/last5media',
					pattern: /^\/api\/dashboard\/last5media\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/dashboard/last5media/_server.ts.js'))
				},
				{
					id: '/api/dashboard/logs',
					pattern: /^\/api\/dashboard\/logs\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/dashboard/logs/_server.ts.js'))
				},
				{
					id: '/api/dashboard/metrics',
					pattern: /^\/api\/dashboard\/metrics\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/dashboard/metrics/_server.ts.js'))
				},
				{
					id: '/api/dashboard/online_user',
					pattern: /^\/api\/dashboard\/online_user\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/dashboard/online_user/_server.ts.js'))
				},
				{
					id: '/api/dashboard/systemInfo',
					pattern: /^\/api\/dashboard\/systemInfo\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/dashboard/systemInfo/_server.ts.js'))
				},
				{
					id: '/api/dashboard/systemMessages',
					pattern: /^\/api\/dashboard\/systemMessages\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/dashboard/systemMessages/_server.ts.js'))
				},
				{
					id: '/api/database/pool-diagnostics',
					pattern: /^\/api\/database\/pool-diagnostics\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/database/pool-diagnostics/_server.ts.js'))
				},
				{
					id: '/api/export/full',
					pattern: /^\/api\/export\/full\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/export/full/_server.ts.js'))
				},
				{
					id: '/api/getTokensProvided',
					pattern: /^\/api\/getTokensProvided\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/getTokensProvided/_server.ts.js'))
				},
				{
					id: '/api/graphql',
					pattern: /^\/api\/graphql\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/graphql/_server.ts.js'))
				},
				{
					id: '/api/icon-proxy/[...path]',
					pattern: /^\/api\/icon-proxy(?:\/([^]*))?\/?$/,
					params: [{ name: 'path', optional: false, rest: true, chained: true }],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/icon-proxy/_...path_/_server.ts.js'))
				},
				{
					id: '/api/import/full',
					pattern: /^\/api\/import\/full\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/import/full/_server.ts.js'))
				},
				{
					id: '/api/logs/download',
					pattern: /^\/api\/logs\/download\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/logs/download/_server.ts.js'))
				},
				{
					id: '/api/marketplace/widgets',
					pattern: /^\/api\/marketplace\/widgets\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/marketplace/widgets/_server.ts.js'))
				},
				{
					id: '/api/media',
					pattern: /^\/api\/media\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/media/_server.ts.js'))
				},
				{
					id: '/api/media/ai-tag',
					pattern: /^\/api\/media\/ai-tag\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/media/ai-tag/_server.ts.js'))
				},
				{
					id: '/api/media/bulk-download',
					pattern: /^\/api\/media\/bulk-download\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/media/bulk-download/_server.ts.js'))
				},
				{
					id: '/api/media/delete',
					pattern: /^\/api\/media\/delete\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/media/delete/_server.ts.js'))
				},
				{
					id: '/api/media/exists',
					pattern: /^\/api\/media\/exists\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/media/exists/_server.ts.js'))
				},
				{
					id: '/api/media/external/[...path]',
					pattern: /^\/api\/media\/external(?:\/([^]*))?\/?$/,
					params: [{ name: 'path', optional: false, rest: true, chained: true }],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/media/external/_...path_/_server.ts.js'))
				},
				{
					id: '/api/media/get',
					pattern: /^\/api\/media\/get\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/media/get/_server.ts.js'))
				},
				{
					id: '/api/media/manipulate/[id]',
					pattern: /^\/api\/media\/manipulate\/([^/]+?)\/?$/,
					params: [{ name: 'id', optional: false, rest: false, chained: false }],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/media/manipulate/_id_/_server.ts.js'))
				},
				{
					id: '/api/media/process',
					pattern: /^\/api\/media\/process\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/media/process/_server.ts.js'))
				},
				{
					id: '/api/media/remote',
					pattern: /^\/api\/media\/remote\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/media/remote/_server.ts.js'))
				},
				{
					id: '/api/media/search',
					pattern: /^\/api\/media\/search\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/media/search/_server.ts.js'))
				},
				{
					id: '/api/media/transform/[...path]',
					pattern: /^\/api\/media\/transform(?:\/([^]*))?\/?$/,
					params: [{ name: 'path', optional: false, rest: true, chained: true }],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/media/transform/_...path_/_server.ts.js'))
				},
				{
					id: '/api/media/trash',
					pattern: /^\/api\/media\/trash\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/media/trash/_server.ts.js'))
				},
				{
					id: '/api/media/[id]',
					pattern: /^\/api\/media\/([^/]+?)\/?$/,
					params: [{ name: 'id', optional: false, rest: false, chained: false }],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/media/_id_/_server.ts.js'))
				},
				{
					id: '/api/media/[id]/focal',
					pattern: /^\/api\/media\/([^/]+?)\/focal\/?$/,
					params: [{ name: 'id', optional: false, rest: false, chained: false }],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/media/_id_/focal/_server.ts.js'))
				},
				{
					id: '/api/metrics',
					pattern: /^\/api\/metrics\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/metrics/_server.ts.js'))
				},
				{
					id: '/api/metrics/unified',
					pattern: /^\/api\/metrics\/unified\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/metrics/unified/_server.ts.js'))
				},
				{
					id: '/api/permission/update',
					pattern: /^\/api\/permission\/update\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/permission/update/_server.ts.js'))
				},
				{
					id: '/api/remoteVideo',
					pattern: /^\/api\/remoteVideo\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/remoteVideo/_server.ts.js'))
				},
				{
					id: '/api/search',
					pattern: /^\/api\/search\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/search/_server.ts.js'))
				},
				{
					id: '/api/security/csp-report',
					pattern: /^\/api\/security\/csp-report\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/security/csp-report/_server.ts.js'))
				},
				{
					id: '/api/security/incidents',
					pattern: /^\/api\/security\/incidents\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/security/incidents/_server.ts.js'))
				},
				{
					id: '/api/security/incidents/[id]/resolve',
					pattern: /^\/api\/security\/incidents\/([^/]+?)\/resolve\/?$/,
					params: [{ name: 'id', optional: false, rest: false, chained: false }],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/security/incidents/_id_/resolve/_server.ts.js'))
				},
				{
					id: '/api/security/stats',
					pattern: /^\/api\/security\/stats\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/security/stats/_server.ts.js'))
				},
				{
					id: '/api/security/unblock',
					pattern: /^\/api\/security\/unblock\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/security/unblock/_server.ts.js'))
				},
				{
					id: '/api/sendMail',
					pattern: /^\/api\/sendMail\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/sendMail/_server.ts.js'))
				},
				{
					id: '/api/settings/public',
					pattern: /^\/api\/settings\/public\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/settings/public/_server.ts.js'))
				},
				{
					id: '/api/settings/public/stream',
					pattern: /^\/api\/settings\/public\/stream\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/settings/public/stream/_server.ts.js'))
				},
				{
					id: '/api/settings/[group]',
					pattern: /^\/api\/settings\/([^/]+?)\/?$/,
					params: [{ name: 'group', optional: false, rest: false, chained: false }],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/settings/_group_/_server.ts.js'))
				},
				{
					id: '/api/systemPreferences',
					pattern: /^\/api\/systemPreferences\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/systemPreferences/_server.ts.js'))
				},
				{
					id: '/api/systemVirtualFolder',
					pattern: /^\/api\/systemVirtualFolder\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/systemVirtualFolder/_server.ts.js'))
				},
				{
					id: '/api/systemVirtualFolder/[id]',
					pattern: /^\/api\/systemVirtualFolder\/([^/]+?)\/?$/,
					params: [{ name: 'id', optional: false, rest: false, chained: false }],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/systemVirtualFolder/_id_/_server.ts.js'))
				},
				{
					id: '/api/systemsetting/export',
					pattern: /^\/api\/systemsetting\/export\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/systemsetting/export/_server.ts.js'))
				},
				{
					id: '/api/systemsetting/import',
					pattern: /^\/api\/systemsetting\/import\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/systemsetting/import/_server.ts.js'))
				},
				{
					id: '/api/system',
					pattern: /^\/api\/system\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/system/_server.ts.js'))
				},
				{
					id: '/api/system/health',
					pattern: /^\/api\/system\/health\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/system/health/_server.ts.js'))
				},
				{
					id: '/api/system/restart',
					pattern: /^\/api\/system\/restart\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/system/restart/_server.ts.js'))
				},
				{
					id: '/api/system/version',
					pattern: /^\/api\/system\/version\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/system/version/_server.ts.js'))
				},
				{
					id: '/api/telemetry/report',
					pattern: /^\/api\/telemetry\/report\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/telemetry/report/_server.ts.js'))
				},
				{
					id: '/api/telemetry/stats',
					pattern: /^\/api\/telemetry\/stats\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/telemetry/stats/_server.ts.js'))
				},
				{
					id: '/api/theme/get-current-theme',
					pattern: /^\/api\/theme\/get-current-theme\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/theme/get-current-theme/_server.ts.js'))
				},
				{
					id: '/api/theme/set-default',
					pattern: /^\/api\/theme\/set-default\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/theme/set-default/_server.ts.js'))
				},
				{
					id: '/api/theme/update-theme',
					pattern: /^\/api\/theme\/update-theme\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/theme/update-theme/_server.ts.js'))
				},
				{
					id: '/api/tokenBuilder/resolve',
					pattern: /^\/api\/tokenBuilder\/resolve\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/tokenBuilder/resolve/_server.ts.js'))
				},
				{
					id: '/api/token',
					pattern: /^\/api\/token\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/token/_server.ts.js'))
				},
				{
					id: '/api/token/batch',
					pattern: /^\/api\/token\/batch\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/token/batch/_server.ts.js'))
				},
				{
					id: '/api/token/createToken',
					pattern: /^\/api\/token\/createToken\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/token/createToken/_server.ts.js'))
				},
				{
					id: '/api/token/[tokenID]',
					pattern: /^\/api\/token\/([^/]+?)\/?$/,
					params: [{ name: 'tokenID', optional: false, rest: false, chained: false }],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/token/_tokenID_/_server.ts.js'))
				},
				{
					id: '/api/user/batch',
					pattern: /^\/api\/user\/batch\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/user/batch/_server.ts.js'))
				},
				{
					id: '/api/user/createUser',
					pattern: /^\/api\/user\/createUser\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/user/createUser/_server.ts.js'))
				},
				{
					id: '/api/user/deleteAvatar',
					pattern: /^\/api\/user\/deleteAvatar\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/user/deleteAvatar/_server.ts.js'))
				},
				{
					id: '/api/user/login',
					pattern: /^\/api\/user\/login\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/user/login/_server.ts.js'))
				},
				{
					id: '/api/user/logout',
					pattern: /^\/api\/user\/logout\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/user/logout/_server.ts.js'))
				},
				{
					id: '/api/user/saveAvatar',
					pattern: /^\/api\/user\/saveAvatar\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/user/saveAvatar/_server.ts.js'))
				},
				{
					id: '/api/user/updateUserAttributes',
					pattern: /^\/api\/user\/updateUserAttributes\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/user/updateUserAttributes/_server.ts.js'))
				},
				{
					id: '/api/version-check',
					pattern: /^\/api\/version-check\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/version-check/_server.ts.js'))
				},
				{
					id: '/api/website-tokens',
					pattern: /^\/api\/website-tokens\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/website-tokens/_server.ts.js'))
				},
				{
					id: '/api/website-tokens/[id]',
					pattern: /^\/api\/website-tokens\/([^/]+?)\/?$/,
					params: [{ name: 'id', optional: false, rest: false, chained: false }],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/website-tokens/_id_/_server.ts.js'))
				},
				{
					id: '/api/widgets/active',
					pattern: /^\/api\/widgets\/active\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/widgets/active/_server.ts.js'))
				},
				{
					id: '/api/widgets/installed',
					pattern: /^\/api\/widgets\/installed\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/widgets/installed/_server.ts.js'))
				},
				{
					id: '/api/widgets/install',
					pattern: /^\/api\/widgets\/install\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/widgets/install/_server.ts.js'))
				},
				{
					id: '/api/widgets/list',
					pattern: /^\/api\/widgets\/list\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/widgets/list/_server.ts.js'))
				},
				{
					id: '/api/widgets/required',
					pattern: /^\/api\/widgets\/required\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/widgets/required/_server.ts.js'))
				},
				{
					id: '/api/widgets/status',
					pattern: /^\/api\/widgets\/status\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/widgets/status/_server.ts.js'))
				},
				{
					id: '/api/widgets/sync',
					pattern: /^\/api\/widgets\/sync\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/widgets/sync/_server.ts.js'))
				},
				{
					id: '/api/widgets/uninstall',
					pattern: /^\/api\/widgets\/uninstall\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/widgets/uninstall/_server.ts.js'))
				},
				{
					id: '/api/widgets/validate',
					pattern: /^\/api\/widgets\/validate\/?$/,
					params: [],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/api/widgets/validate/_server.ts.js'))
				},
				{
					id: '/config',
					pattern: /^\/config\/?$/,
					params: [],
					page: { layouts: [0], errors: [1], leaf: 6 },
					endpoint: null
				},
				{
					id: '/config/accessManagement',
					pattern: /^\/config\/accessManagement\/?$/,
					params: [],
					page: { layouts: [0], errors: [1], leaf: 7 },
					endpoint: null
				},
				{
					id: '/config/collectionbuilder',
					pattern: /^\/config\/collectionbuilder\/?$/,
					params: [],
					page: { layouts: [0], errors: [1], leaf: 8 },
					endpoint: null
				},
				{
					id: '/config/collectionbuilder/[action]/[...contentPath]',
					pattern: /^\/config\/collectionbuilder\/([^/]+?)(?:\/([^]*))?\/?$/,
					params: [
						{ name: 'action', optional: false, rest: false, chained: false },
						{ name: 'contentPath', optional: false, rest: true, chained: true }
					],
					page: { layouts: [0], errors: [1], leaf: 9 },
					endpoint: null
				},
				{
					id: '/config/configurationManager',
					pattern: /^\/config\/configurationManager\/?$/,
					params: [],
					page: { layouts: [0], errors: [1], leaf: 10 },
					endpoint: null
				},
				{
					id: '/config/import-export',
					pattern: /^\/config\/import-export\/?$/,
					params: [],
					page: { layouts: [0], errors: [1], leaf: 11 },
					endpoint: null
				},
				{
					id: '/config/system-health',
					pattern: /^\/config\/system-health\/?$/,
					params: [],
					page: { layouts: [0], errors: [1], leaf: 12 },
					endpoint: null
				},
				{
					id: '/config/systemsetting',
					pattern: /^\/config\/systemsetting\/?$/,
					params: [],
					page: { layouts: [0], errors: [1], leaf: 13 },
					endpoint: null
				},
				{
					id: '/config/themeManagement',
					pattern: /^\/config\/themeManagement\/?$/,
					params: [],
					page: { layouts: [0], errors: [1], leaf: 14 },
					endpoint: null
				},
				{
					id: '/config/widgetManagement',
					pattern: /^\/config\/widgetManagement\/?$/,
					params: [],
					page: { layouts: [0], errors: [1], leaf: 15 },
					endpoint: null
				},
				{
					id: '/dashboard',
					pattern: /^\/dashboard\/?$/,
					params: [],
					page: { layouts: [0], errors: [1], leaf: 16 },
					endpoint: null
				},
				{
					id: '/email-previews',
					pattern: /^\/email-previews\/?$/,
					params: [],
					page: { layouts: [0], errors: [1], leaf: 17 },
					endpoint: null
				},
				{
					id: '/files/[...path]',
					pattern: /^\/files(?:\/([^]*))?\/?$/,
					params: [{ name: 'path', optional: false, rest: true, chained: true }],
					page: null,
					endpoint: __memo(() => import('./entries/endpoints/files/_...path_/_server.ts.js'))
				},
				{
					id: '/graphql-test',
					pattern: /^\/graphql-test\/?$/,
					params: [],
					page: { layouts: [0], errors: [1], leaf: 18 },
					endpoint: null
				},
				{
					id: '/login',
					pattern: /^\/login\/?$/,
					params: [],
					page: { layouts: [0], errors: [1], leaf: 19 },
					endpoint: null
				},
				{
					id: '/login/oauth',
					pattern: /^\/login\/oauth\/?$/,
					params: [],
					page: { layouts: [0], errors: [1], leaf: 20 },
					endpoint: null
				},
				{
					id: '/mediagallery',
					pattern: /^\/mediagallery\/?$/,
					params: [],
					page: { layouts: [0], errors: [1], leaf: 21 },
					endpoint: null
				},
				{
					id: '/mediagallery/uploadMedia',
					pattern: /^\/mediagallery\/uploadMedia\/?$/,
					params: [],
					page: { layouts: [0], errors: [1], leaf: 22 },
					endpoint: null
				},
				{
					id: '/user',
					pattern: /^\/user\/?$/,
					params: [],
					page: { layouts: [0], errors: [1], leaf: 23 },
					endpoint: null
				},
				{
					id: '/[language]',
					pattern: /^\/([^/]+?)\/?$/,
					params: [{ name: 'language', optional: false, rest: false, chained: false }],
					page: { layouts: [0, ,], errors: [1, 2], leaf: 4 },
					endpoint: null
				},
				{
					id: '/[language]/[...collection]',
					pattern: /^\/([^/]+?)(?:\/([^]*))?\/?$/,
					params: [
						{ name: 'language', optional: false, rest: false, chained: false },
						{ name: 'collection', optional: false, rest: true, chained: true }
					],
					page: { layouts: [0, ,], errors: [1, 2], leaf: 5 },
					endpoint: null
				}
			],
			prerendered_routes: new Set([]),
			matchers: async () => {
				return {};
			},
			server_assets: {}
		}
	};
})();
