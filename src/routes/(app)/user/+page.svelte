<!--
@file src/routes/(app)/user/+page.svelte
@component
@description Personal account page — tabbed shell coordinating Identity, Security, Settings, and User Management.
Features:
- Underline tab strip with responsive labels and icons
- Tab 1: Identity (avatar, badges, profile fields, action buttons)
- Tab 2: Security (2FA, passkeys, sessions, login preferences, permissions)
- Tab 3: Settings (workspace appearance, collaboration RTC, privacy data)
- Tab 4: User Management (admin only, lazy loaded)
- Global search action executor integration
-->

<script lang="ts">
	import AdminPageShell from '@components/admin-page-shell.svelte';
	import Tabs from '@components/ui/tabs.svelte';
	import { hydration } from '@src/stores/hydration.svelte';
	import { isAdmin } from '@src/databases/auth/constants';
	import { setCollection } from '@src/stores/collection-store.svelte';
	import { globalSearch } from '@utils/global-search-index.svelte';
	import { memoizeLazyLoader } from '@utils/lazy-module';
	import { onMount } from 'svelte';
	import TabIdentity from './components/tab-identity.svelte';
	import TabSecurity from './components/tab-security.svelte';
	import TabSettings from './components/tab-settings.svelte';
	import type { AccountTab, UserDisplay } from './user-types';
	import {
		userpage_action_manage,
		userpage_management_intro,
		userpage_security,
		userpage_tab_identity,
		userpage_tab_management,
		userpage_tab_settings,
		userpage_tabs_aria,
		userpage_title
	} from '@src/paraglide/messages';

	const loadUserManagement = memoizeLazyLoader(() => import('./components/user-management.svelte'));

	const { data } = $props();
	const serverUser = $derived(data.user);
	const isFirstUser = $derived(!!data.isFirstUser);
	const isMultiTenant = $derived(!!data.isMultiTenant);
	const is2FAEnabledGlobal = $derived(!!data.is2FAEnabledGlobal);

	let activeTab = $state<AccountTab>('identity');

	const rolePermissionFallback = $derived.by(() => {
		const roles = (data.roles ?? []) as Array<{
			_id?: string;
			name?: string;
			permissions?: string[];
		}>;
		const roleKey = serverUser?.role;
		const match = roles.find((r) => r._id === roleKey || r.name === roleKey);
		return Array.isArray(match?.permissions) ? match.permissions : [];
	});

	const user = $derived<UserDisplay>({
		_id: serverUser?._id ?? '',
		email: serverUser?.email ?? '',
		username: serverUser?.username ?? '',
		role: serverUser?.role ?? '',
		avatar: serverUser?.avatar ?? '/Default_User.svg',
		tenantId: serverUser?.tenantId ?? '',
		is2FAEnabled: serverUser?.is2FAEnabled ?? false,
		isAdmin: serverUser?.isAdmin ?? false,
		authenticators: serverUser?.authenticators ?? [],
		permissions:
			Array.isArray(serverUser?.permissions) && serverUser.permissions.length > 0
				? (serverUser.permissions as string[])
				: rolePermissionFallback.length > 0
					? rolePermissionFallback
					: serverUser?.isAdmin
						? ['system:admin', 'user:read', 'user:write', 'config:settings']
						: []
	});

	const canManageUsers = $derived(
		isAdmin(user) ||
			isAdmin(data) ||
			(data as { permissions?: Record<string, { hasPermission?: boolean }> }).permissions?.[
				'config/adminArea'
			]?.hasPermission === true
	);

	const accountTabs = $derived([
		{
			id: 'identity',
			label: userpage_tab_identity(),
			shortLabel: userpage_tab_identity(),
			icon: 'mdi:account-circle-outline'
		},
		{
			id: 'security',
			label: userpage_security(),
			shortLabel: userpage_security(),
			icon: 'mdi:shield-lock-outline'
		},
		{
			id: 'settings',
			label: userpage_tab_settings(),
			shortLabel: userpage_tab_settings(),
			icon: 'mdi:cog-outline'
		},
		...(canManageUsers
			? [
					{
						id: 'management',
						label: userpage_tab_management(),
						shortLabel: userpage_action_manage(),
						icon: 'mdi:account-group-outline'
					}
				]
			: [])
	]);

	function executeActions() {
		const actions = globalSearch.triggerActions;
		if (actions.length === 1) {
			actions[0]();
		} else {
			for (const action of actions) action();
		}
		globalSearch.clearTriggerActions();
	}

	onMount(() => {
		if (globalSearch.triggerActions.length > 0) executeActions();
		setCollection(null);
	});
</script>

<AdminPageShell
	title={userpage_title()}
	icon="mdi:account-circle"
	showBackButton={true}
	backUrl="/config"
>
	<div class="flex w-full min-w-0 flex-col gap-2" data-testid="user-account-page">
		<!-- Tabs directly under PageTitle -->
		<Tabs
			tabs={accountTabs}
			bind:activeTab
			disabled={!hydration.hydrated}
			variant="underline"
			ariaLabel={userpage_tabs_aria()}
			testId="user-account-tabs"
			onTabChange={(id) => {
				activeTab = id as AccountTab;
			}}
		/>

		<div id="tabpanel-{activeTab}" role="tabpanel" class="min-w-0" data-testid="user-tab-panel">
			{#if activeTab === 'identity'}
				<!-- ═══ TAB 1: Identity — left: avatar + equal badges · right: fields ═══ -->
				<TabIdentity
					{user}
					{isFirstUser}
					{isMultiTenant}
					{is2FAEnabledGlobal}
					csrfToken={data.csrfToken ?? undefined}
				/>
			{:else if activeTab === 'security'}
				<!-- ═══ TAB 2: Security — help icons match /setup pattern ═══ -->
				<TabSecurity
					{user}
					serverUser={data.user}
					initialSessions={data.initialSessions}
					{is2FAEnabledGlobal}
					csrfToken={data.csrfToken ?? undefined}
				/>
			{:else if activeTab === 'settings'}
				<!-- ═══ TAB 3: User Settings — two columns (Appearance/Collab | Privacy) ═══ -->
				<TabSettings {user} serverUser={data.user} csrfToken={data.csrfToken ?? undefined} />
			{:else if activeTab === 'management' && canManageUsers}
				<!-- ╭╥╮ TAB 4: User Management (full width; sub-tabs Users | Invitations) ╭╥╮ -->
				<div class="min-w-0">
					<p
						class="mb-3 text-center text-sm font-medium text-tertiary-600 dark:text-primary-500"
						data-testid="user-management-intro"
					>
						{userpage_management_intro()}
					</p>
					{#await loadUserManagement() then { default: UserManagement }}
						<UserManagement
							currentUser={user as never}
							isMultiTenant={!!isMultiTenant}
							roles={(data.roles ?? []) as never}
							initialUsers={data.initialUsers?.users ?? null}
							initialTotal={data.initialUsers?.totalItems ?? null}
						/>
					{/await}
				</div>
			{/if}
		</div>
	</div>
</AdminPageShell>
