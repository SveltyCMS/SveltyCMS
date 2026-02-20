<!-- 
@files src/components/system/buttons/multi-button.svelte
@component
**MultiButton component**

@example
<MultiButton buttons={buttons} defaultButton={defaultButton} />

### Props
- `buttons?: Record<string, { fn: () => void; icon: string; bg_color: string; color: string; }>;` - An optional object defining multiple buttons with their respective functions, icons, background colors, and text colors.
- `defaultButton?: string;` - The key of the default button to display prominently.
- `on:create?: () => void;` - Event handler for the 'Create' button.
- `on:delete?: () => void;` - Event handler for the 'Delete' button.
- `on:publish?: () => void;` - Event handler for the 'Publish' button.
- `on:unpublish?: () => void;` - Event handler for the 'Unpublish' button.
- `on:test?: () => void;` - Event handler for the 'Test' button.

### Features
- **Dynamic Button Actions**: Each button can have its own function, icon, background color, and text color.
- **Expandable Menu**: The component can expand to show additional buttons when in 'modify' mode.
- **Customizable Appearance**: Buttons can be styled individually based on provided properties.
- **Event Handler Decoupling**: Button actions can be defined externally and passed in as props for better modularity.
-->

<script lang="ts">
	// Stores
	import { mode, setMode } from '@root/src/stores/collection-store.svelte';
	// Using iconify-icon web component
	import { logger } from '@utils/logger';

	// Props
	const props = $props();
	// Event handler props for decoupling

	// The default functions now call the event handlers passed in as props.
	const defaultButtons = $derived({
		Create: {
			fn: props['on:create'] || (() => setMode('create')),
			icon: 'gravity-ui:plus',
			bg_color: '#15d515',
			color: 'white'
		},
		Delete: {
			fn: props['on:delete'] || (() => logger.warn('Delete handler not provided')),
			icon: 'tdesign:delete-1',
			bg_color: 'red',
			color: 'white'
		},
		Publish: {
			fn: props['on:publish'] || (() => logger.warn('Publish handler not provided')),
			icon: '',
			bg_color: 'lime',
			color: 'white'
		},
		Unpublish: {
			fn: props['on:unpublish'] || (() => logger.warn('Unpublish handler not provided')),
			icon: '',
			bg_color: 'orange',
			color: 'white'
		},
		Test: {
			fn: props['on:test'] || (() => logger.warn('Test handler not provided')),
			icon: '',
			bg_color: 'brown',
			color: 'white'
		}
	});

	const buttons = $derived(props.buttons || defaultButtons);
	let _expanded = $state(false);
	let expanded = {
		get value() {
			return mode.value === 'modify' ? _expanded : false;
		},
		set value(v: boolean) {
			_expanded = v;
		}
	};

	const defaultButton = $derived(props.defaultButton || (mode.value === 'modify' ? 'Delete' : 'Create'));

	const activeArrow = $derived(mode.value === 'modify');

	function toggleExpanded() {
		expanded.value = !expanded.value;
	}
</script>

<div class="relative flex items-center md:w-[200px]">
	<button
		style="--color:{buttons[defaultButton].color};background-color:{buttons[defaultButton].bg_color}"
		class="flex grow items-center justify-center rounded-l-lg md:text-lg max-md:p-[10px]!"
		class:rounded-bl-[10px]={!expanded.value}
		aria-label="Create"
		onclick={buttons[defaultButton].fn}
	>
		{#if buttons[defaultButton].icon}
			<iconify-icon icon={buttons[defaultButton].icon} class="md:hidden"></iconify-icon>
		{/if}
		<span class="max-md:hidden"> {defaultButton} </span>
	</button>
	<button
		onclick={toggleExpanded}
		class="relative w-[50px] cursor-pointer rounded-r-lg hover:active:scale-95 md:p-2!"
		aria-label="Expand/Collapse"
		class:pointer-events-none={!activeArrow}
		style="background-color: rgb(37, 36, 36);"
	>
		<div
			class="absolute left-[43%] top-1/2 h-0 w-0 -translate-x-1/2 -translate-y-1/2 rotate-45 transform border-r-4 border-t-4 border-solid border-white"
			class:!border-red-800={!activeArrow}
		></div>
	</button>
	<div class="overflow-hidden rounded-b-lg transition-all" class:expanded={expanded.value}>
		{#each Object.keys(buttons) as button (button)}
			{#if button != defaultButton && button != 'Create' && mode.value === 'modify'}
				<button
					onclick={buttons[button].fn}
					aria-label={button}
					style="--color:{buttons[button].color};--bg-color:{buttons[button].bg_color || 'rgb(37, 36, 36)'}"
					class="w-full border-b border-gray-700 bg-gray-800 px-4 py-2 text-lg font-medium text-white last:border-0 hover:bg-gray-600"
				>
					{#if buttons[button].icon}
						<iconify-icon icon={buttons[button].icon}></iconify-icon>
					{/if}
					{button}
				</button>
			{/if}
		{/each}
	</div>
</div>
