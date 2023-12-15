<script lang="ts">
	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	import { createEventDispatcher } from 'svelte';
	import { mode, modifyEntry, handleSidebarToggle, storeListboxValue, toggleLeftSidebar, screenWidth } from '@stores/store';
	import { get } from 'svelte/store';

	const dispatch = createEventDispatcher();

	let dropdownOpen = false;
	let { actionname, buttonClass, iconValue } = getButtonAndIconValues($storeListboxValue);

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
	function handleOptionClick(value: any) {
		storeListboxValue.set(value);

		({ actionname, buttonClass, iconValue } = getButtonAndIconValues($storeListboxValue));
		dropdownOpen = false;
	}

	function getButtonAndIconValues(storeListboxValue: string) {
		let actionname: string;
		let buttonClass: string;
		let iconValue: string;

		switch (storeListboxValue) {
			case 'create':
				actionname = m.entrylist_multibutton_create();
				buttonClass = 'gradient-tertiary';
				iconValue = 'ic:round-plus';
				break;
			case 'publish':
				actionname = m.entrylist_multibutton_publish();
				buttonClass = 'gradient-primary';
				iconValue = 'bi:hand-thumbs-up-fill';
				break;
			case 'unpublish':
				actionname = m.entrylist_multibutton_unpublish();
				buttonClass = 'gradient-yellow';
				iconValue = 'bi:pause-circle';
				break;
			case 'schedule':
				actionname = m.entrylist_multibutton_schedule();
				buttonClass = 'gradient-pink';
				iconValue = 'bi:clock';
				break;
			case 'clone':
				actionname = m.entrylist_multibutton_clone();
				buttonClass = 'gradient-secondary';
				iconValue = 'bi:clipboard-data-fill';
				break;
			case 'delete':
				actionname = m.entrylist_multibutton_delete();
				buttonClass = 'gradient-error';
				iconValue = 'bi:trash3-fill';
				break;
			case 'test':
				actionname = m.entrylist_multibutton_testing();
				buttonClass = 'gradient-error';
				iconValue = 'icon-park-outline:preview-open';
				break;
			default:
				actionname = '';
				buttonClass = '';
				iconValue = '';
				break;
		}

		//console.log('storeListboxValue:', storeListboxValue);

		return {
			actionname,
			buttonClass: `btn ${buttonClass} rounded-none w-36 justify-between`,
			iconValue
		};
	}

	// a reactive statement that runs whenever mode.set is updated

	$: {
		({ actionname, buttonClass, iconValue } = getButtonAndIconValues($storeListboxValue));
	}
</script>

<div class=" inline-flex rounded">
	<!-- left button -->
	<button
		type="button"
		class={`inline-block w-[60px] rounded-l-full pl-3 font-medium uppercase leading-normal text-black transition duration-150 ease-in-out dark:text-white md:w-auto ${buttonClass}`}
		on:click|preventDefault={handleButtonClick}
	>
		<span class="flex items-center">
			<iconify-icon icon={iconValue} width="24" />
			<span class="ml-2 hidden md:block">{actionname}</span>
		</span>
	</button>
	<!-- white line -->
	<div class="border-l-2 border-white" />

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
			{#if $storeListboxValue !== 'create'}
				<li>
					<!-- TODO: FIX Sidebar & RightSidebar Toggle -->
					<button
						type="button"
						class="gradient-tertiary-hover gradient-tertiary-focus w-full px-4 py-2 text-left focus:outline-none"
						on:click|preventDefault={() => handleOptionClick('create')}
					>
						<span class="flex items-center">
							<iconify-icon icon="ic:round-plus" width="24" />
							<span class="ml-2">{m.entrylist_multibutton_create()}</span>
						</span>
					</button>
				</li>
			{/if}

			{#if $storeListboxValue !== 'publish'}
				<li>
					<button
						type="button"
						class="gradient-primary-hover gradient-primary-focus w-full px-4 py-2 text-left focus:outline-none"
						on:click|preventDefault={() => handleOptionClick('publish')}
					>
						<span class="flex items-center">
							<iconify-icon icon="bi:hand-thumbs-up-fill" width="24" />
							<span class="ml-2">{m.entrylist_multibutton_publish()}</span>
						</span>
					</button>
				</li>
			{/if}

			{#if $storeListboxValue !== 'unpublish'}
				<li>
					<button
						type="button"
						class="gradient-yellow-hover gradient-yellow-focus w-full px-4 py-2 text-left focus:outline-none"
						on:click|preventDefault={() => handleOptionClick('unpublish')}
					>
						<span class="flex items-center">
							<iconify-icon icon="bi:pause-circle" width="24" />
							<span class="ml-2">{m.entrylist_multibutton_unpublish()}</span>
						</span>
					</button>
				</li>
			{/if}

			{#if $storeListboxValue !== 'schedule'}
				<li>
					<button
						type="button"
						class="gradient-pink-hover gradient-pink-focus w-full px-4 py-2 text-left focus:outline-none"
						on:click|preventDefault={() => handleOptionClick('schedule')}
					>
						<span class="flex items-center">
							<iconify-icon icon="bi:clock" width="24" />
							<span class="ml-2">{m.entrylist_multibutton_schedule()}</span>
						</span>
					</button>
				</li>
			{/if}

			{#if $storeListboxValue !== 'clone'}
				<li>
					<button
						type="button"
						class="gradient-secondary-hover gradient-secondary-focus w-full px-4 py-2 text-left focus:outline-none"
						on:click|preventDefault={() => handleOptionClick('clone')}
					>
						<span class="flex items-center">
							<iconify-icon icon="bi:clipboard-data-fill" width="24" />
							<span class="ml-2">{m.entrylist_multibutton_clone()}</span>
						</span>
					</button>
				</li>
			{/if}

			{#if $storeListboxValue !== 'delete'}
				<li>
					<button
						type="button"
						class="gradient-error-hover gradient-error-focus w-full px-4 py-2 text-left focus:outline-none"
						on:click|preventDefault={() => handleOptionClick('delete')}
					>
						<span class="flex items-center">
							<iconify-icon icon="bi:trash3-fill" width="24" />
							<span class="ml-2">{m.entrylist_multibutton_delete()}</span>
						</span>
					</button>
				</li>
			{/if}

			{#if $storeListboxValue !== 'test'}
				<li>
					<button
						type="button"
						class="w-full px-4 py-2 text-left hover:text-error-500 focus:outline-none"
						on:click|preventDefault={() => handleOptionClick('test')}
					>
						<span class="flex items-center">
							<iconify-icon icon="icon-park-outline:preview-open" width="24" />
							<span class="ml-2">{m.entrylist_multibutton_testing()}</span>
						</span>
					</button>
				</li>
			{/if}
		</ul>
	{/if}
</div>
