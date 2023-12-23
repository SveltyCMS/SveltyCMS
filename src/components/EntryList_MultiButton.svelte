<script lang="ts">
	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	import { createEventDispatcher } from 'svelte';
	import { mode, modifyEntry, handleSidebarToggle, storeListboxValue, toggleLeftSidebar, screenWidth } from '@stores/store';
	import { get } from 'svelte/store';

	const dispatch = createEventDispatcher();

	let dropdownOpen = false;
	let actionname: string;
	let buttonClass: string;
	let iconValue: string;

	function handleButtonClick() {
		if ($storeListboxValue === 'create') {
			mode.set('create');
		} else {
			mode.set('view');
			$modifyEntry($storeListboxValue);
		}

		dispatch($storeListboxValue);
		dropdownOpen = false;

		if (get(screenWidth) === 'mobile') {
			toggleLeftSidebar.clickBack();
		}

		handleSidebarToggle();
	}

	// handleOptionClick for Button Dropdown
	function handleOptionClick(value: string): void {
		storeListboxValue.set(value as 'create' | 'publish' | 'unpublish' | 'schedule' | 'clone' | 'delete' | 'test');
		dropdownOpen = false;
	}

	const buttonMap: Record<string, [string, string, string]> = {
		create: [m.entrylist_multibutton_create(), 'gradient-tertiary', 'ic:round-plus'],
		publish: [m.entrylist_multibutton_publish(), 'gradient-primary', 'bi:hand-thumbs-up-fill'],
		unpublish: [m.entrylist_multibutton_unpublish(), 'gradient-yellow', 'bi:pause-circle'],
		schedule: [m.entrylist_multibutton_schedule(), 'gradient-pink', 'bi:clock'],
		clone: [m.entrylist_multibutton_clone(), 'gradient-secondary', 'bi:clipboard-data-fill'],
		delete: [m.entrylist_multibutton_delete(), 'gradient-error', 'bi:trash3-fill'],
		test: [m.entrylist_multibutton_testing(), 'gradient-error', 'icon-park-outline:preview-open']
	};

	// a reactive statement that runs whenever storeListboxValue is updated
	$: {
		[actionname, buttonClass, iconValue] = buttonMap[$storeListboxValue] || ['', '', ''];
		buttonClass = `btn ${buttonClass} rounded-none w-36 justify-between`;
	}
</script>

<div class="inline-flex rounded">
	<!-- left button -->
	<button
		type="button"
		class={`inline-block w-[60px] rounded-l-full pl-3 font-medium uppercase leading-normal text-black transition duration-150 ease-in-out md:w-auto dark:text-white ${buttonClass}`}
		on:click|preventDefault={handleButtonClick}
	>
		<span class="flex items-center">
			<iconify-icon icon={iconValue} width="24" />
			<span class="ml-2 hidden md:block">{actionname}</span>
		</span>
	</button>
	<!-- white line -->
	<div class="border-l-2 border-white"></div>

	<!-- dropdown button -->
	<button
		type="button"
		class="relative inline-block rounded-r bg-surface-600 px-2 text-xs font-medium uppercase leading-normal text-white transition duration-150 ease-in-out hover:bg-surface-500 focus:bg-surface-500 focus:outline-none focus:ring-0 active:bg-surface-500"
		on:click|preventDefault={() => (dropdownOpen = !dropdownOpen)}
	>
		<iconify-icon icon="mdi:chevron-down" width="24" />
	</button>

	{#if dropdownOpen}
		<ul class="absolute right-2 top-14 z-10 mt-1 divide-y rounded-sm border bg-surface-700 text-white ring-1 ring-black ring-opacity-5">
			{#each Object.keys(buttonMap) as type}
				{#if $storeListboxValue !== type}
					<li>
						<button
							type="button"
							class={`gradient-${buttonMap[type][1]}-hover gradient-${buttonMap[type][1]}-focus w-full px-4 py-2 text-left focus:outline-none`}
							on:click|preventDefault={() => handleOptionClick(type)}
						>
							<span class="flex items-center">
								<iconify-icon icon={buttonMap[type][2]} width="24" />
								<span class="ml-2">{buttonMap[type][0]}</span>
							</span>
						</button>
					</li>
				{/if}
			{/each}
		</ul>
	{/if}
</div>
