<!--
@file src/routes/(app)/dashboard/widget-scope.svelte
@component
**Per-tile reactive scope for dashboard widgets**

### Props
- `config` {DashboardWidgetConfig} - The persisted widget instance
- `tenantId` {string} - Current tenant id (scopes sandboxed storage)
- `userId` {string} - Current user id (scopes sandboxed storage)
- `isAdmin` {boolean} - Whether the current user bypasses RBAC checks
- `role` {string | undefined} - Current user role
- `permissions` {string[]} - Current user permissions
- `requiresPermission` {string | undefined} - Manifest RBAC requirement
- `requiresAdmin` {boolean | undefined} - Manifest admin-only requirement
- `children` {Snippet} - The widget to render

### Features:
- Exposes the latest persisted settings to BaseWidget without forwarding props through every widget package
- Applies the manifest RBAC gate once per tile (defense in depth for persisted layouts)
- Keeps tenant/user scoping available to the sandboxed storage layer
-->
<script lang="ts">
	import { setContext } from 'svelte';
	import type { Snippet } from 'svelte';
	import type { DashboardWidgetConfig } from '@src/content/types';
	import { checkWidgetAccess } from './widget-sandbox';
	import {
		WIDGET_SCOPE_KEY,
		type DashboardWidgetLicense,
		type WidgetScopeContext
	} from './widget-contract';

	interface Props {
		config: DashboardWidgetConfig;
		tenantId?: string;
		userId?: string;
		isAdmin?: boolean;
		role?: string;
		permissions?: string[];
		requiresPermission?: string;
		requiresAdmin?: boolean;
		license?: DashboardWidgetLicense;
		children: Snippet;
	}

	let {
		config,
		tenantId = 'global',
		userId = 'anon',
		isAdmin = false,
		role = undefined,
		permissions = [],
		requiresPermission = undefined,
		requiresAdmin = undefined,
		license = undefined,
		children
	}: Props = $props();

	const scope: WidgetScopeContext = {
		get settings() {
			return config.settings ?? {};
		},
		get tenantId() {
			return tenantId;
		},
		get userId() {
			return userId;
		},
		get accessAllowed() {
			return checkWidgetAccess({ isAdmin, role, permissions }, requiresPermission, requiresAdmin);
		},
		get license() {
			return license;
		}
	};

	setContext(WIDGET_SCOPE_KEY, scope);
</script>

{@render children()}
