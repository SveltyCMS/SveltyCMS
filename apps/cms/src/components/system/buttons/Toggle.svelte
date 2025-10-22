<!-- 
@files src/components/system/buttons/Toggle.svelte
@description - Toggle component	
-->
<script lang="ts">
	import { twMerge } from 'tailwind-merge';

	let {
		trackClass = '',
		thumbClass = '',
		value = $bindable(false),
		width = 80,
		height = 40,
		label = '',
		labelClass = ''
	} = $props<{
		trackClass?: string;
		thumbClass?: string;
		value?: boolean;
		width?: number;
		height?: number;
		label?: string;
		labelClass?: string;
	}>();
</script>

<div class="container">
	<p class={twMerge('text-white ', labelClass)}>{label}</p>
	<button
		onclick={() => (value = !value)}
		class={twMerge('track bg-white ', trackClass)}
		style="width: {width}px; height: {height}px"
		aria-label="Toggle button"
	>
		<div class:checked={value} class={twMerge('thumb bg-gray-400', thumbClass)} style="width: {width / 2}px; height: {height}px"></div>
	</button>
</div>

<style lang="postcss">
	.container {
		display: flex;
		align-items: center;
		justify-content: space-between;
		width: 100%;
	}
	.track {
		position: relative;
		cursor: pointer;
		border-radius: 15px;
	}
	.thumb {
		transition: 0.2s;
		position: absolute;

		border-radius: 15px;
		right: 50%;
	}
	.checked {
		right: 0;
		background-color: rgb(4, 203, 4);
	}
</style>
