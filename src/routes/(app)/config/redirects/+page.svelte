<!--
@file src/routes/(app)/config/redirects/+page.svelte
@component Redirect Management GUI
-->

<script lang="ts">
	import { toast } from '@src/stores/toast.svelte';
	import { button_save } from '@src/paraglide/messages';
	import { enhance } from '$app/forms';

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

<div class="container mx-auto p-4 space-y-6">
	<header class="flex justify-between items-center">
		<div>
			<h1 class="h1 text-primary-500">Redirect Manager</h1>
			<p class="text-surface-600-300-token">Manage your site redirects globally.</p>
		</div>
		<button class="btn preset-filled-primary-500" onclick={() => openModal()}>
			<iconify-icon icon="mdi:plus" class="mr-2"></iconify-icon>
			Add Redirect
		</button>
	</header>

	<div class="card p-4 space-y-4">
		<div class="flex items-center gap-4">
			<iconify-icon icon="mdi:magnify" class="text-2xl opacity-50"></iconify-icon>
			<input 
				type="search" 
				bind:value={searchQuery} 
				placeholder="Search by path..." 
				class="input" 
			/>
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
									<span class="badge preset-filled-primary-500">Active</span>
								{:else}
									<span class="badge preset-filled-surface-500">Inactive</span>
								{/if}
							</td>
							<td>
								<div class="flex gap-2">
									<button class="btn-icon btn-icon-sm preset-outlined-surface-500" onclick={() => openModal(redirect)} aria-label="Edit Redirect">
										<iconify-icon icon="mdi:pencil"></iconify-icon>
									</button>
									<form method="POST" action="?/delete" use:enhance={() => {
										return async ({ result }) => {
											if (result.type === 'success') toast.success('Redirect deleted');
										};
									}}>
										<input type="hidden" name="id" value={redirect._id} />
										<button class="btn-icon btn-icon-sm preset-outlined-error-500" aria-label="Delete Redirect">
											<iconify-icon icon="mdi:trash-can"></iconify-icon>
										</button>
									</form>
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
		<div class="card p-6 w-full max-w-lg space-y-4 shadow-xl">
			<h3 class="h3">{selectedRedirect._id ? 'Edit' : 'Add'} Redirect</h3>
			
			<form method="POST" action="?/save" use:enhance={() => {
				return async ({ result }) => {
					if (result.type === 'success') {
						toast.success('Redirect saved');
						closeModal();
					}
				};
			}} class="space-y-4">
				<input type="hidden" name="id" value={selectedRedirect._id || ''} />
				
				<label class="label">
					<span>From Path (e.g. /old-blog)</span>
					<input type="text" name="from" bind:value={selectedRedirect.from} class="input" required />
				</label>

				<label class="label">
					<span>To Path (e.g. /new-blog or https://example.com/new)</span>
					<input type="text" name="to" bind:value={selectedRedirect.to} class="input" required />
				</label>

				<div class="grid grid-cols-2 gap-4">
					<label class="label">
						<span>Redirect Type</span>
						<select name="type" bind:value={selectedRedirect.type} class="select">
							<option value={301}>301 Permanent</option>
							<option value={302}>302 Temporary</option>
						</select>
					</label>

					<label class="label">
						<span>Status</span>
						<select name="active" bind:value={selectedRedirect.active} class="select">
							<option value={true}>Active</option>
							<option value={false}>Inactive</option>
						</select>
					</label>
				</div>

				<label class="flex items-center space-x-2">
					<input type="checkbox" name="isRegex" bind:checked={selectedRedirect.isRegex} class="checkbox" />
					<span>Is Regex / Pattern</span>
				</label>

				<div class="flex justify-end gap-2 pt-4">
					<button type="button" class="btn preset-outlined-surface-500" onclick={closeModal}>Cancel</button>
					<button type="submit" class="btn preset-filled-primary-500">{button_save()}</button>
				</div>
			</form>
		</div>
	</div>
{/if}
