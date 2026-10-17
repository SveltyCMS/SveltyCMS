<!--
 @file src/routes/(app)/config/collectionbuilder/[action]/[...contentPath]/tabs/collection-widget/modal-widget-form.svelte
 @component
 @description 3-tab widget edit modal: Default, Settings, Permissions.

 Features:
 - Single header (field label, widget type, database name) with its own close action
 - Two-column Default tab on tablet/desktop, single column on mobile
 - Visibility and authentication side by side above the role access table
 - Footer stacks on mobile with Save and Cancel full width
-->
<script lang="ts">
	import Tabs from '@components/ui/tabs.svelte';
	import Button from '@components/ui/button.svelte';
	import Input from '@components/ui/input.svelte';
	import Badge from '@components/ui/badge.svelte';
	import Toggle from '@components/ui/toggle.svelte';
	import Checkbox from '@components/ui/checkbox.svelte';
	import IconifyIconsPicker from '@components/iconify-icons-picker.svelte';
	import InputSwitch from '@src/components/system/builder/input-switch.svelte';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import HelpIcon from '@components/ui/help-icon.svelte';
	import {
		button_cancel,
		button_close,
		button_delete,
		button_save,
		widget_form_apply_aria,
		widget_form_db_name,
		widget_form_db_name_hint,
		widget_form_db_name_placeholder,
		widget_form_default,
		widget_form_default_hint,
		widget_form_default_placeholder,
		widget_form_duplicate,
		widget_form_edit_field,
		widget_form_field_label,
		widget_form_field_label_hint,
		widget_form_field_label_placeholder,
		widget_form_help_aria,
		widget_form_help_text,
		widget_form_help_text_hint,
		widget_form_help_text_placeholder,
		widget_form_icon,
		widget_form_icon_hint,
		widget_form_no_roles,
		widget_form_no_settings,
		widget_form_no_settings_part1,
		widget_form_no_settings_part2,
		widget_form_placeholder,
		widget_form_placeholder_hint,
		widget_form_placeholder_placeholder,
		widget_form_require_auth,
		widget_form_require_auth_aria,
		widget_form_require_auth_hint,
		widget_form_required,
		widget_form_required_aria,
		widget_form_required_hint,
		widget_form_role_edit_aria,
		widget_form_role_matrix,
		widget_form_role_matrix_hint,
		widget_form_role_view_aria,
		widget_form_roles_edit,
		widget_form_roles_role,
		widget_form_roles_view,
		widget_form_tab_default,
		widget_form_tab_permissions,
		widget_form_tab_settings,
		widget_form_translated,
		widget_form_translated_aria,
		widget_form_translated_hint,
		widget_form_unknown,
		widget_form_unnamed,
		widget_form_selected,
		widget_form_visibility,
		widget_form_visibility_private,
		widget_form_visibility_private_hint,
		widget_form_visibility_public,
		widget_form_visibility_public_hint,
		widget_form_width,
		widget_form_width_hint,
		widget_form_width_placeholder,
		widget_setting_max_hint,
		widget_setting_max_length_hint,
		widget_setting_min_hint,
		widget_setting_min_length_hint,
		widget_setting_prefix_hint,
		widget_setting_step_hint,
		widget_setting_suffix_hint
	} from '@src/paraglide/messages';
	import { resolveAdminComponent } from '@src/components/system/admin-component-registry';
	import { setTargetWidget } from '@src/stores/collection-store.svelte';
	import { widgets } from '@src/stores/widget-store.svelte.ts';
	import { modalState } from '@utils/modal.svelte';
	import { deepClone } from '@utils/native-utils';
	import type { Role } from '@src/databases/auth/types';
	import { SvelteSet } from 'svelte/reactivity';

	// --- Props ---
	interface Props {
		title?: string;
		body?: string;
		value: any;
		/** Injected by DialogManager — prefer this over modalState.close for result payload */
		close?: (result?: any) => void;
		/** @deprecated DialogManager does not pass response; use close() */
		response?: (r: any) => void;
		roles?: Role[];
	}

	const { value, close, roles: rolesProp = [] }: Props = $props() as Props;

	/** Always resolve via close(value) so DialogManager / modalState fire the trigger callback once. */
	function resolve(result: any) {
		// Prefer injected close — it already invokes the trigger response handler.
		if (typeof close === 'function') {
			close(result);
			return;
		}
		// Fallback: do not call response + close (double-fire).
		modalState.close(result);
	}

	// --- Tab state ---
	let activeTab = $state('default');

	const tabDefs = [
		// shortLabel keeps a visible name on phones (Tabs hides `label` below md)
		{
			id: 'default',
			label: widget_form_tab_default(),
			shortLabel: widget_form_tab_default(),
			icon: 'mdi:text-box-outline'
		},
		{
			id: 'settings',
			label: widget_form_tab_settings(),
			shortLabel: widget_form_tab_settings(),
			icon: 'mdi:tune'
		},
		{
			id: 'permissions',
			label: widget_form_tab_permissions(),
			shortLabel: widget_form_tab_permissions(),
			icon: 'mdi:shield-lock-outline'
		}
	];

	// --- Local working copy (seed immediately so first paint is not empty for E2E) ---
	function cloneValue(v: any) {
		if (!v) {
			return {
				label: '',
				db_fieldName: '',
				icon: '',
				required: false,
				translated: false,
				permissions: {},
				widget: {}
			};
		}
		try {
			return deepClone(v);
		} catch {
			return { ...v };
		}
	}

	// Seed immediately so first paint is not empty for E2E. The initializer
	// must not reference `value` directly (state_referenced_locally lint); the
	// $effect below re-syncs whenever DialogManager re-opens with a new payload.
	function seedLocal(): any {
		return cloneValue(value);
	}
	let local = $state<any>(seedLocal());

	let originalDbName = '';
	let incomingRenamedFrom = '';

	$effect(() => {
		// Re-sync when DialogManager re-opens with a new field payload.
		// Read the clone, not `local`, so typing in the form does not re-run this.
		const next = cloneValue(value);
		local = next;
		originalDbName = typeof next?.db_fieldName === 'string' ? next.db_fieldName : '';
		incomingRenamedFrom = typeof next?.renamedFrom === 'string' ? next.renamedFrom : '';
	});

	// Remember the previous column name so a save can move values once.
	// A marker that arrived with the field stays until the name changes;
	// reverting the name restores that marker instead of dropping it.
	$effect(() => {
		if (!local) return;
		const current = typeof local.db_fieldName === 'string' ? local.db_fieldName.trim() : '';
		const origin = originalDbName.trim();
		if (!origin || current === origin) {
			const restore = incomingRenamedFrom || undefined;
			if ((local.renamedFrom || undefined) !== restore) local.renamedFrom = restore;
			return;
		}
		if (local.renamedFrom !== origin) local.renamedFrom = origin;
	});

	// --- Widget metadata ---
	const widgetKey = $derived(
		local?.widget?.key || (local?.widget?.Name?.toLowerCase() as string) || ''
	);
	const widgetFn = $derived(widgets.widgetFunctions?.[widgetKey]);
	type GuiEntry = {
		widget?: string;
		label?: string;
		helper?: string;
		placeholder?: string;
		type?: string;
		rows?: number;
		options?: { value: string; label: string; disabled?: boolean }[];
		fields?: Record<string, GuiEntry>;
	};
	const guiSchema = $derived((widgetFn?.GuiSchema as Record<string, GuiEntry>) || {});
	/** Settings that need both columns (long text / nested groups). */
	const WIDE_SETTINGS = new Set(['textarea', 'Textarea', 'Json', 'group']);

	// --- Filter default vs specific fields from GuiSchema ---
	const DEFAULT_KEYS = new Set([
		'label',
		'db_fieldName',
		'required',
		'translated',
		'icon',
		'helper',
		'width',
		'permissions',
		'display',
		'placeholder',
		'default'
	]);

	const specificKeys = $derived(Object.keys(guiSchema).filter((k) => !DEFAULT_KEYS.has(k)));
	// Only keys with a registered admin control; others rendered nothing and left an empty row.
	const settingKeys = $derived(
		specificKeys.filter((k) => resolveAdminComponent(guiSchema[k]?.widget))
	);

	/** `minLength` → `Min Length`, `target_field` → `Target Field`. */
	function settingLabel(key: string): string {
		return key
			.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
			.replace(/[_-]+/g, ' ')
			.replace(/\b\w/g, (c) => c.toUpperCase());
	}

	const SETTING_HINTS: Record<string, () => string> = {
		min: widget_setting_min_hint,
		minValue: widget_setting_min_hint,
		max: widget_setting_max_hint,
		maxValue: widget_setting_max_hint,
		step: widget_setting_step_hint,
		prefix: widget_setting_prefix_hint,
		suffix: widget_setting_suffix_hint,
		minLength: widget_setting_min_length_hint,
		maxLength: widget_setting_max_length_hint
	};

	/** The widget's own `helper` text wins; common keys fall back to a shared hint. */
	function settingHint(key: string): string {
		const helper = guiSchema[key]?.helper;
		if (helper) return helper;
		return SETTING_HINTS[key]?.() ?? '';
	}

	// --- Auto-generate db_fieldName from label ---
	function labelToDbName(label: string): string {
		return (
			label
				.trim()
				.toLowerCase()
				.replace(/\s+/g, '_')
				.replace(/[^a-z0-9_]/g, '') || 'field'
		);
	}

	$effect(() => {
		if (local && !local.db_fieldName && local.label) {
			local.db_fieldName = labelToDbName(local.label);
		}
	});

	// --- Field update helper ---
	function updateField(key: string, val: any) {
		if (!local) return;
		local = { ...local, [key]: val };
	}

	// --- Save ---
	function handleSave() {
		if (!local) return;
		setTargetWidget(local);
		resolve(local);
	}

	// --- Delete ---
	function handleDelete() {
		if (!local) return;
		const confirmMsg = 'Are you sure you want to delete this widget?';
		if (!confirm(confirmMsg)) return;
		resolve({ ...local, __delete: true });
	}

	// --- Duplicate ---
	function handleDuplicate() {
		if (!local) return;
		resolve({ ...local, __duplicate: true });
	}

	// --- Cancel ---
	function handleCancel() {
		resolve(undefined);
	}

	// --- Permissions helpers ---
	// Derive local permissions (support both matrix and WidgetFieldPermissions shapes)
	const DEFAULT_PERMISSIONS = {
		visibility: 'public' as const,
		requiredAuth: false,
		readRoles: [] as string[],
		writeRoles: [] as string[]
	};

	function normalizePermissions(raw: unknown) {
		if (!raw || typeof raw !== 'object') return { ...DEFAULT_PERMISSIONS };
		const o = raw as Record<string, unknown>;
		// New shape
		if ('visibility' in o || 'readRoles' in o || 'writeRoles' in o) {
			return {
				visibility: (o.visibility as string) ?? DEFAULT_PERMISSIONS.visibility,
				requiredAuth: (o.requiredAuth as boolean) ?? false,
				readRoles: Array.isArray(o.readRoles) ? [...(o.readRoles as string[])] : [],
				writeRoles: Array.isArray(o.writeRoles) ? [...(o.writeRoles as string[])] : []
			};
		}
		// Legacy matrix shape: { [roleId]: { view: true, edit: true } }
		const matrix = raw as Record<string, Record<string, boolean>>;
		const readRoles: string[] = [];
		const writeRoles: string[] = [];
		for (const [roleId, perms] of Object.entries(matrix)) {
			if (perms?.view || perms?.read) readRoles.push(roleId);
			if (perms?.edit || perms?.write) writeRoles.push(roleId);
		}
		return {
			visibility: 'public' as const,
			requiredAuth: false,
			readRoles,
			writeRoles
		};
	}

	const localPerms = $derived(normalizePermissions(local?.permissions));

	function updatePerms(partial: Record<string, unknown>) {
		if (!local) return;
		const merged = { ...localPerms, ...partial };
		local = { ...local, permissions: merged };
	}

	function toggleRoleView(roleId: string) {
		const set = new SvelteSet(localPerms.readRoles);
		if (set.has(roleId)) set.delete(roleId);
		else set.add(roleId);
		updatePerms({ readRoles: [...set] });
	}

	function toggleRoleEdit(roleId: string) {
		const set = new SvelteSet(localPerms.writeRoles);
		if (set.has(roleId)) set.delete(roleId);
		else set.add(roleId);
		updatePerms({ writeRoles: [...set] });
	}
</script>

{#if local}
	<!-- Fixed width: the dialog sizes to its content, so tabs would otherwise resize it.
	     Height matches the Modal body cap (80vh) so only the tab content scrolls and the
	     header and footer stay in view. -->
	<div class="flex max-h-[80vh] w-full flex-col md:w-[min(56rem,calc(100vw-4rem))]">
		<!-- Header: one title with the field identity beneath it -->
		<div
			class="flex shrink-0 items-center gap-3 border-b border-(--admin-border-default) py-4 ps-6 pe-4"
		>
			<div
				class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-tertiary-500/10 text-tertiary-500 dark:bg-primary-500/10 dark:text-primary-500"
			>
				<iconify-icon
					icon={local.icon || widgetFn?.Icon || 'mdi:widgets'}
					width="22"
					aria-hidden="true"
				></iconify-icon>
			</div>
			<div class="flex min-w-0 flex-1 flex-col gap-1">
				<h2 class="truncate text-lg font-semibold leading-tight text-(--admin-text-body)">
					{widget_form_edit_field()} · {local.label || widget_form_unnamed()}
				</h2>
				<div class="flex min-w-0 items-center gap-2 text-xs text-(--admin-text-muted)">
					<Badge variant="surface" size="sm" class="uppercase tracking-wider"
						>{widgetKey || widget_form_unknown()}</Badge
					>
					{#if local.db_fieldName}
						<span class="truncate font-mono">{local.db_fieldName}</span>
					{/if}
				</div>
			</div>
			<Button
				variant="transparent"
				type="button"
				onclick={handleCancel}
				aria-label={button_close()}
				class="flex min-h-10 min-w-10 items-center justify-center p-0! text-(--admin-text-muted) hover:opacity-80"
			>
				<iconify-icon icon="mingcute:close-line" width="22" aria-hidden="true"></iconify-icon>
			</Button>
		</div>

		<!-- Tabs -->
		<div class="shrink-0 border-b border-(--admin-border-default) px-6">
			<Tabs tabs={tabDefs} bind:activeTab variant="underline" />
		</div>

		<!-- Tab Content -->
		<div class="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
			{#if activeTab === 'default'}
				<!-- Tab 1: Default — related pairs side by side -->
				<div class="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
					<div class="flex flex-col gap-1.5">
						<div class="flex items-center gap-1">
							<label for="field-label" class="text-sm font-semibold text-(--admin-text-body)"
								>{widget_form_field_label()}</label
							>
							<span class="text-error-500" aria-hidden="true">*</span>
							<SystemTooltip title={widget_form_field_label_hint()}
								><HelpIcon
									ariaLabel={widget_form_help_aria({ field: widget_form_field_label() })}
								/></SystemTooltip
							>
						</div>
						<Input
							id="field-label"
							bind:value={local.label}
							placeholder={widget_form_field_label_placeholder()}
							data-testid="widget-field-label"
							oninput={() => {
								if (!local.db_fieldName) {
									local.db_fieldName = labelToDbName(local.label);
								}
							}}
						/>
					</div>

					<div class="flex flex-col gap-1.5">
						<div class="flex items-center gap-1">
							<label for="field-dbname" class="text-sm font-semibold text-(--admin-text-body)"
								>{widget_form_db_name()}</label
							>
							<span class="text-error-500" aria-hidden="true">*</span>
							<SystemTooltip title={widget_form_db_name_hint()}
								><HelpIcon
									ariaLabel={widget_form_help_aria({ field: widget_form_db_name() })}
								/></SystemTooltip
							>
						</div>
						<Input
							id="field-dbname"
							bind:value={local.db_fieldName}
							placeholder={widget_form_db_name_placeholder()}
							data-testid="widget-field-name"
							class="font-mono"
						/>
					</div>

					<div class="flex flex-col gap-1.5">
						<div class="flex items-center gap-1">
							<label for="field-placeholder" class="text-sm font-semibold text-(--admin-text-body)"
								>{widget_form_placeholder()}</label
							>
							<SystemTooltip title={widget_form_placeholder_hint()}
								><HelpIcon
									ariaLabel={widget_form_help_aria({ field: widget_form_placeholder() })}
								/></SystemTooltip
							>
						</div>
						<Input
							id="field-placeholder"
							bind:value={local.placeholder}
							placeholder={widget_form_placeholder_placeholder()}
						/>
					</div>

					<div class="flex flex-col gap-1.5">
						<div class="flex items-center gap-1">
							<label for="field-default" class="text-sm font-semibold text-(--admin-text-body)"
								>{widget_form_default()}</label
							>
							<SystemTooltip title={widget_form_default_hint()}
								><HelpIcon
									ariaLabel={widget_form_help_aria({ field: widget_form_default() })}
								/></SystemTooltip
							>
						</div>
						<Input
							id="field-default"
							bind:value={local.default}
							placeholder={widget_form_default_placeholder()}
						/>
					</div>

					<div class="flex flex-col gap-1.5 md:col-span-2">
						<div class="flex items-center gap-1">
							<label for="field-helper" class="text-sm font-semibold text-(--admin-text-body)"
								>{widget_form_help_text()}</label
							>
							<SystemTooltip title={widget_form_help_text_hint()}
								><HelpIcon
									ariaLabel={widget_form_help_aria({ field: widget_form_help_text() })}
								/></SystemTooltip
							>
						</div>
						<Input
							id="field-helper"
							bind:value={local.helper}
							placeholder={widget_form_help_text_placeholder()}
						/>
					</div>

					<div class="flex flex-col gap-1.5">
						<div class="flex items-center gap-1">
							<label for="field-width" class="text-sm font-semibold text-(--admin-text-body)"
								>{widget_form_width()}</label
							>
							<SystemTooltip title={widget_form_width_hint()}
								><HelpIcon
									ariaLabel={widget_form_help_aria({ field: widget_form_width() })}
								/></SystemTooltip
							>
						</div>
						<Input
							id="field-width"
							bind:value={local.width}
							placeholder={widget_form_width_placeholder()}
						/>
					</div>

					<div class="flex flex-col gap-1.5">
						<div class="flex items-center gap-1">
							<span class="text-sm font-semibold text-(--admin-text-body)"
								>{widget_form_icon()}</span
							>
							<SystemTooltip title={widget_form_icon_hint()}
								><HelpIcon
									ariaLabel={widget_form_help_aria({ field: widget_form_icon() })}
								/></SystemTooltip
							>
						</div>
						<IconifyIconsPicker bind:iconselected={local.icon} bind:icon={local.icon} />
					</div>

					<!-- Behaviour switches: one row, hint under each title -->
					<div class="grid grid-cols-1 gap-4 sm:grid-cols-2 md:col-span-2">
						<div
							class="flex items-center justify-between gap-4 rounded-lg border border-(--admin-border-default) bg-(--admin-bg-card) px-4 py-3"
						>
							<div class="flex flex-col gap-0.5">
								<p class="text-sm font-semibold text-(--admin-text-body)">
									{widget_form_required()}
								</p>
								<p class="text-xs text-(--admin-text-muted)">{widget_form_required_hint()}</p>
							</div>
							<!-- No bind: Toggle's `value` has a fallback, so binding an unset field would throw -->
							<Toggle
								size="sm"
								ariaLabel={widget_form_required_aria()}
								value={!!local.required}
								onToggle={(v: boolean) => {
									local.required = v;
								}}
								class="shrink-0"
							/>
						</div>

						<div
							class="flex items-center justify-between gap-4 rounded-lg border border-(--admin-border-default) bg-(--admin-bg-card) px-4 py-3"
						>
							<div class="flex flex-col gap-0.5">
								<p class="text-sm font-semibold text-(--admin-text-body)">
									{widget_form_translated()}
								</p>
								<p class="text-xs text-(--admin-text-muted)">{widget_form_translated_hint()}</p>
							</div>
							<Toggle
								size="sm"
								ariaLabel={widget_form_translated_aria()}
								data-testid="widget-field-translated"
								value={!!local.translated}
								onToggle={(v: boolean) => {
									local.translated = v;
								}}
								class="shrink-0"
							/>
						</div>
					</div>
				</div>
			{:else if activeTab === 'settings'}
				<!-- Tab 2: Settings (widget-specific GuiFields) -->
				{#if settingKeys.length > 0}
					<!-- Same label row + spacing as the Default tab -->
					<div class="grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
						{#each settingKeys as key (key)}
							{@const entry = guiSchema[key] ?? {}}
							{@const title = entry.label || settingLabel(key)}
							{@const hint = settingHint(key)}
							{@const isWide = WIDE_SETTINGS.has(entry.widget ?? '')}
							<div class="flex flex-col gap-1.5 {isWide ? 'md:col-span-2' : ''}">
								<div class="flex items-center gap-1">
									<span class="text-sm font-semibold text-(--admin-text-body)">{title}</span>
									{#if hint}
										<SystemTooltip title={hint}
											><HelpIcon
												ariaLabel={widget_form_help_aria({ field: title })}
											/></SystemTooltip
										>
									{/if}
								</div>
								<InputSwitch
									value={local[key]}
									icon={local.icon as string}
									widget={entry.widget}
									{key}
									schema={entry}
									label={title}
									labelClass="sr-only"
									hideLabel
									onupdate={(e: { value: unknown }) => updateField(key, e.value)}
								/>
							</div>
						{/each}
					</div>
				{:else}
					<div
						class="flex flex-col items-center justify-center space-y-2 py-12 text-(--admin-text-muted)"
					>
						<iconify-icon icon="mdi:tune" width="40" class="opacity-20" aria-hidden="true"
						></iconify-icon>
						<p class="text-sm">{widget_form_no_settings()}</p>
						<p class="text-xs">
							{widget_form_no_settings_part1()}{' '}<span class="font-semibold"
								>{widgetKey || widget_form_selected()}</span
							>{' '}
							{widget_form_no_settings_part2()}
						</p>
					</div>
				{/if}
			{:else if activeTab === 'permissions'}
				<!-- Tab 3: Permissions (role-based view/edit matrix) -->
				<div class="flex flex-col gap-5">
					<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
						<!-- Visibility -->
						<div
							class="flex flex-col gap-3 rounded-lg border border-(--admin-border-default) bg-(--admin-bg-card) p-4"
						>
							<div class="flex items-center justify-between gap-3">
								<p class="text-sm font-semibold text-(--admin-text-body)">
									{widget_form_visibility()}
								</p>
								<Button
									type="button"
									variant="transparent"
									class="h-auto! gap-2 rounded-lg border border-(--admin-border-default) px-3! py-2! hover:border-tertiary-500/40 dark:hover:border-primary-500/40"
									onclick={() =>
										updatePerms({
											visibility: localPerms.visibility === 'public' ? 'private' : 'public'
										})}
								>
									<iconify-icon
										icon={localPerms.visibility === 'public' ? 'mdi:eye' : 'mdi:eye-off'}
										width="18"
										class="text-tertiary-500 dark:text-primary-500"
										aria-hidden="true"
									></iconify-icon>
									<span class="text-sm font-semibold text-(--admin-text-body)">
										{localPerms.visibility === 'public'
											? widget_form_visibility_public()
											: widget_form_visibility_private()}
									</span>
								</Button>
							</div>
							<p class="text-xs text-(--admin-text-muted)">
								{localPerms.visibility === 'public'
									? widget_form_visibility_public_hint()
									: widget_form_visibility_private_hint()}
							</p>
						</div>

						<!-- Require auth -->
						<div
							class="flex flex-col gap-3 rounded-lg border border-(--admin-border-default) bg-(--admin-bg-card) p-4"
						>
							<div class="flex min-h-10 items-center justify-between gap-3">
								<p class="text-sm font-semibold text-(--admin-text-body)">
									{widget_form_require_auth()}
								</p>
								<Toggle
									size="sm"
									ariaLabel={widget_form_require_auth_aria()}
									value={localPerms.requiredAuth}
									onToggle={(v: boolean) => updatePerms({ requiredAuth: v })}
									class="shrink-0"
								/>
							</div>
							<p class="text-xs text-(--admin-text-muted)">
								{widget_form_require_auth_hint()}
							</p>
						</div>
					</div>

					<!-- Role matrix -->
					{#if rolesProp.length > 0}
						<div class="overflow-hidden rounded-lg border border-(--admin-border-default)">
							<div
								class="flex flex-col gap-1 border-b border-(--admin-border-default) bg-(--admin-bg-card) px-4 py-3"
							>
								<p class="text-sm font-semibold text-(--admin-text-body)">
									{widget_form_role_matrix()}
								</p>
								<p class="text-xs text-(--admin-text-muted)">{widget_form_role_matrix_hint()}</p>
							</div>
							<div class="overflow-x-auto">
								<table class="w-full text-sm">
									<thead>
										<tr class="text-xs font-semibold text-(--admin-text-muted)">
											<th scope="col" class="px-4 py-2.5 text-start font-semibold"
												>{widget_form_roles_role()}</th
											>
											<th scope="col" class="w-24 px-4 py-2.5 text-center font-semibold"
												>{widget_form_roles_view()}</th
											>
											<th scope="col" class="w-24 px-4 py-2.5 text-center font-semibold"
												>{widget_form_roles_edit()}</th
											>
										</tr>
									</thead>
									<tbody>
										{#each rolesProp as role (role._id)}
											<tr
												class="border-t border-(--admin-border-subtle) transition-colors hover:bg-surface-500/10"
											>
												<td class="h-12 truncate px-4 text-(--admin-text-body)">
													{role.name ?? role._id}
												</td>
												<td class="px-4">
													<Checkbox
														size="sm"
														hideLabel
														label={widget_form_role_view_aria({ role: role.name ?? role._id })}
														checked={localPerms.readRoles.includes(role._id)}
														onchange={() => toggleRoleView(role._id)}
														class="items-center"
													/>
												</td>
												<td class="px-4">
													<Checkbox
														size="sm"
														hideLabel
														label={widget_form_role_edit_aria({ role: role.name ?? role._id })}
														checked={localPerms.writeRoles.includes(role._id)}
														onchange={() => toggleRoleEdit(role._id)}
														class="items-center"
													/>
												</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						</div>
					{:else}
						<div
							class="rounded-lg border border-dashed border-(--admin-border-default) p-6 text-center"
						>
							<iconify-icon
								icon="mdi:shield-account-outline"
								width="32"
								class="mb-2 text-(--admin-text-muted) opacity-30"
								aria-hidden="true"
							></iconify-icon>
							<p class="text-sm text-(--admin-text-muted)">
								{widget_form_no_roles()}
							</p>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Footer: quiet destructive/secondary actions start, decision end -->
		<div
			class="flex shrink-0 flex-col-reverse gap-3 border-t border-(--admin-border-default) bg-surface-500/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 dark:bg-surface-900/50"
		>
			<div class="flex justify-center gap-1 sm:justify-start">
				<Button
					variant="transparent"
					type="button"
					onclick={handleDelete}
					class="gap-2 text-error-500 hover:bg-error-500/10"
				>
					<iconify-icon icon="mdi:trash-can-outline" width="18" aria-hidden="true"></iconify-icon>
					{button_delete()}
				</Button>
				<Button variant="ghost" type="button" onclick={handleDuplicate} class="gap-2">
					<iconify-icon icon="mdi:content-copy" width="18" aria-hidden="true"></iconify-icon>
					{widget_form_duplicate()}
				</Button>
			</div>

			<div class="grid grid-cols-2 gap-3 sm:flex">
				<Button variant="outline" type="button" onclick={handleCancel}>
					{button_cancel()}
				</Button>
				<Button
					variant="tertiary"
					class="dark:bg-primary-500 dark:text-white"
					type="button"
					onclick={handleSave}
					disabled={!local?.label || !local?.db_fieldName}
					data-testid="widget-field-apply"
					aria-label={widget_form_apply_aria()}
				>
					<iconify-icon icon="mdi:content-save" width="18" aria-hidden="true"></iconify-icon>
					<span class="ms-1">{button_save()}</span>
				</Button>
			</div>
		</div>
	</div>
{/if}
