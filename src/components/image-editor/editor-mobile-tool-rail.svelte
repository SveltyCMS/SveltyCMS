<!--
@file src/components/image-editor/editor-mobile-tool-rail.svelte
@component
Bottom circular tool rail for mobile editor.
-->
<script lang="ts">
	import { imageEditorStore } from '@src/stores/image-editor-store.svelte';
	import { type EditorWidget, editorWidgets } from './widgets/registry';

	let {
		hasImage = false,
		onToolSelect
	}: {
		hasImage?: boolean;
		onToolSelect: (tool: string) => void;
	} = $props();

	const selectedToolId = $derived(imageEditorStore.state.activeState);

	/** Pintura-style bottom rail order — crop first, then adjust/filter/annotate tools */
	const MOBILE_RAIL_ORDER = [
		'crop',
		'finetune',
		'blur',
		'annotate',
		'watermark',
		'focalpoint',
		'rotate',
		'zoom'
	] as const;

	/** Display-only icons to match mobile reference UI — tool keys unchanged */
	const MOBILE_RAIL_ICONS: Partial<Record<(typeof MOBILE_RAIL_ORDER)[number], string>> = {
		finetune: 'mdi:tune-vertical',
		blur: 'mdi:circle-multiple-outline',
		watermark: 'mdi:sticker-circle-outline',
		focalpoint: 'mdi:texture-box',
		rotate: 'mdi:crop-square',
		zoom: 'mdi:arrow-top-right-bold-box-outline'
	};

	const tools = $derived.by(() => {
		const byKey = new Map(
			editorWidgets.map((w: EditorWidget) => [
				w.key,
				{ id: w.key, name: w.title, icon: w.icon ?? 'mdi:cog' }
			])
		);
		return MOBILE_RAIL_ORDER.map((key) => byKey.get(key)).filter(
			(tool): tool is { id: string; name: string; icon: string } => !!tool
		).map((tool) => ({
			...tool,
			icon: MOBILE_RAIL_ICONS[tool.id as (typeof MOBILE_RAIL_ORDER)[number]] ?? tool.icon
		}));
	});

	function handleSelect(toolId: string) {
		if (!hasImage) return;
		onToolSelect(toolId);
	}
</script>

<nav class="flex shrink-0 gap-0 items-center justify-evenly w-full min-h-12 py-0.75 px-1 pb-[max(0.375rem,env(safe-area-inset-bottom,0px))] overflow-visible bg-[--editor-chrome-bg] border-t-0" aria-label="Editing tools">
	{#each tools as tool (tool.id)}
		<button
			type="button"
			class="inline-flex flex-[0_1_auto] items-center justify-center size-10 text-[rgba(255,255,255,0.72)] cursor-pointer bg-transparent border-none rounded-full transition-[background,color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] disabled:cursor-not-allowed disabled:opacity-35 {selectedToolId === tool.id ? 'bg-white/[0.14]' : ''}"
			class:text-white={selectedToolId === tool.id}
			onclick={() => handleSelect(tool.id)}
			disabled={!hasImage}
			aria-label={tool.name}
			aria-pressed={selectedToolId === tool.id}
			title={tool.name}
		>
			<iconify-icon icon={tool.icon} width="22" aria-hidden="true"></iconify-icon>
		</button>
	{/each}
</nav>
