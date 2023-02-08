<script lang="ts">
	import type { PageData } from "../$types";

	export let list: PageData

	const listOfUsers = JSON.parse(list.user)


</script>

<div class="">
	{#each listOfUsers as user}
		<div> 
			<span> Username: {user.username} </span>
		</div>
	{/each}	
</div>
