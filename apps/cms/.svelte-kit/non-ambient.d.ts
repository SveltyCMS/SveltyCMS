
// this file is generated — do not edit it


declare module "svelte/elements" {
	export interface HTMLAttributes<T> {
		'data-sveltekit-keepfocus'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-noscroll'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-preload-code'?:
			| true
			| ''
			| 'eager'
			| 'viewport'
			| 'hover'
			| 'tap'
			| 'off'
			| undefined
			| null;
		'data-sveltekit-preload-data'?: true | '' | 'hover' | 'tap' | 'off' | undefined | null;
		'data-sveltekit-reload'?: true | '' | 'off' | undefined | null;
		'data-sveltekit-replacestate'?: true | '' | 'off' | undefined | null;
	}
}

export {};


declare module "$app/types" {
	export interface AppTypes {
		RouteId(): "/" | "/api" | "/api/admin" | "/api/admin/tokens" | "/api/admin/users" | "/api/auth" | "/api/auth/2fa" | "/api/auth/2fa/backup-codes" | "/api/auth/2fa/disable" | "/api/auth/2fa/setup" | "/api/auth/2fa/verify-setup" | "/api/auth/2fa/verify" | "/api/cache" | "/api/cache/clear" | "/api/collections" | "/api/collections/warm-cache" | "/api/collections/[collectionId]" | "/api/collections/[collectionId]/batch" | "/api/collections/[collectionId]/export" | "/api/collections/[collectionId]/import" | "/api/collections/[collectionId]/[entryId]" | "/api/collections/[collectionId]/[entryId]/revisions" | "/api/collections/[collectionId]/[entryId]/status" | "/api/config_sync" | "/api/content-structure" | "/api/content" | "/api/content/nodes" | "/api/content/version" | "/api/dashboard" | "/api/dashboard/cache-metrics" | "/api/dashboard/health" | "/api/dashboard/last5Content" | "/api/dashboard/last5media" | "/api/dashboard/logs" | "/api/dashboard/metrics" | "/api/dashboard/online_user" | "/api/dashboard/systemInfo" | "/api/dashboard/systemMessages" | "/api/database" | "/api/database/pool-diagnostics" | "/api/export" | "/api/export/full" | "/api/getTokensProvided" | "/api/graphql" | "/api/graphql/resolvers" | "/api/icon-proxy" | "/api/icon-proxy/[...path]" | "/api/import" | "/api/import/full" | "/api/logs" | "/api/logs/download" | "/api/marketplace" | "/api/marketplace/widgets" | "/api/media" | "/api/media/ai-tag" | "/api/media/bulk-download" | "/api/media/delete" | "/api/media/exists" | "/api/media/external" | "/api/media/external/[...path]" | "/api/media/get" | "/api/media/manipulate" | "/api/media/manipulate/[id]" | "/api/media/process" | "/api/media/remote" | "/api/media/search" | "/api/media/transform" | "/api/media/transform/[...path]" | "/api/media/trash" | "/api/media/[id]" | "/api/media/[id]/focal" | "/api/metrics" | "/api/metrics/unified" | "/api/permission" | "/api/permission/update" | "/api/remoteVideo" | "/api/search" | "/api/security" | "/api/security/csp-report" | "/api/security/incidents" | "/api/security/incidents/[id]" | "/api/security/incidents/[id]/resolve" | "/api/security/stats" | "/api/security/unblock" | "/api/sendMail" | "/api/settings" | "/api/settings/public" | "/api/settings/public/stream" | "/api/settings/[group]" | "/api/systemPreferences" | "/api/systemVirtualFolder" | "/api/systemVirtualFolder/[id]" | "/api/systemsetting" | "/api/systemsetting/export" | "/api/systemsetting/import" | "/api/system" | "/api/system/health" | "/api/system/restart" | "/api/system/version" | "/api/telemetry" | "/api/telemetry/report" | "/api/telemetry/stats" | "/api/theme" | "/api/theme/get-current-theme" | "/api/theme/set-default" | "/api/theme/update-theme" | "/api/tokenBuilder" | "/api/tokenBuilder/resolve" | "/api/token" | "/api/token/batch" | "/api/token/createToken" | "/api/token/[tokenID]" | "/api/user" | "/api/user/batch" | "/api/user/createUser" | "/api/user/deleteAvatar" | "/api/user/login" | "/api/user/logout" | "/api/user/saveAvatar" | "/api/user/updateUserAttributes" | "/api/version-check" | "/api/website-tokens" | "/api/website-tokens/[id]" | "/api/widgets" | "/api/widgets/active" | "/api/widgets/installed" | "/api/widgets/install" | "/api/widgets/list" | "/api/widgets/required" | "/api/widgets/status" | "/api/widgets/sync" | "/api/widgets/uninstall" | "/api/widgets/validate" | "/config" | "/config/accessManagement" | "/config/collectionbuilder" | "/config/collectionbuilder/NestedContent" | "/config/collectionbuilder/[action]" | "/config/collectionbuilder/[action]/[...contentPath]/tabs" | "/config/collectionbuilder/[action]/[...contentPath]/tabs/CollectionWidget" | "/config/collectionbuilder/[action]/[...contentPath]/tabs/CollectionWidget/tabsFields" | "/config/collectionbuilder/[action]/[...contentPath]" | "/config/components" | "/config/configurationManager" | "/config/import-export" | "/config/system-health" | "/config/systemsetting" | "/config/themeManagement" | "/config/widgetManagement" | "/dashboard" | "/email-previews" | "/files" | "/files/[...path]" | "/graphql-test" | "/login" | "/login/components" | "/login/components/icons" | "/login/oauth" | "/mediagallery" | "/mediagallery/uploadMedia" | "/user" | "/[language]" | "/[language]/[...collection]";
		RouteParams(): {
			"/api/collections/[collectionId]": { collectionId: string };
			"/api/collections/[collectionId]/batch": { collectionId: string };
			"/api/collections/[collectionId]/export": { collectionId: string };
			"/api/collections/[collectionId]/import": { collectionId: string };
			"/api/collections/[collectionId]/[entryId]": { collectionId: string; entryId: string };
			"/api/collections/[collectionId]/[entryId]/revisions": { collectionId: string; entryId: string };
			"/api/collections/[collectionId]/[entryId]/status": { collectionId: string; entryId: string };
			"/api/icon-proxy/[...path]": { path: string };
			"/api/media/external/[...path]": { path: string };
			"/api/media/manipulate/[id]": { id: string };
			"/api/media/transform/[...path]": { path: string };
			"/api/media/[id]": { id: string };
			"/api/media/[id]/focal": { id: string };
			"/api/security/incidents/[id]": { id: string };
			"/api/security/incidents/[id]/resolve": { id: string };
			"/api/settings/[group]": { group: string };
			"/api/systemVirtualFolder/[id]": { id: string };
			"/api/token/[tokenID]": { tokenID: string };
			"/api/website-tokens/[id]": { id: string };
			"/config/collectionbuilder/[action]": { action: string };
			"/config/collectionbuilder/[action]/[...contentPath]/tabs": { action: string; contentPath: string };
			"/config/collectionbuilder/[action]/[...contentPath]/tabs/CollectionWidget": { action: string; contentPath: string };
			"/config/collectionbuilder/[action]/[...contentPath]/tabs/CollectionWidget/tabsFields": { action: string; contentPath: string };
			"/config/collectionbuilder/[action]/[...contentPath]": { action: string; contentPath: string };
			"/files/[...path]": { path: string };
			"/[language]": { language: string };
			"/[language]/[...collection]": { language: string; collection: string }
		};
		LayoutParams(): {
			"/": { collectionId?: string; entryId?: string; path?: string; id?: string; group?: string; tokenID?: string; action?: string; contentPath?: string; language?: string; collection?: string };
			"/api": { collectionId?: string; entryId?: string; path?: string; id?: string; group?: string; tokenID?: string };
			"/api/admin": Record<string, never>;
			"/api/admin/tokens": Record<string, never>;
			"/api/admin/users": Record<string, never>;
			"/api/auth": Record<string, never>;
			"/api/auth/2fa": Record<string, never>;
			"/api/auth/2fa/backup-codes": Record<string, never>;
			"/api/auth/2fa/disable": Record<string, never>;
			"/api/auth/2fa/setup": Record<string, never>;
			"/api/auth/2fa/verify-setup": Record<string, never>;
			"/api/auth/2fa/verify": Record<string, never>;
			"/api/cache": Record<string, never>;
			"/api/cache/clear": Record<string, never>;
			"/api/collections": { collectionId?: string; entryId?: string };
			"/api/collections/warm-cache": Record<string, never>;
			"/api/collections/[collectionId]": { collectionId: string; entryId?: string };
			"/api/collections/[collectionId]/batch": { collectionId: string };
			"/api/collections/[collectionId]/export": { collectionId: string };
			"/api/collections/[collectionId]/import": { collectionId: string };
			"/api/collections/[collectionId]/[entryId]": { collectionId: string; entryId: string };
			"/api/collections/[collectionId]/[entryId]/revisions": { collectionId: string; entryId: string };
			"/api/collections/[collectionId]/[entryId]/status": { collectionId: string; entryId: string };
			"/api/config_sync": Record<string, never>;
			"/api/content-structure": Record<string, never>;
			"/api/content": Record<string, never>;
			"/api/content/nodes": Record<string, never>;
			"/api/content/version": Record<string, never>;
			"/api/dashboard": Record<string, never>;
			"/api/dashboard/cache-metrics": Record<string, never>;
			"/api/dashboard/health": Record<string, never>;
			"/api/dashboard/last5Content": Record<string, never>;
			"/api/dashboard/last5media": Record<string, never>;
			"/api/dashboard/logs": Record<string, never>;
			"/api/dashboard/metrics": Record<string, never>;
			"/api/dashboard/online_user": Record<string, never>;
			"/api/dashboard/systemInfo": Record<string, never>;
			"/api/dashboard/systemMessages": Record<string, never>;
			"/api/database": Record<string, never>;
			"/api/database/pool-diagnostics": Record<string, never>;
			"/api/export": Record<string, never>;
			"/api/export/full": Record<string, never>;
			"/api/getTokensProvided": Record<string, never>;
			"/api/graphql": Record<string, never>;
			"/api/graphql/resolvers": Record<string, never>;
			"/api/icon-proxy": { path?: string };
			"/api/icon-proxy/[...path]": { path: string };
			"/api/import": Record<string, never>;
			"/api/import/full": Record<string, never>;
			"/api/logs": Record<string, never>;
			"/api/logs/download": Record<string, never>;
			"/api/marketplace": Record<string, never>;
			"/api/marketplace/widgets": Record<string, never>;
			"/api/media": { path?: string; id?: string };
			"/api/media/ai-tag": Record<string, never>;
			"/api/media/bulk-download": Record<string, never>;
			"/api/media/delete": Record<string, never>;
			"/api/media/exists": Record<string, never>;
			"/api/media/external": { path?: string };
			"/api/media/external/[...path]": { path: string };
			"/api/media/get": Record<string, never>;
			"/api/media/manipulate": { id?: string };
			"/api/media/manipulate/[id]": { id: string };
			"/api/media/process": Record<string, never>;
			"/api/media/remote": Record<string, never>;
			"/api/media/search": Record<string, never>;
			"/api/media/transform": { path?: string };
			"/api/media/transform/[...path]": { path: string };
			"/api/media/trash": Record<string, never>;
			"/api/media/[id]": { id: string };
			"/api/media/[id]/focal": { id: string };
			"/api/metrics": Record<string, never>;
			"/api/metrics/unified": Record<string, never>;
			"/api/permission": Record<string, never>;
			"/api/permission/update": Record<string, never>;
			"/api/remoteVideo": Record<string, never>;
			"/api/search": Record<string, never>;
			"/api/security": { id?: string };
			"/api/security/csp-report": Record<string, never>;
			"/api/security/incidents": { id?: string };
			"/api/security/incidents/[id]": { id: string };
			"/api/security/incidents/[id]/resolve": { id: string };
			"/api/security/stats": Record<string, never>;
			"/api/security/unblock": Record<string, never>;
			"/api/sendMail": Record<string, never>;
			"/api/settings": { group?: string };
			"/api/settings/public": Record<string, never>;
			"/api/settings/public/stream": Record<string, never>;
			"/api/settings/[group]": { group: string };
			"/api/systemPreferences": Record<string, never>;
			"/api/systemVirtualFolder": { id?: string };
			"/api/systemVirtualFolder/[id]": { id: string };
			"/api/systemsetting": Record<string, never>;
			"/api/systemsetting/export": Record<string, never>;
			"/api/systemsetting/import": Record<string, never>;
			"/api/system": { id?: string };
			"/api/system/health": Record<string, never>;
			"/api/system/restart": Record<string, never>;
			"/api/system/version": Record<string, never>;
			"/api/telemetry": Record<string, never>;
			"/api/telemetry/report": Record<string, never>;
			"/api/telemetry/stats": Record<string, never>;
			"/api/theme": Record<string, never>;
			"/api/theme/get-current-theme": Record<string, never>;
			"/api/theme/set-default": Record<string, never>;
			"/api/theme/update-theme": Record<string, never>;
			"/api/tokenBuilder": Record<string, never>;
			"/api/tokenBuilder/resolve": Record<string, never>;
			"/api/token": { tokenID?: string };
			"/api/token/batch": Record<string, never>;
			"/api/token/createToken": Record<string, never>;
			"/api/token/[tokenID]": { tokenID: string };
			"/api/user": Record<string, never>;
			"/api/user/batch": Record<string, never>;
			"/api/user/createUser": Record<string, never>;
			"/api/user/deleteAvatar": Record<string, never>;
			"/api/user/login": Record<string, never>;
			"/api/user/logout": Record<string, never>;
			"/api/user/saveAvatar": Record<string, never>;
			"/api/user/updateUserAttributes": Record<string, never>;
			"/api/version-check": Record<string, never>;
			"/api/website-tokens": { id?: string };
			"/api/website-tokens/[id]": { id: string };
			"/api/widgets": Record<string, never>;
			"/api/widgets/active": Record<string, never>;
			"/api/widgets/installed": Record<string, never>;
			"/api/widgets/install": Record<string, never>;
			"/api/widgets/list": Record<string, never>;
			"/api/widgets/required": Record<string, never>;
			"/api/widgets/status": Record<string, never>;
			"/api/widgets/sync": Record<string, never>;
			"/api/widgets/uninstall": Record<string, never>;
			"/api/widgets/validate": Record<string, never>;
			"/config": { action?: string; contentPath?: string };
			"/config/accessManagement": Record<string, never>;
			"/config/collectionbuilder": { action?: string; contentPath?: string };
			"/config/collectionbuilder/NestedContent": Record<string, never>;
			"/config/collectionbuilder/[action]": { action: string; contentPath?: string };
			"/config/collectionbuilder/[action]/[...contentPath]/tabs": { action: string; contentPath: string };
			"/config/collectionbuilder/[action]/[...contentPath]/tabs/CollectionWidget": { action: string; contentPath: string };
			"/config/collectionbuilder/[action]/[...contentPath]/tabs/CollectionWidget/tabsFields": { action: string; contentPath: string };
			"/config/collectionbuilder/[action]/[...contentPath]": { action: string; contentPath: string };
			"/config/components": Record<string, never>;
			"/config/configurationManager": Record<string, never>;
			"/config/import-export": Record<string, never>;
			"/config/system-health": Record<string, never>;
			"/config/systemsetting": Record<string, never>;
			"/config/themeManagement": Record<string, never>;
			"/config/widgetManagement": Record<string, never>;
			"/dashboard": Record<string, never>;
			"/email-previews": Record<string, never>;
			"/files": { path?: string };
			"/files/[...path]": { path: string };
			"/graphql-test": Record<string, never>;
			"/login": Record<string, never>;
			"/login/components": Record<string, never>;
			"/login/components/icons": Record<string, never>;
			"/login/oauth": Record<string, never>;
			"/mediagallery": Record<string, never>;
			"/mediagallery/uploadMedia": Record<string, never>;
			"/user": Record<string, never>;
			"/[language]": { language: string; collection?: string };
			"/[language]/[...collection]": { language: string; collection: string }
		};
		Pathname(): "/" | "/api" | "/api/" | "/api/admin" | "/api/admin/" | "/api/admin/tokens" | "/api/admin/tokens/" | "/api/admin/users" | "/api/admin/users/" | "/api/auth" | "/api/auth/" | "/api/auth/2fa" | "/api/auth/2fa/" | "/api/auth/2fa/backup-codes" | "/api/auth/2fa/backup-codes/" | "/api/auth/2fa/disable" | "/api/auth/2fa/disable/" | "/api/auth/2fa/setup" | "/api/auth/2fa/setup/" | "/api/auth/2fa/verify-setup" | "/api/auth/2fa/verify-setup/" | "/api/auth/2fa/verify" | "/api/auth/2fa/verify/" | "/api/cache" | "/api/cache/" | "/api/cache/clear" | "/api/cache/clear/" | "/api/collections" | "/api/collections/" | "/api/collections/warm-cache" | "/api/collections/warm-cache/" | `/api/collections/${string}` & {} | `/api/collections/${string}/` & {} | `/api/collections/${string}/batch` & {} | `/api/collections/${string}/batch/` & {} | `/api/collections/${string}/export` & {} | `/api/collections/${string}/export/` & {} | `/api/collections/${string}/import` & {} | `/api/collections/${string}/import/` & {} | `/api/collections/${string}/${string}` & {} | `/api/collections/${string}/${string}/` & {} | `/api/collections/${string}/${string}/revisions` & {} | `/api/collections/${string}/${string}/revisions/` & {} | `/api/collections/${string}/${string}/status` & {} | `/api/collections/${string}/${string}/status/` & {} | "/api/config_sync" | "/api/config_sync/" | "/api/content-structure" | "/api/content-structure/" | "/api/content" | "/api/content/" | "/api/content/nodes" | "/api/content/nodes/" | "/api/content/version" | "/api/content/version/" | "/api/dashboard" | "/api/dashboard/" | "/api/dashboard/cache-metrics" | "/api/dashboard/cache-metrics/" | "/api/dashboard/health" | "/api/dashboard/health/" | "/api/dashboard/last5Content" | "/api/dashboard/last5Content/" | "/api/dashboard/last5media" | "/api/dashboard/last5media/" | "/api/dashboard/logs" | "/api/dashboard/logs/" | "/api/dashboard/metrics" | "/api/dashboard/metrics/" | "/api/dashboard/online_user" | "/api/dashboard/online_user/" | "/api/dashboard/systemInfo" | "/api/dashboard/systemInfo/" | "/api/dashboard/systemMessages" | "/api/dashboard/systemMessages/" | "/api/database" | "/api/database/" | "/api/database/pool-diagnostics" | "/api/database/pool-diagnostics/" | "/api/export" | "/api/export/" | "/api/export/full" | "/api/export/full/" | "/api/getTokensProvided" | "/api/getTokensProvided/" | "/api/graphql" | "/api/graphql/" | "/api/graphql/resolvers" | "/api/graphql/resolvers/" | "/api/icon-proxy" | "/api/icon-proxy/" | `/api/icon-proxy/${string}` & {} | `/api/icon-proxy/${string}/` & {} | "/api/import" | "/api/import/" | "/api/import/full" | "/api/import/full/" | "/api/logs" | "/api/logs/" | "/api/logs/download" | "/api/logs/download/" | "/api/marketplace" | "/api/marketplace/" | "/api/marketplace/widgets" | "/api/marketplace/widgets/" | "/api/media" | "/api/media/" | "/api/media/ai-tag" | "/api/media/ai-tag/" | "/api/media/bulk-download" | "/api/media/bulk-download/" | "/api/media/delete" | "/api/media/delete/" | "/api/media/exists" | "/api/media/exists/" | "/api/media/external" | "/api/media/external/" | `/api/media/external/${string}` & {} | `/api/media/external/${string}/` & {} | "/api/media/get" | "/api/media/get/" | "/api/media/manipulate" | "/api/media/manipulate/" | `/api/media/manipulate/${string}` & {} | `/api/media/manipulate/${string}/` & {} | "/api/media/process" | "/api/media/process/" | "/api/media/remote" | "/api/media/remote/" | "/api/media/search" | "/api/media/search/" | "/api/media/transform" | "/api/media/transform/" | `/api/media/transform/${string}` & {} | `/api/media/transform/${string}/` & {} | "/api/media/trash" | "/api/media/trash/" | `/api/media/${string}` & {} | `/api/media/${string}/` & {} | `/api/media/${string}/focal` & {} | `/api/media/${string}/focal/` & {} | "/api/metrics" | "/api/metrics/" | "/api/metrics/unified" | "/api/metrics/unified/" | "/api/permission" | "/api/permission/" | "/api/permission/update" | "/api/permission/update/" | "/api/remoteVideo" | "/api/remoteVideo/" | "/api/search" | "/api/search/" | "/api/security" | "/api/security/" | "/api/security/csp-report" | "/api/security/csp-report/" | "/api/security/incidents" | "/api/security/incidents/" | `/api/security/incidents/${string}` & {} | `/api/security/incidents/${string}/` & {} | `/api/security/incidents/${string}/resolve` & {} | `/api/security/incidents/${string}/resolve/` & {} | "/api/security/stats" | "/api/security/stats/" | "/api/security/unblock" | "/api/security/unblock/" | "/api/sendMail" | "/api/sendMail/" | "/api/settings" | "/api/settings/" | "/api/settings/public" | "/api/settings/public/" | "/api/settings/public/stream" | "/api/settings/public/stream/" | `/api/settings/${string}` & {} | `/api/settings/${string}/` & {} | "/api/systemPreferences" | "/api/systemPreferences/" | "/api/systemVirtualFolder" | "/api/systemVirtualFolder/" | `/api/systemVirtualFolder/${string}` & {} | `/api/systemVirtualFolder/${string}/` & {} | "/api/systemsetting" | "/api/systemsetting/" | "/api/systemsetting/export" | "/api/systemsetting/export/" | "/api/systemsetting/import" | "/api/systemsetting/import/" | "/api/system" | "/api/system/" | "/api/system/health" | "/api/system/health/" | "/api/system/restart" | "/api/system/restart/" | "/api/system/version" | "/api/system/version/" | "/api/telemetry" | "/api/telemetry/" | "/api/telemetry/report" | "/api/telemetry/report/" | "/api/telemetry/stats" | "/api/telemetry/stats/" | "/api/theme" | "/api/theme/" | "/api/theme/get-current-theme" | "/api/theme/get-current-theme/" | "/api/theme/set-default" | "/api/theme/set-default/" | "/api/theme/update-theme" | "/api/theme/update-theme/" | "/api/tokenBuilder" | "/api/tokenBuilder/" | "/api/tokenBuilder/resolve" | "/api/tokenBuilder/resolve/" | "/api/token" | "/api/token/" | "/api/token/batch" | "/api/token/batch/" | "/api/token/createToken" | "/api/token/createToken/" | `/api/token/${string}` & {} | `/api/token/${string}/` & {} | "/api/user" | "/api/user/" | "/api/user/batch" | "/api/user/batch/" | "/api/user/createUser" | "/api/user/createUser/" | "/api/user/deleteAvatar" | "/api/user/deleteAvatar/" | "/api/user/login" | "/api/user/login/" | "/api/user/logout" | "/api/user/logout/" | "/api/user/saveAvatar" | "/api/user/saveAvatar/" | "/api/user/updateUserAttributes" | "/api/user/updateUserAttributes/" | "/api/version-check" | "/api/version-check/" | "/api/website-tokens" | "/api/website-tokens/" | `/api/website-tokens/${string}` & {} | `/api/website-tokens/${string}/` & {} | "/api/widgets" | "/api/widgets/" | "/api/widgets/active" | "/api/widgets/active/" | "/api/widgets/installed" | "/api/widgets/installed/" | "/api/widgets/install" | "/api/widgets/install/" | "/api/widgets/list" | "/api/widgets/list/" | "/api/widgets/required" | "/api/widgets/required/" | "/api/widgets/status" | "/api/widgets/status/" | "/api/widgets/sync" | "/api/widgets/sync/" | "/api/widgets/uninstall" | "/api/widgets/uninstall/" | "/api/widgets/validate" | "/api/widgets/validate/" | "/config" | "/config/" | "/config/accessManagement" | "/config/accessManagement/" | "/config/collectionbuilder" | "/config/collectionbuilder/" | "/config/collectionbuilder/NestedContent" | "/config/collectionbuilder/NestedContent/" | `/config/collectionbuilder/${string}` & {} | `/config/collectionbuilder/${string}/` & {} | `/config/collectionbuilder/${string}/${string}/tabs` & {} | `/config/collectionbuilder/${string}/${string}/tabs/` & {} | `/config/collectionbuilder/${string}/${string}/tabs/CollectionWidget` & {} | `/config/collectionbuilder/${string}/${string}/tabs/CollectionWidget/` & {} | `/config/collectionbuilder/${string}/${string}/tabs/CollectionWidget/tabsFields` & {} | `/config/collectionbuilder/${string}/${string}/tabs/CollectionWidget/tabsFields/` & {} | `/config/collectionbuilder/${string}/${string}` & {} | `/config/collectionbuilder/${string}/${string}/` & {} | "/config/components" | "/config/components/" | "/config/configurationManager" | "/config/configurationManager/" | "/config/import-export" | "/config/import-export/" | "/config/system-health" | "/config/system-health/" | "/config/systemsetting" | "/config/systemsetting/" | "/config/themeManagement" | "/config/themeManagement/" | "/config/widgetManagement" | "/config/widgetManagement/" | "/dashboard" | "/dashboard/" | "/email-previews" | "/email-previews/" | "/files" | "/files/" | `/files/${string}` & {} | `/files/${string}/` & {} | "/graphql-test" | "/graphql-test/" | "/login" | "/login/" | "/login/components" | "/login/components/" | "/login/components/icons" | "/login/components/icons/" | "/login/oauth" | "/login/oauth/" | "/mediagallery" | "/mediagallery/" | "/mediagallery/uploadMedia" | "/mediagallery/uploadMedia/" | "/user" | "/user/" | `/${string}` & {} | `/${string}/` & {} | `/${string}/${string}` & {} | `/${string}/${string}/` & {};
		ResolvedPathname(): `${"" | `/${string}`}${ReturnType<AppTypes['Pathname']>}`;
		Asset(): "/Default_User.svg" | "/Spinner.svg" | "/SveltyCMS.png" | "/SveltyCMS_Logo.svg" | "/robots.txt" | string & {};
	}
}