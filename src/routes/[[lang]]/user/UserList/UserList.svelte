<script lang="ts">
	// typesafe-i18n
	import LL from '$i18n/i18n-svelte';

	import type { PageData } from '../$types';

	export let list: PageData;

	const listOfUsers = JSON.parse(list.user);
</script>

<div class="">
	{#each listOfUsers as user}
		<div>
			<span>{$LL.USER_Username()}: {user.username} </span> - (edit/delete/role)
		</div>
	{/each}
</div>
