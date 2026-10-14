<!--
@file src/routes/setup/SetupCardHeader.svelte
@description Header component for the main content card.
Displays the current step title and icon, and a reset button.
-->
<script lang="ts">
	import Button from '@components/ui/button.svelte';
	import SystemTooltip from '@src/components/system/system-tooltip.svelte';
	import { loading_loading, setup_reset_data } from '@src/paraglide/messages';

	// Using iconify-icon web component
	const { currentStep, steps, onreset = () => {} } = $props();

	const icons = $derived([
		'mdi:database',
		'mdi:account',
		'mdi:package-variant-closed',
		'mdi:cog',
		'mdi:email',
		'mdi:check-circle'
	]);
</script>

<div
	class="flex shrink-0 justify-between rounded border border-(--admin-border-default) bg-(--admin-bg-card) p-2"
>
	<h2
		class="flex justify-center items-center text-lg font-semibold tracking-tight sm:text-xl text-(--admin-text-body)"
	>
		{#if icons[currentStep]}
			<iconify-icon
				icon={icons[currentStep]}
				class="me-2 h-4 w-4 text-error-500 sm:h-5 sm:w-5"
				aria-hidden="true"
			></iconify-icon>
		{/if}
		{steps[currentStep]?.label || loading_loading()}
	</h2>
	<SystemTooltip title={setup_reset_data()}>
		<Button
			variant="outline"
			onclick={() => onreset()}
			type="button"
			aria-label={setup_reset_data()}
			size="sm"
			class="text-(--admin-text-body)"
		>
			<iconify-icon icon="mdi:backup-restore" width={24} class="me-1"></iconify-icon>
			<span>{setup_reset_data()}</span>
		</Button>
	</SystemTooltip>
</div>
