<script lang="ts">
	// Auth
	import { roles } from '@src/auth/types';

	export let value: string;

	const classes = `${
		value === roles[0]
			? 'badge gradient-primary'
			: value === roles[1]
				? 'badge gradient-pink'
				: value === roles[2]
					? 'badge gradient-tertiary'
					: value === roles[3]
						? 'badge gradient-secondary'
						: 'text-white'
	} rounded-full text-white`;
</script>

<div class={classes}>
	{#if value == roles[0]}
		<iconify-icon icon="material-symbols:verified-outline" width="20" class="mr-2" /> {value}
	{:else if value == roles[1]}
		<iconify-icon icon="material-symbols:supervised-user-circle" width="20" class="mr-2" /> {value}
	{:else if value == roles[2]}
		<iconify-icon icon="mdi:user-edit" width="20" class="mr-2" /> {value}
	{:else if value == roles[3]}
		<iconify-icon icon="material-symbols:supervised-user-circle" width="20" class="mr-2" /> {value}
	{/if}
</div>
