<script lang="ts">
	// typesafe-i18n
	import LL from '$i18n/i18n-svelte';

	// Skeleton
	import { popup } from '@skeletonlabs/skeleton';
	import type { PopupSettings } from '@skeletonlabs/skeleton';
	import { ListBox, ListBoxItem } from '@skeletonlabs/skeleton';
	import { modalStore } from '@skeletonlabs/skeleton';
	import type { ModalSettings, ModalComponent } from '@skeletonlabs/skeleton';

	// popupCombobox
	let listboxValue: string = 'create';

	let popupCombobox: PopupSettings = {
		event: 'click',
		target: 'Combobox',
		placement: 'bottom-end',
		closeQuery: '.listbox-item'
		//state: (e: any) => console.log('tooltip', e)
	};

	// modals
	function modalConfirm(
		action: 'create' | 'publish' | 'unpublish' | 'schedule' | 'clone' | 'delete'
	): void {
		let modalTitle: string;
		let modalBody: string;
		let modalButtonText: string;

		switch (action) {
			case 'create':
				modalTitle = $LL.ENTRYLIST_Modal_title_Create();
				modalBody = $LL.ENTRYLIST_Modal_body_Create();
				modalButtonText = $LL.ENTRYLIST_Create();
				break;
			case 'publish':
				modalTitle = $LL.ENTRYLIST_Modal_title_Publish();
				modalBody = $LL.ENTRYLIST_Modal_body_Publish();
				modalButtonText = $LL.ENTRYLIST_Publish();
				break;
			case 'unpublish':
				modalTitle = $LL.ENTRYLIST_Modal_title_Unpublish();
				modalBody = $LL.ENTRYLIST_Modal_body_Unpublish();
				modalButtonText = $LL.ENTRYLIST_Unpublish();
				break;
			case 'schedule':
				modalTitle = $LL.ENTRYLIST_Modal_title_Schedule();
				modalBody = $LL.ENTRYLIST_Modal_body_Schedule();
				modalButtonText = $LL.ENTRYLIST_Schedule();
				break;
			case 'clone':
				modalTitle = $LL.ENTRYLIST_Modal_title_Clone();
				modalBody = $LL.ENTRYLIST_Modal_body_Clone();
				modalButtonText = $LL.ENTRYLIST_Clone();
				break;
			case 'delete':
				modalTitle = $LL.ENTRYLIST_Modal_title_Delete();
				modalBody = $LL.ENTRYLIST_Modal_body_Delete();
				modalButtonText = $LL.ENTRYLIST_Delete();
				break;
			default:
				throw new Error(`Invalid action ${action}`);
		}

		const d: ModalSettings = {
			type: 'confirm',

			// Data
			title: modalTitle,
			body: modalBody,
			buttonTextCancel: $LL.ENTRYLIST_Modal_Cancel(),
			buttonTextConfirm: modalButtonText,

			//TODO : Add corresponding buttonPositive color
			// modalClasses: '!bg-gradient-to-br from-error-700 via-error-500 to-error-300',

			// TRUE if confirm pressed, FALSE if cancel pressed
			response: (r: boolean) => {
				if (r) console.log(`User ${action} confirmed`);
			}
		};

		modalStore.trigger(d);
	}

	const getButtonAndIconValues = (listboxValue: string, action: string) => {
		let actionname = '';
		let buttonClass = '';
		let iconValue = '';

		switch (listboxValue) {
			case 'create':
				actionname = $LL.ENTRYLIST_Create();
				buttonClass = 'gradient-primary';
				iconValue = 'ic:round-plus';
				break;
			case 'publish':
				actionname = $LL.ENTRYLIST_Publish();
				buttonClass = 'gradient-tertiary';
				iconValue = 'bi:hand-thumbs-up-fill';
				break;
			case 'unpublish':
				actionname = $LL.ENTRYLIST_Unpublish();
				buttonClass = 'gradient-yellow';
				iconValue = 'bi:pause-circle';
				break;
			case 'schedule':
				actionname = $LL.ENTRYLIST_Schedule();
				buttonClass = 'gradient-pink';
				iconValue = 'bi:clock';
				break;
			case 'clone':
				actionname = $LL.ENTRYLIST_Clone();
				buttonClass = 'gradient-secondary';
				iconValue = 'bi:clipboard-data-fill';
				break;
			case 'delete':
				actionname = $LL.ENTRYLIST_Delete();
				buttonClass = 'gradient-error';
				iconValue = 'bi:trash3-fill';
				break;
			default:
				actionname = '';
				buttonClass = '';
				iconValue = '';
				break;
		}

		return {
			actionname,
			buttonClass: `btn ${buttonClass} rounded-none w-48 justify-between`,
			iconValue
		};
	};
</script>

<!-- Multibuttongroup-->
<div class="btn-group rounded-l-full !rounded-r-md relative text-white w-28 md:w-56">
	<!-- Action button  -->
	<button
		type="button"
		on:click={() => {
			if (listboxValue === 'create') {
				modalConfirm('create');
			} else if (listboxValue === 'publish') {
				modalConfirm('publish');
			} else if (listboxValue === 'unpublish') {
				modalConfirm('unpublish');
			} else if (listboxValue === 'schedule') {
				modalConfirm('schedule');
			} else if (listboxValue === 'clone') {
				modalConfirm('clone');
			} else if (listboxValue === 'delete') {
				modalConfirm('delete');
			}
		}}
		class="{getButtonAndIconValues(listboxValue, listboxValue)
			.buttonClass} hover:bg-primary-400 uppercase font-bold"
	>
		<iconify-icon
			icon={getButtonAndIconValues(listboxValue, listboxValue).iconValue}
			width="20"
			class="text-white sm:mr-2"
		/>
		<div class="hidden sm:block">
			{getButtonAndIconValues(listboxValue, listboxValue).actionname}
		</div>
	</button>

	<span class="border border-white" />

	<!-- Dropdown button -->
	<button
		class="bg-surface-500 !rounded-r-md divide-x-2"
		use:popup={popupCombobox}
		style="position: relative;"
	>
		<iconify-icon icon="mdi:chevron-down" width="20" class="text-white" />
	</button>
</div>
<!-- Dropdown/Listbox -->
<div class="card w-48 shadow-xl overflow-hiddens rounded-sm z-20" data-popup="Combobox">
	<ListBox
		rounded="rounded-sm"
		active="variant-filled-primary"
		hover="hover:bg-surface-300"
		class="divide-y"
	>
		{#if listboxValue != 'create'}
			<ListBoxItem
				bind:group={listboxValue}
				name="medium"
				value="create"
				active="variant-filled-primary"
				hover="hover:bg-gradient-to-br hover:from-primary-700 hover:via-primary-600 hover:to-primary-300"
				><svelte:fragment slot="lead"
					><iconify-icon icon="material-symbols:edit" width="20" class="mr-1" /></svelte:fragment
				>
				{$LL.ENTRYLIST_Create()}
			</ListBoxItem>
		{/if}

		{#if listboxValue != 'publish'}
			<ListBoxItem
				bind:group={listboxValue}
				name="medium"
				value="publish"
				active="bg-yellow-500"
				hover="gradient-tertiary-hover"
				><svelte:fragment slot="lead"
					><iconify-icon icon="bi:hand-thumbs-up-fill" width="20" class="mr-1" /></svelte:fragment
				>
				{$LL.ENTRYLIST_Publish()}
			</ListBoxItem>
		{/if}

		{#if listboxValue != 'unpublish'}
			<ListBoxItem
				bind:group={listboxValue}
				name="medium"
				value="unpublish"
				active="bg-yellow-500"
				hover="hover:bg-gradient-to-br hover:from-yellow-700 hover:via-yellow-500 hover:to-yellow-200"
				><svelte:fragment slot="lead"
					><iconify-icon icon="bi:pause-circle" width="20" class="mr-1" /></svelte:fragment
				>
				{$LL.ENTRYLIST_Unpublish()}
			</ListBoxItem>
		{/if}

		{#if listboxValue != 'schedule'}
			<ListBoxItem
				bind:group={listboxValue}
				name="medium"
				value="schedule"
				active="bg-pink-700"
				hover="hover:bg-gradient-to-br hover:from-pink-700 hover:via-pink-600 hover:to-pink-300"
				><svelte:fragment slot="lead"
					><iconify-icon icon="bi:clock" width="20" class="mr-1" /></svelte:fragment
				>
				{$LL.ENTRYLIST_Schedule()}
			</ListBoxItem>
		{/if}

		{#if listboxValue != 'clone'}
			<ListBoxItem
				bind:group={listboxValue}
				name="medium"
				value="clone"
				active="variant-filled-error"
				hover="hover:bg-gradient-to-br hover:from-error-600 hover:via-error-500 hover:to-error-300"
				><svelte:fragment slot="lead"
					><iconify-icon icon="bi:clipboard-data-fill" width="20" class="mr-1" /></svelte:fragment
				>
				{$LL.ENTRYLIST_Clone()}
			</ListBoxItem>
		{/if}

		{#if listboxValue != 'delete'}
			<ListBoxItem
				bind:group={listboxValue}
				name="medium"
				value="delete"
				active="variant-filled-error"
				hover="hover:bg-gradient-to-br hover:from-error-600 hover:via-error-500 hover:to-error-300"
				><svelte:fragment slot="lead"
					><iconify-icon icon="bi:trash3-fill" width="20" class="mr-1" /></svelte:fragment
				>
				{$LL.ENTRYLIST_Delete()}
			</ListBoxItem>
		{/if}
	</ListBox>
</div>
