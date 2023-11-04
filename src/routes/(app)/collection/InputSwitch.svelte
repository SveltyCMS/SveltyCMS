<script lang="ts">
	export let value: any;
	export let widget: any;
	export let key: string;

	let localValue = value;

	$: {
		localValue = value;
		if (key == 'display' && localValue?.default == true) {
			localValue = '';
		}
	}
</script>

<svelte:component this={widget} bind:value={localValue} label={key} theme="dark" />
