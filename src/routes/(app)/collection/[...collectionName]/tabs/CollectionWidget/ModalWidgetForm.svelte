<script lang="ts">
	import { type SvelteComponent } from 'svelte';

	// Components
	import widgets from '@components/widgets';
	import Default from './tabs/Default.svelte';
	import Permission from './tabs/Permission.svelte';
	import Specific from './tabs/Specific.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton Stores
	import { getModalStore, TabGroup, Tab } from '@skeletonlabs/skeleton';
	const modalStore = getModalStore();
	import { collectionValue, targetWidget } from '@src/stores/store';

	let tabSet: number = 0;
	// Props
	/** Exposes parent props to this component. */
	export let parent: SvelteComponent;

	// Get the keys of the widgets object
	let widget_keys = Object.keys(widgets) as unknown as keyof typeof widgets;
	let guiSchema: (typeof widgets)[typeof widget_keys]['GuiSchema'];
	guiSchema = widgets[$modalStore[0].value] ? widgets[$modalStore[0].value].GuiSchema : widgets;

	// We've created a custom submit function to pass the response and close the modal.
	async function onFormSubmit(): Promise<void> {
		if ($modalStore[0].response) {
			await $modalStore[0].response($targetWidget);
		}
		modalStore.close();
	}

	// Function to delete the widget
	function deleteWidget() {
		const confirmDelete = confirm('Are you sure you want to delete this widget?');
		if (confirmDelete) {
			// Perform deletion logic here
			let updatedFields = $collectionValue.fields.filter((field: any) => field.id !== $modalStore[0].value.id);
			collectionValue.update((c) => {
				c.fields = updatedFields;
				return c;
			});
			modalStore.close();
		}
	}

	// Base Classes
	const cBase = 'card p-4 w-screen h-screen shadow-xl space-y-4 bg-white';
	const cHeader = 'text-2xl font-bold';
	const cForm = 'border border-surface-500 p-4 space-y-4 rounded-container-token';
</script>

{#if $modalStore[0]}
	<div class={cBase}>
		<header class={`${cHeader}`}>
			{$modalStore[0]?.title ?? '(title missing)'}
		</header>
		<article class="text-center">{$modalStore[0].body ?? '(body missing)'}</article>

		<!-- Tabs Headers -->
		<form class={cForm}>
			<TabGroup justify="justify-between lg:justify-start">
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
							<div class="options-table">
								<Default {guiSchema} />
							</div>
						{/if}
					{:else if tabSet === 1}
						<!-- Permissions section -->
						<Permission {guiSchema} />
					{:else if tabSet === 2}
						<!-- Specific section -->
						<Specific {guiSchema} />
					{/if}
				</svelte:fragment>
			</TabGroup>
		</form>

		<footer class="{parent.regionFooter} justify-between">
			<!-- Delete Button -->
			<button type="button" on:click={deleteWidget} class="variant-filled-error btn">
				<iconify-icon icon="icomoon-free:bin" width="24" /><span class="hidden sm:block">{m.button_delete()}</span>
			</button>

			<!-- Cancel & Save Button -->
			<div class="flex justify-between gap-4">
				<button class="btn {parent.buttonNeutral}" on:click={parent.onClose}>{m.button_cancel()}</button>
				<button class="btn {parent.buttonPositive}" on:click={onFormSubmit}>{m.button_save()}</button>
			</div>
		</footer>
	</div>
{/if}
