<script lang="ts">
	export let value: any;
	export let widget: any;
	export let key: string;
</script>

<svelte:component this={widget} bind:value label={key} theme="dark" />
