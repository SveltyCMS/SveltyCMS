<script lang="ts">
	import { sanitizePermissions } from '@src/collections/types';

	export let value: any = null;
	export let widget: any;
	export let key: string;
	export let iconselected: string | null = null;
	export let permissions: any = null;

	$: if (key == 'display' && value?.default == true) {
		value = '';
	}
	$: if (key == 'permissions' && value) {
		value = sanitizePermissions(value);
	}
</script>

<svelte:component this={widget} bind:value bind:iconselected bind:permissions on:update on:toggle label={key} theme="dark" />
