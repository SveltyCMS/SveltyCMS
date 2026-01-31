<!--
@file src/lib/components/collection-builder/MigrationBanner.svelte
@component
**Migration warning banner for schema drift notifications**

Displays a prominent banner when schema drift is detected between code-defined 
collections and database schemas. Provides links to review and migrate collections.

### Props
- `drifts` {SchemaDriftResult[]} - Array of detected schema drift issues

### Features:
- Color-coded severity (blocking = red, warning = yellow)
- Quick links to migration review pages
- Dismissible banner with session storage
- Accessibility compliant (ARIA labels)
-->
<script lang="ts">
	import type { SchemaDriftResult } from '$lib/schemas/collectionBuilder';
	import Icon from '@iconify/svelte';

	interface Props {
		drifts: SchemaDriftResult[];
	}

	let { drifts = [] }: Props = $props();

	let dismissed = $state(false);

	// Check if banner was previously dismissed in this session
	$effect(() => {
		if (typeof window !== 'undefined') {
			const wasDismissed = sessionStorage.getItem('migration-banner-dismissed');
			if (wasDismissed === 'true') {
				dismissed = true;
			}
		}
	});

	function handleDismiss() {
		dismissed = true;
		if (typeof window !== 'undefined') {
			sessionStorage.setItem('migration-banner-dismissed', 'true');
		}
	}

	// Determine overall severity
	const severity = $derived(
		drifts.some(d => d.severity === 'blocking') ? 'blocking' : 'warning'
	);

	const bgColor = $derived(
		severity === 'blocking' 
			? 'bg-error-500 dark:bg-error-600' 
			: 'bg-warning-500 dark:bg-warning-600'
	);

	const textColor = $derived('text-white');
</script>

{#if drifts.length > 0 && !dismissed}
	<div 
		class="fixed top-0 left-0 right-0 z-50 {bgColor} {textColor} shadow-xl"
		role="alert"
		aria-live="assertive"
		aria-atomic="true"
	>
		<div class="container mx-auto px-4 py-3">
			<div class="flex items-center justify-between gap-4">
				<div class="flex items-center gap-3 flex-1">
					<Icon 
						icon={severity === 'blocking' ? 'mdi:alert-circle' : 'mdi:alert'} 
						class="text-2xl flex-shrink-0"
					/>
					<div class="flex-1">
						<strong class="font-semibold">
							{#if severity === 'blocking'}
								⛔ Schema Drift Detected (Blocking):
							{:else}
								⚠️ Schema Drift Detected:
							{/if}
						</strong>
						<span class="ml-2">
							{drifts.length} collection{drifts.length !== 1 ? 's' : ''} require{drifts.length === 1 ? 's' : ''} migration
						</span>
						<span class="ml-2 opacity-90">
							({drifts.map(d => d.collection).join(', ')})
						</span>
					</div>
				</div>

				<div class="flex items-center gap-2 flex-shrink-0">
					{#each drifts as drift}
						<a 
							href="/config/collectionbuilder/{drift.collection}?tab=migration"
							class="btn btn-sm variant-filled-surface hover:variant-filled-primary transition-colors"
							aria-label="Review migration for {drift.collection}"
						>
							<Icon icon="mdi:file-document-edit" class="mr-1" />
							Review {drift.collection}
						</a>
					{/each}

					<button
						onclick={handleDismiss}
						class="btn btn-sm variant-ghost-surface hover:variant-filled-surface transition-colors"
						aria-label="Dismiss migration banner"
					>
						<Icon icon="mdi:close" class="text-xl" />
					</button>
				</div>
			</div>

			{#if severity === 'blocking'}
				<div class="mt-2 text-sm opacity-90 pl-9">
					<Icon icon="mdi:information" class="inline mr-1" />
					Deployment blocked: Data loss risk detected. Review and migrate collections before deploying.
				</div>
			{/if}
		</div>
	</div>

	<!-- Spacer to prevent content from being hidden under the fixed banner -->
	<div class="h-20" aria-hidden="true"></div>
{/if}

<style>
	/* Ensure banner is above all other content */
	:global(.migration-banner-active) {
		padding-top: 5rem;
	}
</style>
