<!-- 
 @file src/routes/(app)/config/collectionbuilder/[action]/[...contentPath]/tabs/collection-widget/modal-widget-form.svelte
 @component Modal form for configuring a single widget/field
 -->
<script lang="ts">
	import { button_cancel, button_delete, button_save, system_permission } from "@src/paraglide/messages";
	import { collectionValue, setCollectionValue, targetWidget } from "@src/stores/collection-store.svelte";
	import { widgets } from "@src/stores/widget-store.svelte.ts";
	import { modalState } from "@utils/modal.svelte";
	import type { Role } from "@src/databases/auth/types";
	import type { SvelteComponent } from "svelte";
	import Default from "./tabs-fields/default.svelte";
	import Permission from "./tabs-fields/permission.svelte";
	import Specific from "./tabs-fields/specific.svelte";

	let localTabSet = $state("0");

	interface Props {
		parent?: any;
		response?: (r: any) => void;
		value: any;
		roles?: Role[];
	}

	const { value, response, roles: rolesProp = [] }: Props = $props();

	const widgetKey = $derived(value?.widget?.key || (value?.widget?.Name?.toLowerCase() as string));
	const availableWidgets = $derived(widgets.widgetFunctions || {});
	const guiSchema = $derived(
		(availableWidgets[widgetKey]?.GuiSchema || {}) as Record<string, { widget: typeof SvelteComponent }>
	);

	const options = $derived(guiSchema ? Object.keys(guiSchema) : []);
	const specificOptions = $derived(
		options.filter(
			(option) =>
				![
					"label",
					"display",
					"db_fieldName",
					"required",
					"translated",
					"icon",
					"helper",
					"width",
					"permissions"
				].includes(option)
		)
	);

	async function onFormSubmit(): Promise<void> {
		if (response) {
			response(targetWidget.value);
		}
		modalState.close();
	}

	function deleteWidget() {
		const confirmDelete = confirm("Are you sure you want to delete this widget?");
		if (confirmDelete) {
			if (collectionValue && Array.isArray(collectionValue.value.fields)) {
				const newFields = (collectionValue.value.fields as any[]).filter((field: any) => field.id !== value.id);
				setCollectionValue({
					...collectionValue.value,
					fields: newFields
				});
			}
			modalState.close();
		}
	}

	function tabButtonClass(value: string) {
		return `flex items-center gap-1 px-4 py-2 ${localTabSet === value ? "font-bold text-tertiary-500 dark:text-primary-500" : ""}`;
	}

	const cForm = "border border-surface-500 p-4 space-y-4 rounded-xl";
</script>

<div class="space-y-4">
	<form class={cForm}>
		<div>
			<div class="flex justify-between border-b border-surface-200-800 lg:justify-start" role="tablist" aria-label="Widget configuration tabs">
				<button
					type="button"
					role="tab"
					aria-selected={localTabSet === "0"}
					class={tabButtonClass("0")}
					onclick={() => (localTabSet = "0")}
				>
					<iconify-icon icon="mdi:required" width={24}></iconify-icon>
					<span>Default</span>
				</button>

				<button
					type="button"
					role="tab"
					aria-selected={localTabSet === "1"}
					class={tabButtonClass("1")}
					onclick={() => (localTabSet = "1")}
				>
					<iconify-icon icon="mdi:security-lock" width={24}></iconify-icon>
					<span>{system_permission()}</span>
				</button>

				{#if specificOptions.length > 0}
					<button
						type="button"
						role="tab"
						aria-selected={localTabSet === "2"}
						class={tabButtonClass("2")}
						onclick={() => (localTabSet = "2")}
					>
						<iconify-icon icon="ph:star-fill" width={24}></iconify-icon>
						<span>Specific</span>
					</button>
				{/if}
			</div>

			{#if localTabSet === "0"}
				<div role="tabpanel">
					<Default guiSchema={guiSchema as any} />
				</div>
			{/if}

			{#if localTabSet === "1"}
				<div role="tabpanel">
					<Permission roles={rolesProp} />
				</div>
			{/if}

			{#if specificOptions.length > 0 && localTabSet === "2"}
				<div role="tabpanel">
					<Specific />
				</div>
			{/if}
		</div>
	</form>

	<div class="hidden"></div>

	<footer class="flex justify-between border-t border-surface-500/20 pt-4">
		<div class="flex gap-2">
			<button type="button" onclick={deleteWidget} aria-label="Delete" class="preset-filled-error-500 btn">
				<iconify-icon icon="icomoon-free:bin" width={24}></iconify-icon>
				<span class="hidden sm:block">{button_delete()}</span>
			</button>

			<button
				type="button"
				onclick={() => {
					if (response) {
						response({ ...targetWidget.value, __duplicate: true });
					}
					modalState.close();
				}}
				aria-label="Duplicate"
				class="preset-filled-tertiary-500 btn"
			>
				<iconify-icon icon="mdi:content-copy" width={24}></iconify-icon>
				<span class="hidden sm:block">Duplicate</span>
			</button>
		</div>

		<div class="flex justify-between gap-4">
			<button type="button" aria-label={button_cancel()} class="btn preset-outlined-secondary-500" onclick={() => modalState.close()}>
				{button_cancel()}
			</button>
			<button type="button" aria-label={button_save()} class="btn preset-filled-primary-500" onclick={onFormSubmit}>
				{button_save()}
			</button>
		</div>
	</footer>
</div>