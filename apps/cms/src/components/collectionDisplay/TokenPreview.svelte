<script lang="ts">
	import { debounce } from '@shared/utils/utils';
	import { Tooltip, Portal } from '@skeletonlabs/skeleton-svelte';

	interface Props {
		value: any;
		entry: any;
	}

	let { value, entry }: Props = $props();

	let resolvedValue = $state('');
	let isLoading = $state(false);
	let error = $state<string | null>(null);

	async function resolveToken() {
		let textToResolve = value;

		// Handle localized object
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			// Try to find a string value in the object (e.g. 'en', or any first key)
			const vals = Object.values(value);
			const found = vals.find((v) => typeof v === 'string' && v.includes('{{'));
			if (found) textToResolve = found as string;
			else {
				resolvedValue = '';
				return;
			}
		}

		if (!textToResolve || typeof textToResolve !== 'string' || !textToResolve.includes('{{')) {
			resolvedValue = '';
			return;
		}

		isLoading = true;
		error = null;

		try {
			const response = await fetch('/api/tokenBuilder/resolve', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ text: textToResolve, entry })
			});

			if (response.ok) {
				const data = await response.json();
				resolvedValue = data.resolved;
			} else {
				error = 'Failed to resolve';
			}
		} catch (e) {
			error = 'Error resolving';
		} finally {
			isLoading = false;
		}
	}

	// Create a debouncer instance (delay=500ms)
	const runDebounced = debounce(500);

	$effect(() => {
		// Watch for value changes and trigger debounced resolution
		runDebounced(resolveToken);
	});
</script>

{#if value && ((typeof value === 'string' && value.includes('{{')) || (typeof value === 'object' && value !== null && Object.values(value).some((v) => typeof v === 'string' && v.includes('{{'))))}
	<div class="absolute top-0 right-0 z-10 -mt-7 mr-10">
		<Tooltip positioning={{ placement: 'top' }}>
			<Tooltip.Trigger>
				<div class="badge bg-primary-500 cursor-help flex items-center gap-1 shadow-sm">
					<iconify-icon icon="mdi:code-braces" width="14"></iconify-icon>
					<span class="text-xs font-bold">Resolved</span>
					{#if isLoading}
						<iconify-icon icon="line-md:loading-twotone-loop" width="14"></iconify-icon>
					{/if}
				</div>
			</Tooltip.Trigger>

			<Portal>
				<Tooltip.Positioner>
					<div class="card p-4 w-72 shadow-xl z-20 bg-surface-100-800-token border border-surface-500/30">
						<div class="flex items-center justify-between border-b pb-2 mb-2 border-surface-500/30">
							<span class="font-bold text-sm">Resolved Value</span>
							{#if isLoading}
								<iconify-icon icon="line-md:loading-twotone-loop" width="16" class="text-primary-500"></iconify-icon>
							{/if}
						</div>

						<div class="text-sm wrap-break-word max-h-40 overflow-y-auto">
							{#if error}
								<span class="text-error-500 flex items-center gap-1">
									<iconify-icon icon="mdi:alert-circle" width="16"></iconify-icon>
									{error}
								</span>
							{:else}
								<span class="text-tertiary-500 dark:text-primary-500 font-medium">
									{resolvedValue || '...'}
								</span>
							{/if}
						</div>
					</div>
				</Tooltip.Positioner>
			</Portal>
		</Tooltip>
	</div>
{/if}
