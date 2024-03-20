<script lang="ts">
	export let value: any;
	export let widget: any;
	export let key: string;
	export let iconselected: string;

	let localValue = value;

	$: {
		localValue = value;
		if (key == 'display' && localValue?.default == true) {
			localValue = '';
		}
	}
</script>

<svelte:component this={widget} bind:value={localValue} bind:iconselected label={key} theme="dark" />
