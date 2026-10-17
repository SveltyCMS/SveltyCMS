<!--
@file src/components/system/builder/input-switch.svelte
@component
**InputSwitch component**

Renders the admin control declared by a widget GuiSchema entry.

Features:
- Resolves string widget names through the admin component registry (incl. aliases)
- Forwards schema props such as `options`, `type`, `placeholder` and `rows`
- Handles Checkbox's `checked` contract and Select's label-less `ariaLabel`
- Reports value/icon changes to the parent exactly once per change
-->

<script lang="ts">
	// sanitizePermissions function moved to component - simplified implementation
	function sanitizePermissions(permissions: Record<string, Record<string, boolean>>) {
		const res = Object.entries(permissions).reduce(
			(acc, [role, actions]) => {
				const nonEmptyActions = Object.entries(actions).reduce(
					(actionAcc, [action, value]) => {
						if (value !== false) {
							actionAcc[action] = value;
						}
						return actionAcc;
					},
					{} as Record<string, boolean>
				);
				if (Object.keys(nonEmptyActions).length > 0) {
					acc[role] = nonEmptyActions;
				}
				return acc;
			},
			{} as Record<string, Record<string, boolean>>
		);
		return Object.keys(res).length === 0 ? undefined : res;
	}
	// Props from parent
	let {
		value = $bindable(null),
		icon = $bindable(null),
		permissions = $bindable(null),
		...props
	} = $props();

	$effect(() => {
		if (props.key === 'display' && value?.default === true) {
			value = '';
		}
	});

	$effect(() => {
		if (props.key === 'permissions' && value) {
			permissions = sanitizePermissions(value);
		}
	});

	// Function to update the parent component (so Field Inspector → setCollection gets label, db_fieldName, icon, etc.)
	function updateParent() {
		if (props.onupdate) {
			props.onupdate({ value, icon });
		}
	}

	// Many admin inputs (e.g. Input.svelte) only use bind:value and never dispatch 'update'.
	// IconifyIconsPicker updates bind:icon; we must pass both so icon changes persist. Only sync when
	// value or icon actually changed to avoid effect_update_depth_exceeded.
	const lastReported = { value: undefined as unknown, icon: undefined as unknown };
	$effect(() => {
		const v = value;
		const i = icon;
		if (v === lastReported.value && i === lastReported.icon) return;
		lastReported.value = v;
		lastReported.icon = i;
		updateParent();
	});

	import { resolveAdminComponent } from '@src/components/system/admin-component-registry';

	const WidgetComponent = $derived(resolveAdminComponent(props.widget));
	const widgetName = $derived(typeof props.widget === 'string' ? props.widget : '');
	const isCheckbox = $derived(widgetName === 'Checkbox');
	const isSelect = $derived(widgetName === 'Select' || widgetName === 'select');
	const isInput = $derived(widgetName === 'Input' || widgetName === 'input');
	const isTextarea = $derived(widgetName === 'textarea' || widgetName === 'Textarea');
	const label = $derived(props.label ?? props.key);

	/** Props declared by the GuiSchema entry that the control should receive. */
	const schemaProps = $derived(
		(props.schema ?? {}) as {
			placeholder?: unknown;
			type?: unknown;
			rows?: unknown;
			options?: unknown;
		}
	);

	/**
	 * Select has no labelClass: give it an aria-label and let the caller render the
	 * visible label. The other controls accept a hidden (sr-only) label.
	 */
	const controlProps = $derived.by(() => {
		const extra: Record<string, unknown> = {};
		if (isSelect) {
			extra.ariaLabel = label;
			if (schemaProps.options !== undefined) extra.options = schemaProps.options;
			if (schemaProps.placeholder !== undefined) extra.placeholder = schemaProps.placeholder;
			return extra;
		}

		extra.label = label;
		if (props.labelClass !== undefined) extra.labelClass = props.labelClass;
		if (isInput) {
			if (schemaProps.type !== undefined) extra.type = schemaProps.type;
			if (schemaProps.placeholder !== undefined) extra.placeholder = schemaProps.placeholder;
		} else if (isTextarea) {
			if (schemaProps.placeholder !== undefined) extra.placeholder = schemaProps.placeholder;
			if (schemaProps.rows !== undefined) extra.rows = schemaProps.rows;
		}
		return extra;
	});
</script>

{#if WidgetComponent}
	{#if isCheckbox}
		<!-- Checkbox uses `checked`, not `value`; the shared $effect reports the change. -->
		<WidgetComponent
			checked={!!value}
			onchange={(checked: boolean) => (value = checked)}
			{label}
			hideLabel={props.hideLabel ?? false}
		/>
	{:else}
		<WidgetComponent
			bind:value
			bind:icon
			bind:permissions
			on:update={updateParent}
			{...controlProps}
		/>
	{/if}
{/if}
