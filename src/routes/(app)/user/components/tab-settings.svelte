<!--
@file src/routes/(app)/user/components/tab-settings.svelte
@component
@description Tab 3: Settings — workspace appearance quick preferences, collaboration RTC toggles, and personal privacy data.
Features:
- Fast appearance customization (density, card style, reduced motion, high contrast)
- Link to full appearance design system overrides
- Real-time collaboration (RTC) and sound notification settings
- Personal privacy export / erasure modal trigger
- Plugin zones: user_preferences, user_profile_sidebar
-->

<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import Select from '@components/ui/select.svelte';
	import Toggle from '@components/ui/toggle.svelte';
	import Checkbox from '@components/ui/checkbox.svelte';
	import HelpIcon from '@components/ui/help-icon.svelte';
	import AdminCard from '@components/admin-card.svelte';
	import Slot from '@src/components/system/slot.svelte';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import { userThemePrefs } from '@src/stores/theme-store.svelte';
	import type { UserThemePreferences } from '@utils/theme-merge';
	import { updateUserThemePrefs } from '@utils/appearance-api';
	import { memoizeLazyLoader } from '@utils/lazy-module';
	import { modalState } from '@utils/modal.svelte';
	import { clientJsonHeaders } from '@utils/security/client-csrf';
	import { refreshAll } from '$app/navigation';
	import { toast } from '@src/stores/toast.svelte.ts';
	import { untrack } from 'svelte';
	import type { UserDisplay } from '../user-types';
	import { helpTitle, HELP_BTN_CLASS } from '../user-help';
	import {
		config_tile_design,
		twofa_status_disabled,
		twofa_status_enabled,
		userpage_appearance_applied,
		userpage_apply_appearance,
		userpage_auth_error,
		userpage_card_style,
		userpage_collaboration,
		userpage_could_not_reach_server,
		userpage_density,
		userpage_density_compact,
		userpage_density_cozy,
		userpage_density_spacious,
		userpage_enable_rtc,
		userpage_enable_sound,
		userpage_help_appearance,
		userpage_help_card_style_aria,
		userpage_help_collaboration_aria,
		userpage_help_density_aria,
		userpage_help_high_contrast_aria,
		userpage_help_privacy_aria,
		userpage_help_reduced_motion_aria,
		userpage_help_rtc_aria,
		userpage_help_rtc_sound_aria,
		userpage_high_contrast,
		userpage_network_error,
		userpage_open_design_system_aria,
		userpage_preference_disabled,
		userpage_preference_enabled,
		userpage_privacy_action_desc,
		userpage_privacy_action_title,
		userpage_privacy_data_title,
		userpage_privacy_extensions_title,
		userpage_privacy_open_aria,
		userpage_reduced_motion,
		userpage_reload_try_again,
		userpage_rtc_editing,
		userpage_save_failed,
		userpage_sound_notifications,
		userpage_theme_default,
		userpage_update_failed,
		userpage_variant_bordered,
		userpage_variant_elevated,
		userpage_variant_flat,
		userpage_workspace_appearance,
		userpage_workspace_collab_title
	} from '@src/paraglide/messages';

	interface Props {
		user: UserDisplay;
		serverUser?: Record<string, unknown> | null;
		csrfToken?: string;
	}

	const { user, serverUser, csrfToken }: Props = $props();

	const loadModalPrivacyData = memoizeLazyLoader(() => import('./modal-privacy-data.svelte'));

	const initialThemePrefs = untrack(
		() =>
			((serverUser?.preferences as Record<string, unknown> | undefined)?.theme ?? {}) as {
				density?: string;
				variant?: string;
				reducedMotion?: boolean;
				highContrast?: boolean;
			}
	);

	let myDensity = $state(initialThemePrefs.density ?? '');
	let myVariant = $state(initialThemePrefs.variant ?? '');
	let myReducedMotion = $state(initialThemePrefs.reducedMotion ?? false);
	let myHighContrast = $state(initialThemePrefs.highContrast ?? false);
	let savingAppearance = $state(false);

	async function saveQuickAppearance() {
		savingAppearance = true;
		try {
			const prefs: Record<string, unknown> = {
				reducedMotion: myReducedMotion,
				highContrast: myHighContrast
			};
			if (myDensity) prefs.density = myDensity;
			if (myVariant) prefs.variant = myVariant;
			const res = await updateUserThemePrefs(prefs);
			if (!res.success) throw new Error(res.message || userpage_save_failed());
			userThemePrefs.apply(prefs as UserThemePreferences);
			toast.success(userpage_appearance_applied());
		} catch (e: unknown) {
			toast.error(e instanceof Error ? e.message : String(e));
		} finally {
			savingAppearance = false;
		}
	}

	async function updateRtcPreference(key: string, value: boolean) {
		const prefs = (serverUser?.preferences ?? {}) as Record<string, unknown>;
		const rtcPrefs = (prefs.rtc ?? {}) as Record<string, unknown>;
		const newUserData = {
			preferences: {
				...prefs,
				rtc: { ...rtcPrefs, [key]: value }
			}
		};

		try {
			const res = await fetch('/api/user/update-user-attributes', {
				method: 'PUT',
				headers: clientJsonHeaders(csrfToken),
				body: JSON.stringify({ user_id: 'self', newUserData })
			});

			if (res.ok) {
				if (value) {
					toast.success({
						title: twofa_status_enabled(),
						description: userpage_preference_enabled({ key })
					});
				} else {
					toast.warning({
						title: twofa_status_disabled(),
						description: userpage_preference_disabled({ key })
					});
				}
				await refreshAll();
			} else if (res.status === 401 || res.status === 403) {
				toast.error({ title: userpage_auth_error(), description: userpage_reload_try_again() });
			} else {
				const body = (await res.json().catch(() => ({}))) as { message?: string };
				toast.error({
					title: userpage_update_failed(),
					description: body.message || `HTTP ${res.status}`
				});
			}
		} catch (err) {
			toast.error({
				title: userpage_network_error(),
				description: err instanceof Error ? err.message : userpage_could_not_reach_server()
			});
		}
	}

	async function modalPrivacyData(): Promise<void> {
		const { default: ModalPrivacyData } = await loadModalPrivacyData();
		modalState.trigger(ModalPrivacyData as never, { user });
	}

	const cardClass = 'border border-(--admin-border-default) p-5 sm:p-6 shadow-sm';

	const rtcPrefs = $derived(
		((serverUser?.preferences ?? {}) as Record<string, Record<string, boolean>>).rtc ?? {}
	);
</script>

<div class="grid grid-cols-1 gap-4 lg:grid-cols-2" data-testid="user-settings-panel">
	<AdminCard class={cardClass}>
		<h3 class="mb-3 text-sm font-semibold uppercase tracking-wider">
			{userpage_workspace_collab_title()}
		</h3>
		<div class="space-y-1">
			<div
				class="border-b border-surface-100 py-3 dark:border-surface-500/40"
				data-testid="workspace-appearance-section"
			>
				<div class="mb-2 flex items-center gap-2">
					<iconify-icon
						icon="mdi:palette-outline"
						class="text-tertiary-500 dark:text-primary-500"
						width={20}
						aria-hidden="true"
					></iconify-icon>
					<h4 class="text-sm font-medium text-(--admin-text-body)">
						{userpage_workspace_appearance()}
					</h4>
				</div>
				<p class="mb-3 text-xs text-(--admin-text-muted)">{userpage_help_appearance()}</p>
				<div class="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="user-quick-appearance">
					<div class="flex flex-col gap-1.5">
						<div class="flex items-center gap-1.5">
							<span class="text-sm font-semibold text-(--admin-text-muted)"
								>{userpage_density()}</span
							>
							<SystemTooltip title={helpTitle('density')}>
								<HelpIcon
									ariaLabel={userpage_help_density_aria()}
									tabindex={0}
									class={HELP_BTN_CLASS}
								/>
							</SystemTooltip>
						</div>
						<Select
							bind:value={myDensity}
							ariaLabel={userpage_density()}
							options={[
								{ value: '', label: userpage_theme_default() },
								{ value: 'compact', label: userpage_density_compact() },
								{ value: 'cozy', label: userpage_density_cozy() },
								{ value: 'spacious', label: userpage_density_spacious() }
							]}
						/>
					</div>
					<div class="flex flex-col gap-1.5">
						<div class="flex items-center gap-1.5">
							<span class="text-sm font-semibold text-(--admin-text-muted)"
								>{userpage_card_style()}</span
							>
							<SystemTooltip title={helpTitle('card-style')}>
								<HelpIcon
									ariaLabel={userpage_help_card_style_aria()}
									tabindex={0}
									class={HELP_BTN_CLASS}
								/>
							</SystemTooltip>
						</div>
						<Select
							bind:value={myVariant}
							ariaLabel={userpage_card_style()}
							options={[
								{ value: '', label: userpage_theme_default() },
								{ value: 'flat', label: userpage_variant_flat() },
								{ value: 'bordered', label: userpage_variant_bordered() },
								{ value: 'elevated', label: userpage_variant_elevated() }
							]}
						/>
					</div>
					<div class="flex items-center justify-between gap-3 py-1">
						<span class="flex items-center gap-1.5 text-sm font-semibold text-(--admin-text-muted)">
							{userpage_reduced_motion()}
							<SystemTooltip title={helpTitle('reduced-motion')}>
								<HelpIcon
									ariaLabel={userpage_help_reduced_motion_aria()}
									tabindex={0}
									class={HELP_BTN_CLASS}
								/>
							</SystemTooltip>
						</span>
						<Toggle bind:value={myReducedMotion} ariaLabel={userpage_reduced_motion()} />
					</div>
					<div class="flex items-center justify-between gap-3 py-1">
						<span class="flex items-center gap-1.5 text-sm font-semibold text-(--admin-text-muted)">
							{userpage_high_contrast()}
							<SystemTooltip title={helpTitle('high-contrast')}>
								<HelpIcon
									ariaLabel={userpage_help_high_contrast_aria()}
									tabindex={0}
									class={HELP_BTN_CLASS}
								/>
							</SystemTooltip>
						</span>
						<Toggle bind:value={myHighContrast} ariaLabel={userpage_high_contrast()} />
					</div>
				</div>
				<div class="flex flex-col gap-2 sm:flex-row">
					<Button
						variant="primary"
						size="sm"
						onclick={saveQuickAppearance}
						loading={savingAppearance}
						data-testid="user-save-appearance-btn"
						class="flex-1"
					>
						{userpage_apply_appearance()}
					</Button>
					<Button
						variant="outline"
						href="/config/design-system?tab=overrides"
						data-testid="open-appearance-settings-btn"
						aria-label={userpage_open_design_system_aria()}
						class="flex-1 text-xs font-bold tracking-tight"
					>
						<iconify-icon icon="mdi:compass-outline" width={14} class="me-1" aria-hidden="true"
						></iconify-icon>
						{config_tile_design()}
					</Button>
				</div>
			</div>

			<div class="py-3" data-testid="collaboration-prefs">
				<div class="mb-2 flex items-center gap-2">
					<iconify-icon
						icon="mdi:forum"
						class="text-tertiary-500 dark:text-primary-500"
						width={20}
						aria-hidden="true"
					></iconify-icon>
					<div class="flex items-center gap-1 uppercase">
						{userpage_collaboration()}
						<SystemTooltip title={helpTitle('collaboration')}>
							<HelpIcon
								ariaLabel={userpage_help_collaboration_aria()}
								tabindex={0}
								class={HELP_BTN_CLASS}
							/>
						</SystemTooltip>
					</div>
				</div>
				<div class="space-y-3 ps-1">
					<div class="flex items-center justify-between gap-3" data-testid="pref-rtc-enabled">
						<span class="flex min-w-0 items-center gap-1">
							{userpage_rtc_editing()}
							<SystemTooltip title={helpTitle('rtc-enabled')}>
								<HelpIcon
									ariaLabel={userpage_help_rtc_aria()}
									tabindex={0}
									class={HELP_BTN_CLASS}
								/>
							</SystemTooltip>
						</span>
						<Checkbox
							checked={rtcPrefs.enabled ?? true}
							onchange={async (enabled) => updateRtcPreference('enabled', enabled)}
							size="sm"
							label={userpage_enable_rtc()}
							hideLabel={true}
						/>
					</div>
					<div class="flex items-center justify-between gap-3" data-testid="pref-rtc-sound">
						<span class="flex min-w-0 items-center gap-1">
							{userpage_sound_notifications()}
							<SystemTooltip title={helpTitle('rtc-sound')}>
								<HelpIcon
									ariaLabel={userpage_help_rtc_sound_aria()}
									tabindex={0}
									class={HELP_BTN_CLASS}
								/>
							</SystemTooltip>
						</span>
						<Checkbox
							checked={rtcPrefs.sound ?? true}
							onchange={async (sound) => updateRtcPreference('sound', sound)}
							size="sm"
							label={userpage_enable_sound()}
							hideLabel={true}
						/>
					</div>
				</div>
			</div>
		</div>
	</AdminCard>

	<AdminCard class={cardClass}>
		<h3 class="mb-3 text-sm font-semibold uppercase tracking-wider">
			{userpage_privacy_extensions_title()}
		</h3>
		<div class="space-y-1">
			<div class="py-1" data-testid="privacy-data-section">
				<div class="mb-2 flex items-center gap-2">
					<iconify-icon
						icon="mdi:shield-account"
						class="text-tertiary-500 dark:text-primary-500"
						width={20}
						aria-hidden="true"
					></iconify-icon>
					<div class="flex items-center gap-1 text-sm font-medium text-(--admin-text-body)">
						{userpage_privacy_data_title()}
						<SystemTooltip title={helpTitle('privacy')}>
							<HelpIcon
								ariaLabel={userpage_help_privacy_aria()}
								tabindex={0}
								class={HELP_BTN_CLASS}
							/>
						</SystemTooltip>
					</div>
				</div>
				<Button
					variant="transparent"
					type="button"
					onclick={modalPrivacyData}
					data-testid="privacy-data-btn"
					aria-label={userpage_privacy_open_aria()}
					class="h-auto! w-full justify-start! gap-3 border border-surface-500/30 p-3! font-normal! text-start hover:bg-surface-500/10 dark:border-surface-500/40 dark:hover:bg-surface-800/50"
				>
					<div class="min-w-0 flex-1">
						<p class="text-sm font-medium text-(--admin-text-body)">
							{userpage_privacy_action_title()}
						</p>
						<p class="text-xs text-(--admin-text-muted)">
							{userpage_privacy_action_desc()}
						</p>
					</div>
					<iconify-icon
						icon="mdi:chevron-right"
						class="shrink-0 text-(--admin-text-muted)"
						width={18}
						aria-hidden="true"
					></iconify-icon>
				</Button>
			</div>

			<div class="pt-2" data-testid="slot-user_preferences" data-zone="user_preferences">
				<Slot name="user_preferences" props={{ user }} />
			</div>
			<div data-testid="slot-user_profile_sidebar" data-zone="user_profile_sidebar">
				<Slot name="user_profile_sidebar" props={{ user }} />
			</div>
		</div>
	</AdminCard>
</div>
