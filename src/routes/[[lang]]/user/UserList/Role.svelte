<script lang="ts">
	export let value: string;
	let classes = `${
		value === 'Admin' ? 'gradient-tertiary text-white' : 'bg-amber-400 text-black'
	} p-2 rounded`;
</script>

<div class={classes}>
	{value}
</div>
