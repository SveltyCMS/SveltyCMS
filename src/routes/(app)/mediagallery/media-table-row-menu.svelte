<!--
@file src/routes/(app)/mediagallery/media-table-row-menu.svelte
@component
Per-row action menu for media gallery table view — mirrors grid actions (details, edit, focal point, tags, delete).
-->
<script lang="ts">
	import { onMount, tick } from 'svelte';
	import Button from '@components/ui/button.svelte';
	import Portal from '@components/ui/portal.svelte';
	import type { MediaBase, MediaImage } from '@utils/media/media-models';
	import {
		builder_tag_input_label,
		button_edit,
		mediagallery_actions_for,
		mediagallery_copy_url,
		mediagallery_copy_url_failed,
		mediagallery_copy_url_missing,
		mediagallery_copy_url_success,
		mediagallery_focal_title,
		mp_details
	} from '@src/paraglide/messages';
	import { logger } from '@utils/logger';
	import { mediaDisplayUrl } from '@utils/media/media-utils';
	import { toast } from '@src/stores/toast.svelte.ts';

	let {
		file,
		onDetails,
		onEdit,
		onFocal,
		onTags,
		onDelete
	}: {
		file: MediaBase | MediaImage;
		onDetails: () => void;
		onEdit: () => void;
		onFocal: () => void;
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
				(file as MediaImage).metadata?.tags?.length || (file as MediaImage).metadata?.aiTags?.length
			)
	);

	const menuItemClass =
		'h-auto! w-full justify-start gap-2.5 rounded-md px-3! py-2! text-start text-sm! font-medium! text-(--admin-text-muted) hover:bg-surface-500/10 dark:text-(--admin-text-muted)';

	function updateMenuPosition() {
		if (!triggerEl) return;
		const rect = triggerEl.getBoundingClientRect();
		const menuWidth = 176;
		const rtl = document.documentElement.dir === 'rtl';
		const preferredLeft = rtl ? rect.left : rect.right - menuWidth;
		const left = Math.min(Math.max(8, preferredLeft), window.innerWidth - menuWidth - 8);
		const menuHeight = menuEl?.offsetHeight ?? 220;
		const below = rect.bottom + 4;
		const top =
			below + menuHeight > window.innerHeight ? Math.max(8, rect.top - menuHeight - 4) : below;
		menuStyle = `top:${top}px;left:${left}px;`;
	}

	async function copyUrl() {
		const raw = file.url || mediaDisplayUrl(file);
		if (!raw) {
			toast.error(mediagallery_copy_url_missing());
			return;
		}
		try {
			const absolute = raw.startsWith('http')
				? raw
				: new URL(raw, window.location.origin).toString();
			await navigator.clipboard.writeText(absolute);
			toast.success(mediagallery_copy_url_success());
		} catch (error) {
			logger.warn('Clipboard write failed', error);
			toast.error(mediagallery_copy_url_failed());
		}
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
<div
	class="flex justify-end"
	onclick={(e) => e.stopPropagation()}
	onkeydown={(e) => e.stopPropagation()}
>
	<span bind:this={triggerEl} class="inline-flex">
		<Button
			variant="ghost"
			size="sm"
			type="button"
			aria-label={mediagallery_actions_for({ name: file.filename })}
			aria-haspopup="menu"
			aria-expanded={open}
			class="h-8 w-8 min-w-0 p-0! text-(--admin-text-muted) hover:bg-surface-500/10 hover:text-surface-800 dark:text-(--admin-text-muted) dark:hover:bg-surface-800 dark:hover:text-surface-100"
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
				tabindex="-1"
				aria-label={mediagallery_actions_for({ name: file.filename })}
				class="fixed z-200 w-44 min-w-44 rounded-(--admin-radius-card) border border-surface-500/30 bg-surface-500/10 p-1 shadow-xl dark:border-surface-500/40 dark:bg-surface-900"
				style={menuStyle}
				onclick={(e) => e.stopPropagation()}
				onkeydown={(e) => e.stopPropagation()}
			>
				<Button
					type="button"
					variant="transparent"
					role="menuitem"
					class={menuItemClass}
					onclick={() => closeAndRun(onDetails)}
				>
					<iconify-icon icon="mdi:information-outline" width="16" class="shrink-0 text-primary-500"
					></iconify-icon>
					<span>{mp_details()}</span>
				</Button>

				<Button
					type="button"
					variant="transparent"
					role="menuitem"
					class={menuItemClass}
					onclick={() => closeAndRun(onEdit)}
				>
					<iconify-icon icon="mdi:pencil" width="16" class="shrink-0 text-(--admin-text-muted)"
					></iconify-icon>
					<span>{button_edit()}</span>
				</Button>

				{#if isImage}
					<Button
						type="button"
						variant="transparent"
						role="menuitem"
						class={menuItemClass}
						onclick={() => closeAndRun(onFocal)}
					>
						<iconify-icon
							icon="mdi:crosshairs-gps"
							width="16"
							class="shrink-0 text-(--admin-text-muted)"
						></iconify-icon>
						<span>{mediagallery_focal_title()}</span>
					</Button>

					<Button
						type="button"
						variant="transparent"
						role="menuitem"
						class={menuItemClass}
						onclick={() => closeAndRun(onTags)}
					>
						<iconify-icon
							icon={hasTags ? 'mdi:tag' : 'mdi:tag-outline'}
							width="16"
							class="shrink-0 text-(--admin-text-muted)"
						></iconify-icon>
						<span>{builder_tag_input_label()}</span>
					</Button>
				{/if}

				<Button
					type="button"
					variant="transparent"
					role="menuitem"
					class={menuItemClass}
					onclick={() => closeAndRun(() => void copyUrl())}
				>
					<iconify-icon
						icon="mdi:link-variant"
						width="16"
						class="shrink-0 text-(--admin-text-muted)"
					></iconify-icon>
					<span>{mediagallery_copy_url()}</span>
				</Button>

				<Button
					type="button"
					variant="transparent"
					role="menuitem"
					class="{menuItemClass} text-error-500 hover:bg-error-500/10 dark:text-error-400"
					onclick={() => closeAndRun(onDelete)}
				>
					<iconify-icon icon="mdi:trash-can-outline" width="16" class="shrink-0"></iconify-icon>
					<span>Delete</span>
				</Button>
			</div>
		</Portal>
	{/if}
</div>
