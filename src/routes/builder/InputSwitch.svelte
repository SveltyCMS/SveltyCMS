<script lang="ts">
	export let value: any;
	export let widget: any;
	export let key: string;

	$: if (key == 'display' && value?.default == true) {
		value = '';
	}
</script>

<svelte:component this={widget} bind:value label={key} theme="dark" />
