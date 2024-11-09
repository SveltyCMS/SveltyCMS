<!-- 
@files src/components/system/buttons/MultiButton.svelte
@description - MultiButton component	
-->

<script lang="ts">
	// Stores
	import { mode, modifyEntry } from '@stores/collectionStore';

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
	}>();

	// Default buttons object
	const defaultButtons = {
		Create: {
			fn: () => {
				mode.set('create');
			},
			icon: 'gravity-ui:plus',
			bg_color: '#15d515',
			color: 'white'
		},
		Delete: {
			fn: () => {
				$modifyEntry('delete');
			},
			icon: 'tdesign:delete-1',
			bg_color: 'red',
			color: 'white'
		},
		Publish: {
			fn: () => {
				$modifyEntry('publish');
			},
			icon: '',
			bg_color: 'lime',
			color: 'white'
		},
		Unpublish: {
			fn: () => {
				$modifyEntry('unpublish');
			},
			icon: '',
			bg_color: 'orange',
			color: 'white'
		},
		Test: {
			fn: () => {
				$modifyEntry('test');
			},
			icon: '',
			bg_color: 'brown',
			color: 'white'
		}
	};

	let buttons = $state(props.buttons || defaultButtons);
	let defaultButton = $state(props.defaultButton || 'Create');
	let expanded = $state(false);
	let activeArrow = $state(false);

	$effect(() => {
		defaultButton = $mode === 'modify' ? 'Delete' : 'Create';
	});

	$effect(() => {
		expanded = $mode === 'modify' ? expanded : false;
	});

	$effect(() => {
		activeArrow = $mode === 'modify';
	});

	function toggleExpanded() {
		expanded = !expanded;
	}
</script>

<div class="wrapper md:w-[200px]">
	<button
		style="--color:{buttons[defaultButton].color};background-color:{buttons[defaultButton].bg_color}"
		class="default flex flex-grow items-center justify-center max-md:!p-[10px]"
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
		class="relative w-[50px] rounded-r-[10px] hover:active:scale-95"
		aria-label="Expand/Collapse"
		class:cursor-pointer={activeArrow}
		class:pointer-events-none={!activeArrow}
		style="background-color: rgb(37, 36, 36);"
	>
		<div class="arrow" class:!border-red-800={!activeArrow} />
	</button>
	<div class="buttons overflow-hidden rounded-b-[10px]" class:expanded>
		{#each Object.keys(buttons) as button}
			{#if button != defaultButton && button != 'Create' && $mode === 'modify'}
				<button
					onclick={buttons[button].fn}
					aria-label={button}
					style="--color:{buttons[button].color};--bg-color:{buttons[button].bg_color || 'rgb(37, 36, 36)'}"
					class="nested w-full"
				>
					<iconify-icon icon={buttons[button].icon}></iconify-icon>
					{button}
				</button>
			{/if}
		{/each}
	</div>
</div>

<style lang="postcss">
	.arrow {
		position: absolute;
		left: 43%;
		top: 50%;
		border: solid white;
		border-width: 0 4px 4px 0;
		display: inline-block;
		padding: 6px;
		transform: rotate(45deg) translate(-50%, -50%);
		transform-origin: top;
	}
	.buttons {
		display: none;
		position: absolute;
		top: 100%;
		width: 100%;
		min-width: 200px;
		right: 0;
		top: 100%;
		margin-top: 2px;
	}
	.expanded {
		display: block;
	}
	.wrapper {
		position: relative;
		display: flex;
		align-items: center;
	}
	.nested,
	.default {
		font-size: 22px;
		padding: 5px 10px;
		color: var(--color);
		height: 100%;
	}
	.default {
		border-top-left-radius: 10px;
	}

	.nested {
		background-color: rgb(37, 36, 36);
		color: white;
	}

	.buttons .nested:not(:last-of-type) {
		border-bottom: 1px solid rgb(88, 87, 87);
	}
	.nested:hover {
		background-color: var(--bg-color);
	}
	button:active {
		transform: scale(0.95);
	}
</style>
