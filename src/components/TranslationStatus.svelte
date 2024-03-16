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

	let isOpen = false;

	function toggleDropdown() {
		isOpen = !isOpen;
	}

	// Function to determine the color based on the value
	function getColor(value) {
		if (value >= 80) {
			return 'bg-primary-500';
		} else if (value >= 40) {
			return 'bg-warning-500';
		} else {
			return 'bg-error-500';
		}
	}
</script>

<!-- TODO: Show translation Status -->

{#if $mode == 'edit'}
	<!-- Language -->
	<div class="relative inline-block text-left">
		<div>
			<button
				class="ariant-ghost-surface btn rounded border-surface-500"
				id="options-menu"
				aria-haspopup="true"
				aria-expanded="true"
				on:click={toggleDropdown}
			>
				{$contentLanguage.toUpperCase()}

				<iconify-icon icon="mingcute:down-fill"></iconify-icon>
			</button>

			<ProgressBar
				value={$completionStatus}
				min={0}
				max={100}
				rounded="none"
				height="h-1"
				meter={getColor($completionStatus)}
				track="bg-surface-300 dark:bg-surface-300 transition-all"
			/>
		</div>

		{#if isOpen}
			<div class="absolute right-0 mt-2 w-52 origin-top-right border bg-white shadow-xl ring-1 ring-black ring-opacity-5 dark:bg-surface-500">
				<div class="flex flex-col py-1" role="menu" aria-orientation="vertical" aria-labelledby="options-menu">
					{#each publicEnv.AVAILABLE_CONTENT_LANGUAGES as lang}
						<button on:click={() => handleChange({ target: { value: lang } })} class="btn divide-y-2" role="menuitem">
							<div class="flex items-center justify-between gap-2">
								<span class="font-bold">{lang.toUpperCase()}</span>
								<span>{$translationStatus[lang]}%</span>
							</div>

							<ProgressBar
								value={$translationStatus[lang]}
								labelledby={lang.toUpperCase()}
								min={0}
								max={100}
								rounded="none"
								height="h-1"
								meter={getColor($translationStatus[lang])}
								track="bg-surface-300 dark:bg-surface-300 transition-all"
							/>
						</button>
					{/each}
					<div class="mt-1 px-4 py-2 text-center text-sm text-black dark:text-primary-500" role="menuitem">
						Completion Status : {$completionStatus}%

						<ProgressBar
							value={$completionStatus}
							min={0}
							max={100}
							rounded="none"
							height="h-1"
							meter={getColor($completionStatus)}
							track="bg-surface-300 dark:bg-surface-300 transition-all"
						/>
					</div>
				</div>
			</div>
		{/if}
	</div>
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
