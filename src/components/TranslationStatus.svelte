<script lang="ts">
	import { publicEnv } from '@root/config/public';

	// Stores
	import { contentLanguage, translationStatusOpen, mode, translationStatus, completionStatus } from '@stores/store';

	// Skeleton
	import { ProgressBar } from '@skeletonlabs/skeleton';

	function handleChange(event) {
		const selectedLanguage = event.target.value.toLowerCase();
		contentLanguage.set(selectedLanguage);
		translationStatusOpen.set(false);
	}

	// Define a function to close any open elements
	function closeOpenStates() {
		translationStatusOpen.set(true);
	}
</script>

<!-- TODO: Show translation Status -->

{#if $mode == 'edit'}
	<!-- Language -->
	<select
		class="variant-ghost-surface relative -mt-1 mb-1 rounded border-surface-500 dark:text-white"
		bind:value={$contentLanguage}
		on:change={handleChange}
		on:focus={() => {
			closeOpenStates();
		}}
	>
		{#each publicEnv.AVAILABLE_CONTENT_LANGUAGES as lang}
			<option class="bg-surface-500 text-white" value={lang}>{lang.toUpperCase()}</option>
		{/each}
	</select>

	<ProgressBar
		value={$completionStatus}
		min={0}
		max={100}
		rounded="none"
		height="h-2"
		meter="bg-error-500"
		track="bg-surface-300 dark:bg-surface-300 transition-all"
	/>

	<!-- {#each publicEnv.AVAILABLE_CONTENT_LANGUAGES as lang}
		<span>{lang.toUpperCase()} </span>

		<ProgressBar
			value={translationStatus[lang]}
			labelledby={lang.toUpperCase()}
			min={0}
			max={100}
			rounded="none"
			height="h-2"
			meter="bg-error-500"
			track="bg-surface-300 dark:bg-surface-300 transition-all"
		/>
	{/each} -->
{:else}
	<!-- Language -->
	<select
		class="variant-ghost-surface rounded border-surface-500 dark:text-white"
		bind:value={$contentLanguage}
		on:change={handleChange}
		on:focus={() => {
			closeOpenStates();
		}}
	>
		{#each publicEnv.AVAILABLE_CONTENT_LANGUAGES as lang}
			<option class="bg-surface-500 text-white" value={lang}>{lang.toUpperCase()}</option>
		{/each}
	</select>
{/if}
