<script lang="ts">
	// Icons from https://icon-sets.iconify.design/
	import Icon from '@iconify/svelte';

	// Skeleton
	import { popup } from '@skeletonlabs/skeleton';
	import type { PopupSettings } from '@skeletonlabs/skeleton';
	import { ListBox, ListBoxItem } from '@skeletonlabs/skeleton';

	// Popup Tooltips
	let EditSettings: PopupSettings = {
		event: 'hover',
		target: 'EditPopup',
		placement: 'left'
	};
	let DeleteSettings: PopupSettings = {
		event: 'hover',
		target: 'DeletePopup',
		placement: 'left'
	};
	let BlockSettings: PopupSettings = {
		event: 'hover',
		target: 'BlockPopup',
		placement: 'left'
	};
	let UnblockSettings: PopupSettings = {
		event: 'hover',
		target: 'UnblockPopup',
		placement: 'left'
	};

	let multiSelectSettings: PopupSettings = {
		event: 'click', // Set the event as: click | hover | hover-click
		target: 'multiSelect' // Provide a matching 'data-popup' value.
	};

	let listboxValue: string = 'create';
	let Combobox: PopupSettings = {
		event: 'click',
		target: 'Combobox',
		placement: 'bottom',
		closeQuery: '.listbox-item'
		// state: (e: any) => console.log('tooltip', e)
	};

	import { Toast, toastStore } from '@skeletonlabs/skeleton';
	import type { ToastSettings } from '@skeletonlabs/skeleton';

	function toastDemo(): void {
		const t: ToastSettings = {
			message: listboxValue,
			background: 'bg-error-400',
			callback: (response) => console.log(response)
		};
		toastStore.trigger(t);
	}

	const getButtonAndIconValues = (listboxValue: string) => {
		let buttonClass = '';
		let iconValue = '';

		switch (listboxValue) {
			case 'create':
				buttonClass = 'bg-gradient-to-br from-primary-700 via-primary-600 to-primary-400';
				iconValue = 'material-symbols:edit';
				break;
			case 'delete':
				buttonClass = 'bg-gradient-to-br from-error-700 via-error-500 to-error-300';
				iconValue = 'bi:trash3-fill';
				break;
			case 'unblock':
				buttonClass = 'bg-gradient-to-br from-yellow-600 via-yellow-500 to-yellow-400';
				iconValue = 'material-symbols:lock-open';
				break;
			case 'block':
				buttonClass = 'bg-gradient-to-br from-pink-700 via-pink-500 to-pink-400';
				iconValue = 'material-symbols:lock';
				break;
			default:
				buttonClass = 'variant-filled';
				iconValue = 'material-symbols:edit';
				break;
		}

		return {
			buttonClass: `btn ${buttonClass} rounded-none w-48 justify-between`,
			iconValue
		};
	};
</script>

<!-- Multibuttongroup-->
<div class="btn-group rounded-md">
	<!-- Action button  -->

	<button
		type="button"
		on:click={toastDemo}
		class="{getButtonAndIconValues(listboxValue)
			.buttonClass} hover:bg-primary-400 uppercase font-semibold"
	>
		<Icon
			icon={getButtonAndIconValues(listboxValue).iconValue}
			width="20"
			class="text-white mr-2"
		/>
		{listboxValue ?? 'create'}
	</button>

	<span class="border border-white" />

	<!-- Dropdown button -->
	<button class="bg-surface-500 rounded-r-sm" use:popup={Combobox}>
		<Icon icon="mdi:chevron-down" width="20" class="text-white" />
	</button>

	<!-- Dropdown/Listbox -->
	<div class="card w-48 shadow-xl overflow-hiddens" data-popup="Combobox">
		<ListBox rounded="rounded-none" active="variant-filled-primary" hover="hover:bg-surface-300">
			{#if listboxValue != 'create'}
				<ListBoxItem
					bind:group={listboxValue}
					name="medium"
					value="create"
					active="variant-filled-primary"
					hover="hover:bg-gradient-to-br hover:from-primary-700 hover:via-primary-600 hover:to-primary-400"
					><svelte:fragment slot="lead"
						><Icon icon="material-symbols:edit" width="20" class="mr-1" /></svelte:fragment
					>
					Create
				</ListBoxItem>
			{/if}

			{#if listboxValue != 'delete'}
				<ListBoxItem
					bind:group={listboxValue}
					name="medium"
					value="delete"
					active="variant-filled-error"
					hover="hover:bg-gradient-to-br hover:from-error-600 hover:via-error-500 hover:to-error-400"
					><svelte:fragment slot="lead"
						><Icon icon="bi:trash3-fill" width="20" class="mr-1" /></svelte:fragment
					>
					Delete
				</ListBoxItem>
			{/if}

			{#if listboxValue != 'unblock'}
				<ListBoxItem
					bind:group={listboxValue}
					name="medium"
					value="unblock"
					active="bg-yellow-500"
					hover="hover:bg-gradient-to-br hover:from-yellow-600 hover:via-yellow-500 hover:to-yellow-400"
					><svelte:fragment slot="lead"
						><Icon icon="material-symbols:lock-open" width="20" class="mr-1" /></svelte:fragment
					>
					Unblock
				</ListBoxItem>
			{/if}

			{#if listboxValue != 'block'}
				<ListBoxItem
					bind:group={listboxValue}
					name="medium"
					value="block"
					active="bg-pink-700"
					hover="hover:bg-gradient-to-br hover:from-pink-700 hover:via-pink-500 hover:to-pink-400"
					><svelte:fragment slot="lead"
						><Icon icon="material-symbols:lock" width="20" class="mr-1" /></svelte:fragment
					>
					Block
				</ListBoxItem>
			{/if}
		</ListBox>
	</div>
</div>
