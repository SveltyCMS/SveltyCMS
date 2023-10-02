<script lang="ts">
	import Loading from '@src/components/Loading.svelte';
	import type { PageData } from './$types';

	export let data: PageData;
	let loading = false;
</script>

{JSON.stringify(data, null, 2)}
{#if loading}
	<Loading />
{:else}
	<div class="grid h-full w-full place-items-center">
		<form class="card w-modal flex flex-col gap-2 p-4" method="post">
			<label>
				<span>User token: </span>
				<input class="input" type="text" name="token" minlength="16" maxlength="48" />
			</label>
			<input class="variant-soft-tertiary btn cursor-pointer" type="submit" value="Submit" />
		</form>
	</div>
{/if}
