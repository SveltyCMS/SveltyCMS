<script lang="ts">
	import { roles } from '@src/collections/types';

	//import { PUBLIC_CONTENT_LANGUAGES } from '$env/static/public';

	export let value: string;
	// TODO| Add i18n PUBLIC_TRANSLATIONS
	// Grab Users from one Location only

	let classes = `${
		value === roles.admin
			? 'badge gradient-primary '
			: value === roles.developer
			? 'badge gradient-pink'
			: value === roles.editor
			? 'badge gradient-tertiary'
			: value === roles.user
			? 'badge gradient-secondary'
			: 'text-white'
	} rounded-full text-white`;
</script>

<div class={classes}>
	{#if value == roles.admin}
		<iconify-icon icon="material-symbols:verified-outline" width="20" class="mr-2" /> {value}
	{:else if value == roles.developer}
		<iconify-icon icon="material-symbols:supervised-user-circle" width="20" class="mr-2" /> {value}
	{:else if value == roles.editor}
		<iconify-icon icon="mdi:user-edit" width="20" class="mr-2" /> {value}
	{:else if value == roles.user}
		<iconify-icon icon="material-symbols:supervised-user-circle" width="20" class="mr-2" /> {value}
	{/if}
</div>
