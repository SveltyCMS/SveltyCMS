<script lang="ts">
	import { collection } from '@src/stores/store';
	import { collectionValue, mode, deleteEntry } from '@src/stores/store';
	import { saveFormData } from '@src/utils/utils';
	import { page } from '$app/stores';
	import type { User } from '@src/collections/Auth';
	async function saveData() {
		await saveFormData({ data: $collectionValue });
		mode.set('view');
	}
	let user: User = $page.data.user;
</script>

<div class="container">
	{#if $collection.permissions?.[user.role]?.write != false}
		{#if $mode == 'view'}
			<button on:click={() => mode.set('create')}>Create</button>
		{:else if ['edit', 'create'].includes($mode)}
			<button on:click={saveData}>Save</button>
		{:else if $mode == 'delete'}
			<button on:click={$deleteEntry}>Delete</button>
		{/if}
	{/if}
</div>

<style>
	.container {
		display: flex;
		align-items: center;
		justify-content: flex-start;
		flex-direction: column;
		width: 200px;
		height: 100vh;
		background-color: #242734;
	}
</style>
