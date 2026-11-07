<!--
@file src/routes/(app)/user/components/tab-identity.svelte
@component
@description Tab 1: Identity — centered avatar, badges, profile fields, action buttons.
Features:
- Responsive grid (avatar + badges column on left, credentials and actions on right)
- Avatar modal trigger and edit pencil tooltip
- Role, ID, Tenant, and 2FA status badges
- Edit profile and change password triggers
- Account deletion confirmation dialog for first user
- Plugin zone: user_profile
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import HelpIcon from '@components/ui/help-icon.svelte';
	import Avatar from '@components/ui/avatar.svelte';
	import AdminCard from '@components/admin-card.svelte';
	import Slot from '@src/components/system/slot.svelte';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import { hydration } from '@src/stores/hydration.svelte';
	import { normalizeAvatarUrl } from '@utils/avatar';
	import { memoizeLazyLoader } from '@utils/lazy-module';
	import { modalState, showConfirm } from '@utils/modal.svelte';
	import { clientJsonHeaders } from '@utils/security/client-csrf';
	import { refreshAll } from '$app/navigation';
	import { toast } from '@src/stores/toast.svelte.ts';
	import type { UserDisplay } from '../user-types';
	import { helpTitle, HELP_BTN_CLASS } from '../user-help';
	import {
		button_delete,
		email,
		form_password,
		usermodalconfirmbody,
		usermodalconfirmtitle,
		usermodaluser_edittitle,
		usermodaluser_settingbody,
		username,
		userpage_2fa_manage_aria,
		userpage_2fa_off,
		userpage_2fa_on,
		userpage_2fa_setup_aria,
		userpage_account_deleted,
		userpage_account_removed,
		userpage_avatar_saved,
		userpage_avatar_updated,
		userpage_change_password,
		userpage_could_not_reach_server,
		userpage_delete_failed,
		userpage_edit_profile,
		userpage_edit_user_body,
		userpage_edit_usersetting,
		userpage_editavatar,
		userpage_help_email_aria,
		userpage_help_id_aria,
		userpage_help_password_aria,
		userpage_help_role_aria,
		userpage_help_tenant_aria,
		userpage_help_username_aria,
		userpage_missing_user_id,
		userpage_network_error,
		userpage_password_stored_prefix,
		userpage_password_stored_suffix,
		userpage_role_administrator,
		userpage_role_developer,
		userpage_role_editor,
		userpage_role_guest,
		userpage_tenant
	} from '@src/paraglide/messages';

	interface Props {
		user: UserDisplay;
		isFirstUser: boolean;
		isMultiTenant: boolean;
		is2FAEnabledGlobal: boolean;
		csrfToken?: string;
	}

	const { user, isFirstUser, isMultiTenant, is2FAEnabledGlobal, csrfToken }: Props = $props();

	const loadModalTwoFactorAuth = memoizeLazyLoader(() => import('./modal-two-factor-auth.svelte'));
	const loadModalEditAvatar = memoizeLazyLoader(() => import('./modal-edit-avatar.svelte'));
	const loadModalEditForm = memoizeLazyLoader(
		() => import('@components/user/modal-edit-form.svelte')
	);

	const roleDisplay = $derived.by(() => {
		const r = String(user.role).toLowerCase();
		switch (r) {
			case 'admin':
				return { icon: 'material-symbols:verified-outline', name: userpage_role_administrator() };
			case 'developer':
				return { icon: 'material-symbols:code', name: userpage_role_developer() };
			case 'editor':
				return { icon: 'material-symbols:edit', name: userpage_role_editor() };
			case 'guest':
				return { icon: 'material-symbols:person', name: userpage_role_guest() };
			default:
				return { icon: 'material-symbols:person', name: user.role };
		}
	});

	async function open2FAModal(): Promise<void> {
		const { default: ModalTwoFactorAuth } = await loadModalTwoFactorAuth();
		modalState.trigger(ModalTwoFactorAuth, { user, size: 'fullscreen' }, async (r: unknown) => {
			if (r) await refreshAll();
		});
	}

	async function modalUserForm(): Promise<void> {
		const { default: ModalEditForm } = await loadModalEditForm();
		modalState.trigger(ModalEditForm, {
			title: usermodaluser_edittitle(),
			body: usermodaluser_settingbody() || userpage_edit_user_body()
		});
	}

	async function modalEditAvatar(): Promise<void> {
		const { default: ModalEditAvatar } = await loadModalEditAvatar();
		modalState.trigger(
			ModalEditAvatar,
			{
				title: userpage_editavatar(),
				size: 'lg'
			},
			async (r: unknown) => {
				if (r) {
					toast.success({
						title: userpage_avatar_updated(),
						description: userpage_avatar_saved()
					});
					await refreshAll();
				}
			}
		);
	}

	function modalConfirm(): void {
		showConfirm({
			title: usermodalconfirmtitle(),
			body: usermodalconfirmbody(),
			theme: { variant: 'filled', color: 'error' },
			onConfirm: async () => {
				if (!user._id) {
					toast.error({ title: userpage_delete_failed(), description: userpage_missing_user_id() });
					return;
				}
				try {
					const res = await fetch('/api/user/batch', {
						method: 'POST',
						headers: clientJsonHeaders(csrfToken),
						body: JSON.stringify({ userIds: [user._id], action: 'delete' })
					});
					if (res.ok) {
						toast.success({
							title: userpage_account_deleted(),
							description: userpage_account_removed()
						});
						await refreshAll();
						window.location.href = '/login';
						return;
					}
					const body = (await res.json().catch(() => ({}))) as { message?: string };
					toast.error({
						title: userpage_delete_failed(),
						description: body.message || `HTTP ${res.status}`
					});
				} catch (err) {
					toast.error({
						title: userpage_network_error(),
						description: err instanceof Error ? err.message : userpage_could_not_reach_server()
					});
				}
			}
		});
	}

	const cardClass = 'border border-(--admin-border-default) p-5 sm:p-6 shadow-sm';
</script>

<AdminCard class={cardClass} data-testid="user-identity-panel">
	<div
		class="grid grid-cols-1 gap-4 md:grid-cols-[minmax(10rem,12rem)_1fr] md:items-start md:gap-8 lg:gap-10"
	>
		<!-- Left: centered avatar + badges; edit pen is its own control (hit area outside circle) -->
		<div class="flex flex-col items-center gap-3">
			<div class="relative mx-auto size-28 shrink-0">
				<Button
					variant="transparent"
					type="button"
					onclick={modalEditAvatar}
					aria-label={userpage_editavatar()}
					title={userpage_editavatar()}
					data-testid="edit-avatar-btn"
					rounded
					class="h-full! w-full! p-0!"
				>
					<Avatar
						src={normalizeAvatarUrl(user.avatar)}
						initials={user.username?.slice(0, 2).toUpperCase() || 'AV'}
						size="size-28"
						class="size-full rounded-full border-2 border-surface-500/30 shadow-md pointer-events-none dark:border-surface-600"
					/>
				</Button>
				<!-- Pencil outside circle hit area — positioned shell + SystemTooltip + real button -->
				<div class="absolute -inset-e-1 -top-1 z-20">
					<SystemTooltip title={helpTitle('avatar')} positioning={{ placement: 'top', gutter: 8 }}>
						<Button
							variant="primary"
							type="button"
							size="sm"
							rounded
							onclick={(e) => {
								e.preventDefault();
								e.stopPropagation();
								modalEditAvatar();
							}}
							aria-label={userpage_editavatar()}
							title={userpage_editavatar()}
							data-testid="edit-avatar-pencil-btn"
							class="size-8 p-0! shadow-md ring-2 ring-surface-50 dark:ring-surface-900"
						>
							<iconify-icon icon="bi:pencil-fill" width={13} aria-hidden="true"></iconify-icon>
						</Button>
					</SystemTooltip>
				</div>
			</div>

			<div class="flex w-full max-w-48 flex-col gap-2" data-testid="user-identity-badges">
				<!-- Shared height/width: white label text on filled chips -->
				<span data-testid="user-role-badge" class="block w-full">
					<span
						class="flex h-9 w-full items-center gap-1.5 rounded bg-primary-500 px-3 text-xs font-bold uppercase tracking-wide text-white"
					>
						<iconify-icon icon={roleDisplay.icon} width={16} class="shrink-0" aria-hidden="true"
						></iconify-icon>
						<span class="min-w-0 flex-1 truncate text-start">{roleDisplay.name}</span>
						<SystemTooltip title={helpTitle('role')} triggerClass="shrink-0">
							<HelpIcon ariaLabel={userpage_help_role_aria()} tabindex={0} class={HELP_BTN_CLASS} />
						</SystemTooltip>
					</span>
				</span>
				<span data-testid="user-id-badge" class="block w-full">
					<span
						class="flex h-9 w-full items-center gap-1.5 rounded bg-tertiary-600 px-3 font-mono text-[11px] font-bold tracking-wide text-white dark:bg-tertiary-500"
						title={String(user._id)}
					>
						<span class="min-w-0 flex-1 truncate text-start"
							>ID: {String(user._id).slice(0, 12)}…</span
						>
						<SystemTooltip title={helpTitle('id')} triggerClass="shrink-0">
							<HelpIcon ariaLabel={userpage_help_id_aria()} tabindex={0} class={HELP_BTN_CLASS} />
						</SystemTooltip>
					</span>
				</span>
				{#if isMultiTenant && user.tenantId}
					<span data-testid="user-tenant-badge" class="block w-full">
						<span
							class="flex h-9 w-full items-center gap-1.5 rounded-full bg-secondary-600 px-3 font-mono text-[11px] font-bold tracking-wide text-white"
						>
							<span class="min-w-0 flex-1 truncate text-start"
								>{userpage_tenant()}
								{String(user.tenantId).slice(0, 12)}…</span
							>
							<SystemTooltip title={helpTitle('tenant')} triggerClass="shrink-0">
								<HelpIcon
									ariaLabel={userpage_help_tenant_aria()}
									tabindex={0}
									class={HELP_BTN_CLASS}
								/>
							</SystemTooltip>
						</span>
					</span>
				{/if}
				{#if is2FAEnabledGlobal}
					<Button
						variant={user.is2FAEnabled ? 'success' : 'warning'}
						type="button"
						size="sm"
						rounded
						onclick={open2FAModal}
						data-testid="identity-2fa-badge-btn"
						aria-label={user.is2FAEnabled ? userpage_2fa_manage_aria() : userpage_2fa_setup_aria()}
						class="h-9! w-full text-xs! uppercase tracking-wide"
					>
						<iconify-icon
							icon={user.is2FAEnabled ? 'mdi:shield-check' : 'mdi:shield-alert-outline'}
							width={16}
							aria-hidden="true"
						></iconify-icon>
						{user.is2FAEnabled ? userpage_2fa_on() : userpage_2fa_off()}
					</Button>
				{/if}
			</div>
		</div>

		<!-- Right: username · email · password (static mask, no reveal) -->
		<div class="flex min-w-0 flex-col gap-4">
			<div
				class="grid w-full grid-cols-[14px_minmax(0,1fr)] gap-x-1 rounded-(--admin-radius-input) border border-surface-500/30 px-4 py-3 dark:border-surface-500/40"
			>
				<iconify-icon
					icon="mdi:account"
					width={14}
					class="self-center text-tertiary-500 dark:text-primary-500"
					aria-hidden="true"
				></iconify-icon>
				<div
					class="mb-1 flex items-center gap-1 leading-none text-[10px] font-semibold uppercase tracking-wider text-(--admin-text-muted)"
				>
					{username()}
					<SystemTooltip title={helpTitle('username')}>
						<HelpIcon
							ariaLabel={userpage_help_username_aria()}
							tabindex={0}
							class={HELP_BTN_CLASS}
						/>
					</SystemTooltip>
				</div>
				<p
					class="col-start-2 w-full text-base font-medium text-(--admin-text-body)"
					data-testid="profile-username"
				>
					{user.username || '—'}
				</p>
			</div>

			<div
				class="grid w-full grid-cols-[14px_minmax(0,1fr)] gap-x-1 rounded-(--admin-radius-input) border border-surface-500/30 px-4 py-3 dark:border-surface-500/40"
			>
				<iconify-icon
					icon="mdi:email-outline"
					width={14}
					class="self-center text-tertiary-500 dark:text-primary-500"
					aria-hidden="true"
				></iconify-icon>
				<div
					class="mb-1 flex items-center gap-1 leading-none text-[10px] font-semibold uppercase tracking-wider text-(--admin-text-muted)"
				>
					{email()}
					<SystemTooltip title={helpTitle('email')}>
						<HelpIcon ariaLabel={userpage_help_email_aria()} tabindex={0} class={HELP_BTN_CLASS} />
					</SystemTooltip>
				</div>
				<p
					class="col-start-2 w-full break-all text-base font-medium text-(--admin-text-body)"
					data-testid="profile-email"
				>
					{user.email || '—'}
				</p>
			</div>

			<!-- Password never shown in plain text — use Change password only -->
			<div
				class="grid w-full grid-cols-[14px_minmax(0,1fr)] gap-x-1 rounded-(--admin-radius-input) border border-surface-500/30 px-4 py-3 dark:border-surface-500/40"
				data-testid="profile-password-field"
			>
				<iconify-icon
					icon="mdi:key-variant"
					width={14}
					class="self-center text-tertiary-500 dark:text-primary-500"
					aria-hidden="true"
				></iconify-icon>
				<div
					class="mb-1 flex items-center gap-1 leading-none text-[10px] font-semibold uppercase tracking-wider text-(--admin-text-muted)"
				>
					{form_password()}
					<SystemTooltip title={helpTitle('password')}>
						<HelpIcon
							ariaLabel={userpage_help_password_aria()}
							tabindex={0}
							class={HELP_BTN_CLASS}
						/>
					</SystemTooltip>
				</div>
				<p
					class="col-start-2 font-mono text-base tracking-widest text-(--admin-text-muted)"
					aria-hidden="true"
				>
					••••••••••••
				</p>
				<p class="col-start-2 mt-1 text-xs text-(--admin-text-muted)">
					{userpage_password_stored_prefix()}
					<strong class="font-medium text-(--admin-text-muted)">{userpage_change_password()}</strong
					>
					{userpage_password_stored_suffix()}
				</p>
			</div>

			<div class="flex w-full flex-wrap items-center justify-between gap-3 pt-1">
				<!-- Disabled in the server HTML: `onclick` only exists after hydration. -->
				<Button
					variant="primary"
					leadingIcon="bi:pencil-fill"
					onclick={modalUserForm}
					aria-label={userpage_edit_usersetting()}
					disabled={!hydration.hydrated}
					data-testid="edit-user-settings-btn"
				>
					{userpage_edit_profile()}
				</Button>
				<Button
					variant="surface"
					leadingIcon="mdi:key-variant"
					onclick={modalUserForm}
					data-testid="security-change-password"
					aria-label={userpage_change_password()}
				>
					{userpage_change_password()}
				</Button>
			</div>

			<div data-testid="slot-user_profile" data-zone="user_profile">
				<Slot name="user_profile" props={{ user }} />
			</div>

			{#if isFirstUser}
				<div class="border-t border-surface-500/30 pt-4 dark:border-surface-500/40">
					<Button
						variant="outline"
						size="sm"
						leadingIcon="bi:trash3-fill"
						onclick={modalConfirm}
						class="w-full justify-start text-error-500 border-error-500/40 hover:bg-error-500/10 sm:w-auto"
						data-testid="identity-delete-account-btn"
					>
						{button_delete()}
					</Button>
				</div>
			{/if}
		</div>
	</div>
</AdminCard>
