<script lang="ts">
	import { mode, modifyEntry } from '@src/stores/store';

	export let buttons = {
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
	export let defaultButton: keyof typeof buttons = 'Create';
	$: defaultButton = $mode == 'modify' ? 'Delete' : 'Create';
	let expanded = false;
	$: expanded = $mode == 'modify' ? expanded : false;
	$: activeArrow = $mode == 'modify';
</script>

<div class="wrapper md:w-[200px]">
	<button
		style="--color:{buttons[defaultButton].color};background-color:{buttons[defaultButton].bg_color}"
		class="default flex flex-grow items-center justify-center max-md:!p-[10px]"
		class:rounded-bl-[10px]={!expanded}
		on:click={buttons[defaultButton].fn}
		><iconify-icon class="md:hidden" icon={buttons[defaultButton].icon} />
		<span class="max-md:hidden">
			{defaultButton}
		</span>
	</button>
	<button
		on:click={() => (expanded = !expanded)}
		class=" relative w-[50px] rounded-r-[10px] hover:active:scale-95"
		class:cursor-pointer={activeArrow}
		class:pointer-events-none={!activeArrow}
		style="background-color: rgb(37, 36, 36);"
	>
		<div class="arrow" class:!border-red-800={!activeArrow} />
	</button>
	<div class="buttons overflow-hidden rounded-b-[10px]" class:expanded>
		{#each Object.keys(buttons) as button}
			{#if button != defaultButton && button != 'Create' && $mode == 'modify'}
				<button
					style="--color:{buttons[button].color};--bg-color:{buttons[button].bg_color || 'rgb(37, 36, 36)'}"
					class="nested w-full"
					on:click={buttons[button].fn}
				>
					<iconify-icon icon={buttons[button].icon} />
					{button}</button
				>
			{/if}
		{/each}
	</div>
</div>

<style>
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
