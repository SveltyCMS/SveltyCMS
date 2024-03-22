<script lang="ts">
	import { publicEnv } from '@root/config/public';

	// Stores
	import { contentLanguage, translationStatusOpen, mode, translationStatus, completionStatus, collection } from '@stores/store';

	//ParaglideJS
	import * as m from '@src/paraglide/messages';

	// Skeleton
	import { ProgressBar } from '@skeletonlabs/skeleton';

	function handleChange(event) {
		const selectedLanguage = event.target.value.toLowerCase();
		contentLanguage.set(selectedLanguage);
		isOpen = false;
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
	function getColor(value: number) {
		if (value >= 80) {
			return 'bg-primary-500';
		} else if (value >= 40) {
			return 'bg-warning-500';
		} else {
			return 'bg-error-500';
		}
	}
</script>

{#if $mode == 'edit' && $collection}
	<!-- Language -->
	<div class="relative mt-1 inline-block text-left">
		<div>
			<button
				class="border-sm:btn variant-ghost-surface btn-sm flex w-16 items-center gap-3 !rounded-none !rounded-t border border-b-0 border-surface-400"
				id="options-menu"
				aria-haspopup="true"
				aria-expanded={isOpen}
				on:click={toggleDropdown}
			>
				{$contentLanguage.toUpperCase()}

				<iconify-icon icon="mingcute:down-line" width="20" class="text-surface-500" />
			</button>

			<ProgressBar
				value={$completionStatus}
				labelledby="Completion Status"
				min={0}
				max={100}
				rounded="none"
				height="h-1"
				meter={getColor($completionStatus)}
				track="bg-surface-500 dark:bg-surface-400 transition-all rounded-b"
			/>
		</div>
		<!-- dropdown -->
		{#if isOpen}
			<div class="absolute right-0 mt-2 max-h-56 w-44 overflow-y-auto rounded border border-surface-400 bg-white shadow-2xl dark:bg-surface-500">
				<div class="flex flex-col py-2" role="menu" aria-orientation="vertical" aria-labelledby="options-menu">
					{#each publicEnv.AVAILABLE_CONTENT_LANGUAGES as lang}
						<button
							on:click={() => handleChange({ target: { value: lang } })}
							class="mx-2 py-1 hover:bg-surface-50 hover:dark:text-black"
							role="menuitem"
						>
							<div class="flex items-center justify-between gap-1">
								<span class="font-bold">{lang.toUpperCase()}</span>
								<span class="text-xs">{$translationStatus[lang]}%</span>
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
					<div class="px-2 py-2 text-center text-sm text-black dark:text-primary-500" role="menuitem">
						{m.translationsstatus_completed()}{$completionStatus}%

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
		class="variant-ghost-surface rounded-t border-surface-500 dark:text-white"
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
