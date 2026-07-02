<!--
@file src/routes/(app)/mediagallery/media-table-row-menu.svelte
@component
Per-row action menu for media gallery table view — mirrors grid actions (details, edit, tags, delete).
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import Button from '@components/ui/button.svelte';
	import Portal from '@components/ui/portal.svelte';
	import type { MediaBase, MediaImage } from '@utils/media/media-models';

	let {
		file,
		onDetails,
		onEdit,
		onTags,
		onDelete
	}: {
		file: MediaBase | MediaImage;
		onDetails: () => void;
		onEdit: () => void;
		onTags: () => void;
		onDelete: () => void;
	} = $props();

	let open = $state(false);
	let triggerEl = $state<HTMLSpanElement | null>(null);
	let menuEl = $state<HTMLDivElement | null>(null);
	let menuStyle = $state('');

	const isImage = $derived(file.type === 'image');
	const hasTags = $derived(
		isImage &&
			!!(
				(file as MediaImage).metadata?.tags?.length ||
				(file as MediaImage).metadata?.aiTags?.length
			)
	);

	const menuItemClass =
		'flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-start text-sm text-surface-700 transition-colors hover:bg-surface-100 dark:text-surface-200 dark:hover:bg-surface-800';

	function updateMenuPosition() {
		if (!triggerEl) return;
		const rect = triggerEl.getBoundingClientRect();
		const menuWidth = 176;
		const left = Math.min(Math.max(8, rect.right - menuWidth), window.innerWidth - menuWidth - 8);
		const top = rect.bottom + 4;
		menuStyle = `top:${top}px;left:${left}px;`;
	}

	async function toggleMenu(e: MouseEvent) {
		e.stopPropagation();
		e.preventDefault();
		open = !open;
		if (open) {
			await tick();
			updateMenuPosition();
		}
	}

	function closeAndRun(action: () => void) {
		open = false;
		action();
	}

	onMount(() => {
		const onDocPointerDown = (e: PointerEvent) => {
			if (!open) return;
			const target = e.target as Node;
			if (triggerEl?.contains(target) || menuEl?.contains(target)) return;
			open = false;
		};

		const onKeydown = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && open) open = false;
		};

		const onReposition = () => {
			if (open) updateMenuPosition();
		};

		document.addEventListener('pointerdown', onDocPointerDown, true);
		document.addEventListener('keydown', onKeydown);
		window.addEventListener('resize', onReposition);
		window.addEventListener('scroll', onReposition, true);

		return () => {
			document.removeEventListener('pointerdown', onDocPointerDown, true);
			document.removeEventListener('keydown', onKeydown);
			window.removeEventListener('resize', onReposition);
			window.removeEventListener('scroll', onReposition, true);
		};
	});
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="flex justify-end" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
	<span bind:this={triggerEl} class="inline-flex">
		<Button
			variant="ghost"
			size="sm"
			type="button"
			aria-label="Actions for {file.filename}"
			aria-haspopup="menu"
			aria-expanded={open}
			class="h-8 w-8 min-w-0 p-0! text-surface-500 hover:bg-surface-100 hover:text-surface-800 dark:text-surface-400 dark:hover:bg-surface-800 dark:hover:text-surface-100"
			onclick={toggleMenu}
		>
			<iconify-icon icon="mdi:dots-vertical" width="18" aria-hidden="true"></iconify-icon>
		</Button>
	</span>

	{#if open}
		<Portal>
			<div
				bind:this={menuEl}
				role="menu"
				aria-label="Actions for {file.filename}"
				class="fixed z-200 w-44 min-w-[11rem] rounded-lg border border-surface-200 bg-surface-100 p-1 shadow-xl dark:border-surface-800 dark:bg-surface-900"
				style={menuStyle}
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.stopPropagation()}
			>
				<button type="button" role="menuitem" class={menuItemClass} onclick={() => closeAndRun(onDetails)}>
					<iconify-icon icon="mdi:information-outline" width="16" class="shrink-0 text-primary-500"></iconify-icon>
					<span>Details</span>
				</button>

				<button type="button" role="menuitem" class={menuItemClass} onclick={() => closeAndRun(onEdit)}>
					<iconify-icon icon="mdi:pencil" width="16" class="shrink-0 text-surface-500 dark:text-surface-400"></iconify-icon>
					<span>Edit</span>
				</button>

				{#if isImage}
					<button type="button" role="menuitem" class={menuItemClass} onclick={() => closeAndRun(onTags)}>
						<iconify-icon
							icon={hasTags ? 'mdi:tag' : 'mdi:tag-outline'}
							width="16"
							class="shrink-0 text-surface-500 dark:text-surface-400"
						></iconify-icon>
						<span>Tags</span>
					</button>
				{/if}

				<button
					type="button"
					role="menuitem"
					class="{menuItemClass} text-error-600 hover:bg-error-500/10 dark:text-error-400 dark:hover:bg-error-500/10"
					onclick={() => closeAndRun(onDelete)}
				>
					<iconify-icon icon="mdi:trash-can-outline" width="16" class="shrink-0"></iconify-icon>
					<span>Delete</span>
				</button>
			</div>
		</Portal>
	{/if}
</div>
