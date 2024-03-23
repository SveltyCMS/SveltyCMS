<script lang="ts">
	export let value: any = null;
	export let widget: any;
	export let key: string;
	export let iconselected: string | null = null;
	export let permissions: any = null;
	export let update: any = null;
</script>

<svelte:component this={widget} bind:value bind:iconselected bind:permissions on:update label={key} theme="dark" />
