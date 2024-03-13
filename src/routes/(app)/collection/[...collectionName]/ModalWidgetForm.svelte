<script lang="ts">
	import type { SvelteComponent } from 'svelte';
	import widgets from '@components/widgets';
	import InputSwitch from '@components/system/builder/InputSwitch.svelte';
	import { asAny } from '@utils/utils';
	export const addField: boolean = false;

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Stores
	import { getModalStore } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();
	import { TabGroup, Tab } from '@skeletonlabs/skeleton';
	let tabSet: number = 0;

	// Props
	/** Exposes parent props to this component. */
	export let parent: SvelteComponent;

	// Form Data
	// console.log([$modalStore[0].value]);

	// Form Data
	let formData: any = {};

	// Check if the selected widget has a key property.
	if ($modalStore[0].value.key) {
		// If the selected widget has a key property, then it is an existing widget.
		// Use the $modalStore[0].value object as the formData.
		formData = {
			...$modalStore[0].value
		};
	} else {
		// If the selected widget does not have a key property, then it is a new widget.
		// Create a new formData object for the new widget.
		formData = {
			// ...widgets[$modalStore[0].value],
			key: $modalStore[0].value,
			GuiFields: { ...widgets[$modalStore[0].value]?.GuiSchema }
		};
	}

	// Get the keys of the widgets object
	let widget_keys = Object.keys(widgets) as unknown as keyof typeof widgets;
	let guiSchema: (typeof widgets)[typeof widget_keys]['GuiSchema'];
	guiSchema = widgets[$modalStore[0].value]?.GuiSchema;
	console.log('guiSchema:', guiSchema);

	// We've created a custom submit function to pass the response and close the modal.
	function onFormSubmit(): void {
		if ($modalStore[0].response) $modalStore[0].response(formData);
		modalStore.close();
	}

	// Function to delete the widget
	function deleteWidget() {
		const confirmDelete = confirm('Are you sure you want to delete this widget?');
		if (confirmDelete) {
			// Perform deletion logic here

			modalStore.close();
		}
	}

	// Base Classes
	const cBase = 'card p-4 w-modal shadow-xl space-y-4 ';
	const cHeader = 'text-2xl font-bold text-center text-tertiary-500 dark:text-primary-500 ';
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-container-token';
</script>

<!-- @component This example creates a simple form modal. -->

{#if $modalStore[0]}
	<div class={cBase}>
		<header class={`${cHeader}`}>
			{$modalStore[0]?.title ?? '(title missing)'}
		</header>
		<article class="text-center">{$modalStore[0].body ?? '(body missing)'}</article>

		<!-- Enable for debugging: -->
		<form class={cForm}>
			<TabGroup>
				<Tab bind:group={tabSet} name="tab1" value={0}>
					<div class="flex items-center gap-1">
						<iconify-icon icon="mdi:required" width="24" class="text-tertiary-500 dark:text-primary-500" />
						<span>Default</span>
					</div>
				</Tab>
				<Tab bind:group={tabSet} name="tab2" value={1}>
					<div class="flex items-center gap-1">
						<iconify-icon icon="mdi:security-lock" width="24" class="text-tertiary-500 dark:text-primary-500" />
						<span>{m.collection_permission()}</span>
					</div>
				</Tab>
				<Tab bind:group={tabSet} name="tab3" value={2}>
					<div class="flex items-center gap-1">
						<iconify-icon icon="ph:star-fill" width="24" class="text-tertiary-500 dark:text-primary-500" />
						<span>Specific</span>
					</div>
				</Tab>

				<!-- Tab Panels --->
				<svelte:fragment slot="panel">
					{#if tabSet === 0}
						{#if $modalStore[0].value}
							<!-- Default section -->

							<div class="mb-2 border-y text-center text-primary-500">
								<div class="text-xl text-primary-500">
									Widget <span class="font-bold text-black dark:text-white">{$modalStore[0].value.key}</span> Input Options
								</div>
								<div class="my-1 text-xs text-error-500">* Required</div>
							</div>
							<div class="options-table">
								<!-- Default section -->
								{#each ['label', 'display', 'db_fieldName', 'translated', 'icon', 'width'] as property}
									<InputSwitch bind:value={formData[property]} widget={asAny(guiSchema[property]).widget} key={property} />
								{/each}
							</div>
						{/if}
					{:else if tabSet === 1}
						<!-- Permissions section -->
						{#each ['permissions'] as property}
							<InputSwitch bind:value={formData[property]} widget={asAny(guiSchema[property]).widget} key={property} />
						{/each}
					{:else if tabSet === 2}
						<!-- Specific section -->
						{#each Object.keys(guiSchema) as property}
							{#if !['label', 'display', 'db_fieldName', 'translated', 'icon', 'width', 'permissions'].includes(property)}
								<InputSwitch bind:value={formData[property]} widget={asAny(guiSchema[property]).widget} key={property} />
							{/if}
						{/each}
					{/if}
				</svelte:fragment>
			</TabGroup>
		</form>

		<!-- prettier-ignore -->
		<footer class="{parent.regionFooter} justify-between">
			<!-- Delete Button -->
			<button type="button" on:click={deleteWidget} class="variant-filled-error btn">
				<iconify-icon icon="icomoon-free:bin" width="24" /><span class="hidden sm:block">Delete</span>
			</button>
	
		<div class="flex justify-between gap-2">
			<button class="btn {parent.buttonNeutral}" on:click={parent.onClose}>{m.modalcategory_cancel()}</button>
			<button class="btn {parent.buttonPositive}" on:click={onFormSubmit}>{m.modalcategory_save()}</button>
		</div>

		</footer>
	</div>
{/if}
