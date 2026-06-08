<!--
@file src/routes/(app)/config/redirects/+page.svelte
@component Redirect Management GUI
-->

<script lang="ts">
	import { fade, fly } from "svelte/transition";
	import { toast } from '@src/stores/toast.svelte';
	import { button_save } from '@src/paraglide/messages';

	let { data } = $props();
	let redirects = $derived(data.redirects || []);

	let searchQuery = $state('');
	let filteredRedirects = $derived(
		redirects.filter((r: any) =>
			r.from.toLowerCase().includes(searchQuery.toLowerCase()) ||
			r.to.toLowerCase().includes(searchQuery.toLowerCase())
		)
	);

	let selectedRedirect = $state<any>(null);
	let isModalOpen = $state(false);

	function openModal(redirect: any = null) {
		selectedRedirect = redirect || { from: '', to: '', type: 301, active: true, isRegex: false };
		isModalOpen = true;
	}

	function closeModal() {
		isModalOpen = false;
		selectedRedirect = null;
	}
</script>

<div class="absolute inset-0 p-6 space-y-8 bg-surface-50/50 dark:bg-surface-950/50 overflow-y-auto">
	<!-- Header -->
	<div class="flex items-center justify-between" in:fade>
		<div>
			<h1 class="text-3xl font-bold flex items-center gap-3">
				<iconify-icon icon="mdi:arrow-decision" class="text-tertiary-500 dark:text-primary-500"></iconify-icon>
				Redirect Manager
			</h1>
			<p class="text-sm opacity-50 font-medium">Manage your site redirects globally</p>
		</div>
		<button class="btn preset-filled-tertiary-500 dark:preset-filled-primary-500" onclick={() => openModal()}>
			<iconify-icon icon="mdi:plus" class="mr-2"></iconify-icon>
			Add Redirect
		</button>
	</div>

	<!-- Content Card -->
	<div class="card p-6 border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/50 backdrop-blur-md shadow-sm space-y-4" in:fly={{ y: 20, delay: 100 }}>
		<div class="flex items-center gap-4">
			<iconify-icon icon="mdi:magnify" class="text-2xl opacity-50"></iconify-icon>
			<input
				type="search"
				bind:value={searchQuery}
				placeholder="Search by path..."
				class="input"
			 aria-label="Input" />
		</div>

		<div class="table-container">
			<table class="table table-hover">
				<thead>
					<tr>
						<th>From Path</th>
						<th>To Path</th>
						<th>Type</th>
						<th>Status</th>
						<th>Actions</th>
					</tr>
				</thead>
				<tbody>
					{#each filteredRedirects as redirect}
						<tr>
							<td class="font-mono text-xs">{redirect.from}</td>
							<td class="font-mono text-xs">{redirect.to}</td>
							<td>
								<span class="badge {redirect.type === 301 ? 'preset-filled-success-500' : 'preset-filled-warning-500'}">
									{redirect.type}
								</span>
							</td>
							<td>
								{#if redirect.active}
									<span class="badge preset-filled-tertiary-500 dark:preset-filled-primary-500">Active</span>
								{:else}
									<span class="badge preset-filled-surface-500">Inactive</span>
								{/if}
							</td>
							<td>
								<div class="flex gap-2">
									<button class="btn-icon btn-icon-sm preset-outlined-surface-500" onclick={() => openModal(redirect)} aria-label="Edit Redirect">
										<iconify-icon icon="mdi:pencil"></iconify-icon>
									</button>
									<button class="btn-icon btn-icon-sm preset-outlined-error-500" aria-label="Delete Redirect" onclick={async () => {
																				const { deleteRedirect } = await import('./redirects-actions.server');
																				await deleteRedirect(redirect._id);
																				toast.success('Redirect deleted');
																				// Reload to reflect changes
																				window.location.reload();
																			}}>
																				<iconify-icon icon="mdi:trash-can"></iconify-icon>
																			</button>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</div>
</div>

{#if isModalOpen}
	<div class="modal-backdrop fixed inset-0 z-50 bg-surface-900/50 backdrop-blur flex items-center justify-center p-4">
		<div class="card p-6 w-full max-w-lg space-y-4 shadow-xl border border-surface-200 dark:border-surface-800 bg-white dark:bg-surface-900/50 backdrop-blur-md">
			<h3 class="h3">{selectedRedirect._id ? 'Edit' : 'Add'} Redirect</h3>

			<form onsubmit={async (e) => {
								e.preventDefault();
								const fd = new FormData(e.currentTarget as HTMLFormElement);
								const { saveRedirect } = await import('./redirects-actions.server');
								await saveRedirect({
									id: fd.get('id')?.toString() || undefined,
									from: fd.get('from')?.toString() || '',
									to: fd.get('to')?.toString() || '',
									type: parseInt(fd.get('type')?.toString() || '301'),
									active: fd.get('active') === 'true',
									isRegex: fd.get('isRegex') === 'on',
								});
								toast.success('Redirect saved');
								closeModal();
								// Reload to reflect changes
								window.location.reload();
							}} class="space-y-4">
				<input type="hidden" name="id" value={selectedRedirect._id || ''}  aria-label="Input" />

				<label class="label">
					<span>From Path (e.g. /old-blog)</span>
					<input type="text" name="from" bind:value={selectedRedirect.from} class="input" required  aria-label="Input" />
				</label>

				<label class="label">
					<span>To Path (e.g. /new-blog or https://example.com/new)</span>
					<input type="text" name="to" bind:value={selectedRedirect.to} class="input" required  aria-label="Input" />
				</label>

				<div class="grid grid-cols-2 gap-4">
					<label class="label">
						<span>Redirect Type</span>
						<select name="type" bind:value={selectedRedirect.type} class="select" aria-label="Select">
							<option value={301}>301 Permanent</option>
							<option value={302}>302 Temporary</option>
						</select>
					</label>

					<label class="label">
						<span>Status</span>
						<select name="active" bind:value={selectedRedirect.active} class="select" aria-label="Select">
							<option value={true}>Active</option>
							<option value={false}>Inactive</option>
						</select>
					</label>
				</div>

				<label class="flex items-center space-x-2">
					<input type="checkbox" name="isRegex" bind:checked={selectedRedirect.isRegex} class="checkbox"  aria-label="Input" />
					<span>Is Regex / Pattern</span>
				</label>

				<div class="flex justify-end gap-2 pt-4">
					<button type="button" class="btn preset-outlined-surface-500" onclick={closeModal}>Cancel</button>
					<button type="submit" class="btn preset-filled-tertiary-500 dark:preset-filled-primary-500">{button_save()}</button>
				</div>
			</form>
		</div>
	</div>
{/if}
