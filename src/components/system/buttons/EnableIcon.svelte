<script lang="ts">
	export let checked = false;
	export let icon: string;
</script>

<iconify-icon
	{...$$props}
	{icon}
	role="button"
	tabindex="0"
	class="icon text-gray-400 {$$props.class}"
	width="24"
	class:checked
	on:click={() => (checked = !checked)}
/>

<style lang="postcss">
	.icon {
		cursor: pointer;
	}
	.checked {
		color: rgb(4, 203, 4);
	}
</style>
