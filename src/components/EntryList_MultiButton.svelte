<!--
 @files src/components/EntryList_MultiButton.svelte
@description EntryList_MultiButton component.
-->

<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	// Stores
	import { storeListboxValue } from '@stores/store';
	import { mode, modifyEntry } from '@stores/collectionStore';
	import { handleSidebarToggle } from '@stores/sidebarStore';

	// Components
	import ScheduleModal from './ScheduleModal.svelte';

	// ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { getModalStore, type ModalComponent, type ModalSettings } from '@skeletonlabs/skeleton';

	export let isCollectionEmpty: boolean;

	const modalStore = getModalStore();
	const dispatch = createEventDispatcher();

	// Modal Trigger - Schedule
	function openScheduleModal(): void {
		// console.log('Triggered - modalScheduleForm');
		const modalComponent: ModalComponent = {
			// Pass a reference to your custom component
			ref: ScheduleModal,
			// Provide default slot content as a template literal
			slot: '<p>Edit Form</p>'
		};
		const modalSettings: ModalSettings = {
			type: 'component',
			// NOTE: title, body, response, etc are supported!
			title: 'Scheduler',
			body: 'Set a date and time to schedule this entry.',
			component: modalComponent,
			// Pass arbitrary data to the component
			response: (r: boolean) => {
				if (r) console.log('Scheduling successful');
			}
		};
		modalStore.trigger(modalSettings);
	}

	let dropdownOpen = false;
	let actionname: string;
	let buttonClass: string;
	let iconValue: string;

	function handleButtonClick() {
		switch ($storeListboxValue) {
			case 'create':
				mode.set('create');
				handleSidebarToggle();
				break;
			case 'publish':
				mode.set('view');
				$modifyEntry('publish');
				break;
			case 'unpublish':
				mode.set('view');
				$modifyEntry('unpublish');
				break;
			case 'schedule':
				mode.set('view');
				$modifyEntry('schedule');
				break;
			case 'clone':
				mode.set('view');
				$modifyEntry('clone');
				break;
			case 'delete':
				mode.set('view');
				$modifyEntry('delete');
				break;
			case 'test':
				mode.set('view');
				$modifyEntry('test');
				break;
			default:
				// Handle other actions here
				break;
		}

		dispatch($storeListboxValue);
		dropdownOpen = false;
	}

	// handleOptionClick for Button Dropdown
	function handleOptionClick(value: string): void {
		storeListboxValue.set(value as 'create' | 'publish' | 'unpublish' | 'schedule' | 'clone' | 'delete' | 'test');
		dropdownOpen = false;
	}

	const buttonMap: Record<string, [string, string, string, string]> = {
		create: [m.entrylist_multibutton_create(), 'gradient-tertiary', 'ic:round-plus', 'text-tertiary-500'],
		publish: [m.entrylist_multibutton_publish(), 'gradient-primary', 'bi:hand-thumbs-up-fill', 'text-primary-500'],
		unpublish: [m.entrylist_multibutton_unpublish(), 'gradient-yellow', 'bi:pause-circle', 'text-yellow-500'],
		schedule: [m.entrylist_multibutton_schedule(), 'gradient-pink', 'bi:clock', 'text-pink-500'],
		clone: [m.entrylist_multibutton_clone(), 'gradient-secondary', 'bi:clipboard-data-fill', 'text-secondary-500'],
		delete: [m.button_delete(), 'gradient-error', 'bi:trash3-fill', 'text-error-500'],
		test: [m.entrylist_multibutton_testing(), 'gradient-error', 'icon-park-outline:preview-open', 'text-error-500']
	};

	// a reactive statement that runs whenever storeListboxValue is updated
	$: {
		[actionname, buttonClass, iconValue] = buttonMap[$storeListboxValue] || ['', '', '', ''];
		buttonClass = `btn ${buttonClass} rounded-none w-36 justify-between`;
	}

	$: if (isCollectionEmpty && $storeListboxValue !== 'create') {
		storeListboxValue.set('create');
	}
</script>

<!-- Multibutton group-->
<div class="relative z-20 mt-1 font-medium text-white">
	<div class="variant-filled-token btn-group flex overflow-hidden rounded-l-full rounded-r-md rtl:rounded rtl:rounded-r-full">
		<!-- Left button -->
		<button type="button" class={`w-[60px] md:w-auto rtl:rotate-180 ${buttonClass} rounded-l-full`} on:click|preventDefault={handleButtonClick}>
			<span class="grid grid-cols-[24px_auto] items-center gap-2 rtl:rotate-180">
				<iconify-icon icon={iconValue} width="24" class="text-white" />
				<span class="hidden text-left md:block">{actionname}</span>
			</span>
		</button>

		<!-- White line -->
		<div class="border-l-[3px] border-white" />

		<!-- Dropdown button -->
		<button
			type="button"
			class="flex w-[42px] items-center justify-center rounded-r-md bg-surface-400 dark:bg-surface-600"
			on:click|preventDefault={() => (dropdownOpen = !dropdownOpen)}
		>
			<iconify-icon icon="mdi:chevron-down" width="24" class="text-white" />
		</button>
	</div>

	{#if dropdownOpen}
		<ul
			class="drops absolute right-2 top-full z-50 mt-1 max-h-[300px] divide-y divide-white overflow-y-auto rounded bg-surface-400 dark:bg-surface-700 rtl:left-2 rtl:right-auto"
		>
			{#each Object.keys(buttonMap) as type}
				{#if $storeListboxValue !== type}
					<li class={`hover:text-white gradient-${buttonMap[type][1]}-hover gradient-${buttonMap[type][1]}-focus`}>
						<button
							type="button"
							class={`btn flex w-full justify-between gap-2 gradient-${buttonMap[type][1]} ${buttonMap[type][1]}-hover ${buttonMap[type][1]}-focus`}
							on:click|preventDefault={() => handleOptionClick(type)}
						>
							<iconify-icon icon={buttonMap[type][2]} width="24" class=""></iconify-icon>
							<p class="w-full">{buttonMap[type][0]}</p>
						</button>
					</li>
				{/if}
			{/each}
		</ul>
	{/if}
</div>
