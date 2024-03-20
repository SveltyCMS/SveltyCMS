<script lang="ts">
	export let value: any;
	export let widget: any;
	export let key: string;
	export let iconselected: string;
</script>

<svelte:component this={widget} bind:iconselected label={key} theme="dark" />
