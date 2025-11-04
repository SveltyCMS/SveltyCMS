<!-- 
@files src/components/system/buttons/MultiButton.svelte
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
	import { mode, setMode } from '@root/src/stores/collectionStore.svelte';

	// Props
	const props = $props<{
		buttons?: Record<
			string,
			{
				fn: () => void;
				icon: string;
				bg_color: string;
				color: string;
			}
		>;
		defaultButton?: string;
		// Event handler props for decoupling
		'on:create'?: () => void;
		'on:delete'?: () => void;
		'on:publish'?: () => void;
		'on:unpublish'?: () => void;
		'on:test'?: () => void;
	}>();

	// The default functions now call the event handlers passed in as props.
	const defaultButtons = {
		Create: {
			fn: props['on:create'] || (() => setMode('create')),
			icon: 'gravity-ui:plus',
			bg_color: '#15d515',
			color: 'white'
		},
		Delete: {
			fn: props['on:delete'] || (() => console.warn('Delete handler not provided')),
			icon: 'tdesign:delete-1',
			bg_color: 'red',
			color: 'white'
		},
		Publish: {
			fn: props['on:publish'] || (() => console.warn('Publish handler not provided')),
			icon: '',
			bg_color: 'lime',
			color: 'white'
		},
		Unpublish: {
			fn: props['on:unpublish'] || (() => console.warn('Unpublish handler not provided')),
			icon: '',
			bg_color: 'orange',
			color: 'white'
		},
		Test: {
			fn: props['on:test'] || (() => console.warn('Test handler not provided')),
			icon: '',
			bg_color: 'brown',
			color: 'white'
		}
	};

	let buttons = $state(props.buttons || defaultButtons);
	let expanded = $state(false);

	let defaultButton = $derived(props.defaultButton || (mode.value === 'modify' ? 'Delete' : 'Create'));

	$effect(() => {
		expanded = mode.value === 'modify' ? expanded : false;
	});

	let activeArrow = $derived(mode.value === 'modify');

	function toggleExpanded() {
		expanded = !expanded;
	}
</script>

<div class="relative flex items-center md:w-[200px]">
	<button
		style="--color:{buttons[defaultButton].color};background-color:{buttons[defaultButton].bg_color}"
		class="flex grow items-center justify-center rounded-l-lg md:text-lg max-md:!p-[10px]"
		class:rounded-bl-[10px]={!expanded}
		aria-label="Create"
		onclick={buttons[defaultButton].fn}
	>
		<iconify-icon class="md:hidden" icon={buttons[defaultButton].icon}></iconify-icon>
		<span class="max-md:hidden">
			{defaultButton}
		</span>
	</button>
	<button
		onclick={toggleExpanded}
		class="relative w-[50px] cursor-pointer rounded-r-lg hover:active:scale-95 md:!p-2"
		aria-label="Expand/Collapse"
		class:pointer-events-none={!activeArrow}
		style="background-color: rgb(37, 36, 36);"
	>
		<div
			class="absolute left-[43%] top-1/2 h-0 w-0 -translate-x-1/2 -translate-y-1/2 rotate-45 transform border-r-4 border-t-4 border-solid border-white"
			class:!border-red-800={!activeArrow}
		></div>
	</button>
	<div class="overflow-hidden rounded-b-lg transition-all" class:expanded>
		{#each Object.keys(buttons) as button}
			{#if button != defaultButton && button != 'Create' && mode.value === 'modify'}
				<button
					onclick={buttons[button].fn}
					aria-label={button}
					style="--color:{buttons[button].color};--bg-color:{buttons[button].bg_color || 'rgb(37, 36, 36)'}"
					class="w-full border-b border-gray-700 bg-gray-800 px-4 py-2 text-lg font-medium text-white last:border-0 hover:bg-gray-600"
				>
					<iconify-icon icon={buttons[button].icon}></iconify-icon>
					{button}
				</button>
			{/if}
		{/each}
	</div>
</div>
