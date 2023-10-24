<script lang="ts">
	import { twMerge } from 'tailwind-merge';
	export let trackClass = '';
	export let thumbClass = '';
	export let value = false;
	export let width = 80;
	export let height = 40;
	export let label = '';
	export let labelClass = '';
</script>

<div class="container">
	<p class={twMerge('text-white ', labelClass)}>{label}</p>
	<div on:click={() => (value = !value)} class={twMerge('track bg-white ', trackClass)} style="width: {width}px; height: {height}px">
		<div class:checked={value} class={twMerge('thumb bg-gray-400', thumbClass)} style="width: {width / 2}px; height: {height}px" />
	</div>
</div>

<style>
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
