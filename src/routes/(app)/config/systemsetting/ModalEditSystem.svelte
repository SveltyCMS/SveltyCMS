<script lang="ts">
	import { getModalStore } from '@skeletonlabs/skeleton';
	import type { SvelteComponent } from 'svelte';

	export let parent: SvelteComponent;
	export let title: string;
	export let configData: string; // Accept a formatted string

	const modalStore = getModalStore();
	const cBase = 'bg-surface-100-800-token w-screen h-screen p-4 flex justify-center items-center';
</script>

{#if $modalStore[0]}
	<div class="modal-example-fullscreen {cBase}">
		<div class="flex flex-col items-center space-y-4">
			<h2 class="h2 text-tertiary-500 dark:text-primary-500">{title}</h2>
			<pre class="">{configData}</pre>
			<button class="variant-filled btn" on:click={parent.onClose}>× Close</button>
		</div>
	</div>
{/if}
