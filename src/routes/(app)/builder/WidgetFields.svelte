<script lang="ts">
	//Stores
	import { toggleSidebar, sidebarState } from '@stores/sidebarStore';

	// Components
	import PageTitle from '@components/PageTitle.svelte';
	import widgets from '@components/widgets';
	import InputSwitch from './InputSwitch.svelte';

	import { asAny } from '@utils/utils';

	export let fields: Array<any> = [];

	let widget_keys = Object.keys(widgets) as unknown as keyof typeof widgets;
	let currentFieldKey: keyof typeof widgets | null = null;
	let currentField: any;
	let guiSchema: (typeof widgets)[typeof widget_keys]['GuiSchema'];
	$: if (currentFieldKey) {
		guiSchema = widgets[currentFieldKey]?.GuiSchema;
	}
	let destruct = (node: HTMLDivElement) => {
		node.remove();
	};
</script>

<!-- list of widget names -->

{#each fields as field}
	<button
		type="button"
		on:click={() => {
			currentFieldKey = field.widget.key;
			currentField = field;
		}}
		class="variant-ghost-tertiary btn w-full"
	>
		{field.widget.key}
	</button>
	<div use:destruct>
		{#each Object.entries(widgets[field.widget.key].GuiSchema) as [property, value]}
			<InputSwitch bind:value={field.widget.GuiFields[property]} widget={asAny(value).widget} key={property} />
		{/each}
	</div>
{/each}

<!-- Edit individual selected widget  -->
{#if currentField}
	<div
		class="fixed -top-16 left-0 flex h-screen w-screen flex-col items-center justify-center overflow-auto bg-white dark:bg-surface-900 {$sidebarState.left ===
		'full'
			? 'left-[220px] '
			: 'left-0 '}"
	>
		<div class="fixed top-0 flex items-center justify-between {$sidebarState.left === 'full' ? 'left-[220px] w-full' : 'left-0 w-screen'}">
			<PageTitle name="Edit Widget" icon="material-symbols:ink-pen" iconColor="text-primary-500" />

			<div class="flex gap-2">
				<!--  Save Button -->
				<button class="variant-filled-primary btn" on:click={() => (currentField = null)}>Save</button>
				<!--  cancel Button -->
				<button class="variant-ghost-secondary btn-icon mr-2" on:click={() => (currentField = null)}>
					<iconify-icon icon="material-symbols:close" width="24" /></button
				>
			</div>
		</div>

		<div class="z-100 flex flex-col items-center justify-center gap-1">
			{#each Object.entries(guiSchema) as [property, value]}
				<div class="w-full">
					<InputSwitch bind:value={currentField.widget.GuiFields[property]} widget={asAny(value).widget} key={property} />
				</div>
			{/each}
		</div>
	</div>
{/if}
