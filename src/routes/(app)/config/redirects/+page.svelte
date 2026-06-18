<!--
@file src/routes/(app)/config/redirects/+page.svelte
@component Redirect Management GUI
-->

<script lang="ts">
	import Badge from '@components/ui/badge.svelte';
	import Button from '@components/ui/button.svelte';
	import Checkbox from '@components/ui/checkbox.svelte';
	import Input from '@components/ui/input.svelte';
	import Select from '@components/ui/select.svelte';
	import AdminCard from '@components/admin-card.svelte';
	import AdminPageShell from '@components/admin-page-shell.svelte';
	import { deleteRedirect, saveRedirect } from "./redirects.remote";
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

	const redirectTypeOptions = [
		{ value: '301', label: '301 Permanent' },
		{ value: '302', label: '302 Temporary' },
	];

	const statusOptions = [
		{ value: 'true', label: 'Active' },
		{ value: 'false', label: 'Inactive' },
	];

	function openModal(redirect: any = null) {
		selectedRedirect = redirect || { from: '', to: '', type: 301, active: true, isRegex: false };
		isModalOpen = true;
	}

	function closeModal() {
		isModalOpen = false;
		selectedRedirect = null;
	}
</script>

<AdminPageShell
	title="Redirect Manager"
	icon="mdi:arrow-decision"
	description="Manage your site redirects globally"
>
	{#snippet actions()}
		<Button variant="tertiary" onclick={() => openModal()} leadingIcon="mdi:plus" class="dark:">
			Add Redirect
		</Button>
	{/snippet}

	<AdminCard class="space-y-4 border border-surface-200 bg-white p-6 shadow-xs backdrop-blur-md dark:border-surface-800 dark:bg-surface-900/40">
		<div class="relative">
			<iconify-icon icon="mdi:magnify" class="pointer-events-none absolute inset-s-3 top-1/2 z-10 -translate-y-1/2 text-xl opacity-50"></iconify-icon>
			<Input
				type="search"
				bind:value={searchQuery}
				placeholder="Search by path..."
				aria-label="Search redirects by path"
				class="ps-10 w-full"
			/>
		</div>

		<div class="w-full overflow-x-auto">
			<table class="w-full border-collapse text-sm">
				<thead>
					<tr class="border-b border-surface-200 text-left text-xs uppercase tracking-wider text-surface-400 dark:border-surface-800">
						<th class="pb-3 font-semibold">From Path</th>
						<th class="pb-3 font-semibold">To Path</th>
						<th class="pb-3 font-semibold">Type</th>
						<th class="pb-3 font-semibold">Status</th>
						<th class="pb-3 font-semibold">Actions</th>
					</tr>
				</thead>
				<tbody class="divide-y divide-surface-100 dark:divide-surface-800/60">
					{#each filteredRedirects as redirect}
						<tr class="text-surface-700 hover:bg-surface-50/40 dark:text-surface-200 dark:hover:bg-surface-900/30">
							<td class="py-3 font-mono text-xs">{redirect.from}</td>
							<td class="py-3 font-mono text-xs">{redirect.to}</td>
							<td class="py-3">
								<Badge variant={redirect.type === 301 ? 'success' : 'warning'}>
									{redirect.type}
								</Badge>
							</td>
							<td class="py-3">
								{#if redirect.active}
									<Badge variant="primary">Active</Badge>
								{:else}
									<Badge variant="surface">Inactive</Badge>
								{/if}
							</td>
							<td class="py-3">
								<div class="flex gap-2">
									<Button variant="outline" onclick={() => openModal(redirect)} aria-label="Edit Redirect" class="p-0! min-w-0">
										<iconify-icon icon="mdi:pencil"></iconify-icon>
									</Button>
									<Button variant="error" aria-label="Delete Redirect" onclick={async () => {
										await deleteRedirect(redirect._id);
										toast.success('Redirect deleted');
										window.location.reload();
									}} class="p-0! min-w-0">
										<iconify-icon icon="mdi:trash-can"></iconify-icon>
									</Button>
								</div>
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</AdminCard>
</AdminPageShell>

{#if isModalOpen && selectedRedirect}
	<div class="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-surface-900/50 p-4 backdrop-blur">
		<AdminCard class="w-full max-w-lg space-y-4 border border-surface-200 bg-white p-6 shadow-xl backdrop-blur-md dark:border-surface-800 dark:bg-surface-900/40">
			<h3 class="h3">{selectedRedirect._id ? 'Edit' : 'Add'} Redirect</h3>

			<form onsubmit={async (e) => {
				e.preventDefault();
				await saveRedirect({
					id: selectedRedirect._id || undefined,
					from: selectedRedirect.from,
					to: selectedRedirect.to,
					type: selectedRedirect.type,
					active: selectedRedirect.active,
					isRegex: selectedRedirect.isRegex,
				});
				toast.success('Redirect saved');
				closeModal();
				window.location.reload();
			}} class="space-y-4">
				<Input label="From Path (e.g. /old-blog)" bind:value={selectedRedirect.from} required />
				<Input label="To Path (e.g. /new-blog or https://example.com/new)" bind:value={selectedRedirect.to} required />

				<div class="grid grid-cols-2 gap-4">
					<Select
						label="Redirect Type"
						value={String(selectedRedirect.type)}
						options={redirectTypeOptions}
						onchange={(v) => selectedRedirect.type = parseInt(v)}
					/>
					<Select
						label="Status"
						value={selectedRedirect.active ? 'true' : 'false'}
						options={statusOptions}
						onchange={(v) => selectedRedirect.active = v === 'true'}
					/>
				</div>

				<Checkbox bind:checked={selectedRedirect.isRegex} label="Is Regex / Pattern" />

				<div class="flex justify-end gap-2 pt-4">
					<Button variant="outline" type="button" onclick={closeModal}>Cancel</Button>
					<Button variant="tertiary" type="submit" class="dark:">{button_save()}</Button>
				</div>
			</form>
		</AdminCard>
	</div>
{/if}