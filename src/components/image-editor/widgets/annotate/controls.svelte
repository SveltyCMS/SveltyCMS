<!--
@file: src/components/image-editor/widgets/annotate/controls.svelte
@component
Pintura-style annotate bottom dock — single centered row with colors, text, and tools.
-->
<script lang="ts">
	type ToolType = 'text' | 'arrow' | 'rectangle' | 'circle' | null;

	let {
			currentTool,
			strokeColor,
			fillColor,
			textDraft = 'Text',
			onSetTool,
			onStrokeColorChange,
			onFillColorChange,
			onTextDraftChange,
			hasSelection = false,
			onDeleteAnnotation
		}: {
			currentTool: ToolType;
			strokeColor: string;
			fillColor: string;
			textDraft?: string;
			onSetTool: (tool: ToolType) => void;
			onStrokeColorChange: (color: string) => void;
			onFillColorChange: (color: string) => void;
			onTextDraftChange?: (text: string) => void;
			hasSelection?: boolean;
			onDeleteAnnotation?: () => void;
		} = $props();

	const annotateTools: { id: ToolType; label: string; icon: string }[] = [
		{ id: 'text', label: 'Text', icon: 'mdi:format-text' },
		{ id: 'arrow', label: 'Arrow', icon: 'mdi:arrow-top-right' },
		{ id: 'rectangle', label: 'Rectangle', icon: 'mdi:rectangle-outline' },
		{ id: 'circle', label: 'Ellipse', icon: 'mdi:circle-outline' }
	];

	function handleKeyDown(e: KeyboardEvent) {
		if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') {
			return;
		}

		if ((e.key === 'Delete' || e.key === 'Backspace') && hasSelection && onDeleteAnnotation) {
			e.preventDefault();
			onDeleteAnnotation();
		}
	}
</script>

<svelte:window onkeydown={handleKeyDown} />

<div class="flex flex-col flex-[0_0_auto] gap-0 items-stretch w-full min-w-0 h-auto leading-none" role="toolbar" aria-label="Annotate controls">
	<div class="flex flex-wrap gap-1.5 items-center justify-center w-full min-w-0 min-h-0 leading-none flex-nowrap overflow-x-auto overflow-y-hidden pb-0 [scrollbar-width:thin] [scrollbar-color:rgba(255,255,255,0.2)_transparent] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:bg-white/20 [&::-webkit-scrollbar-thumb]:rounded-full">
		<div class="inline-flex flex-[0_0_auto] gap-0.5 items-center h-auto min-h-0 p-0.5 bg-[--editor-chrome-elevated] border border-[--editor-chrome-border] rounded-full gap-1.5 px-2">
			<span class="text-[10px] font-normal text-[rgba(255,255,255,0.45)] lowercase whitespace-nowrap">line</span>
			<label class="relative block size-[1.375rem] shrink-0 cursor-pointer" title="Stroke color">
				<input aria-label="Annotation color"
					type="color"
					class="absolute inset-0 w-full h-full cursor-pointer opacity-0"
					value={strokeColor}
					oninput={(e) => onStrokeColorChange(e.currentTarget.value)}
				/>
				<span class="block size-full border-2 border-white/25 rounded-full [box-shadow:inset_0_0_0_1px_rgba(0,0,0,0.2)]" style:background-color={strokeColor}></span>
			</label>
		</div>

		<div class="inline-flex flex-[0_0_auto] gap-0.5 items-center h-auto min-h-0 p-0.5 bg-[--editor-chrome-elevated] border border-[--editor-chrome-border] rounded-full gap-1.5 px-2">
			<span class="text-[10px] font-normal text-[rgba(255,255,255,0.45)] lowercase whitespace-nowrap">fill</span>
			<label class="relative block size-[1.375rem] shrink-0 cursor-pointer" title="Fill color">
				<input aria-label="Font size"
					type="color"
					class="absolute inset-0 w-full h-full cursor-pointer opacity-0"
					value={fillColor}
					oninput={(e) => onFillColorChange(e.currentTarget.value)}
				/>
				<span class="block size-full border-2 border-white/25 rounded-full [box-shadow:inset_0_0_0_1px_rgba(0,0,0,0.2)]" style:background-color={fillColor}></span>
			</label>
		</div>

		{#if currentTool === 'text' && onTextDraftChange}
			<div class="inline-flex flex-[0_0_auto] gap-0.5 items-center h-auto min-h-0 p-0.5 bg-[--editor-chrome-elevated] border border-[--editor-chrome-border] rounded-full gap-1.5 px-2">
				<span class="text-[10px] font-normal text-[rgba(255,255,255,0.45)] lowercase whitespace-nowrap">text</span>
				<input aria-label="Stroke width"
					id="annotation-text"
					class="h-7 px-2 text-[11px] font-medium text-white bg-white/6 border border-white/[0.1] rounded-md outline-none focus:border-white/[0.25] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:m-0 [&::-webkit-inner-spin-button]:m-0 [&[type=number]]:[-moz-appearance:textfield] [&[type=number]]:[appearance:textfield] min-w-28 h-6 max-sm:min-w-[5.5rem]"
					type="text"
					value={textDraft}
					placeholder="Enter text"
					oninput={(e) => onTextDraftChange(e.currentTarget.value)}
				/>
			</div>
		{/if}

		{#if hasSelection && onDeleteAnnotation}
			<button type="button" class="inline-flex flex-[0_0_auto] gap-1.5 items-center h-7 px-2.5 text-[11px] font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-pointer bg-transparent border border-transparent rounded-full transition-[background,color,border-color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] hover:not-disabled:bg-white/[0.09] hover:not-disabled:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35" onclick={onDeleteAnnotation} title="Delete selected annotation" aria-label="Delete annotation">
				<iconify-icon icon="mdi:delete-outline" width="15" aria-hidden="true"></iconify-icon>
				<span>Delete</span>
			</button>
		{/if}

		<div class="inline-flex flex-[0_0_auto] gap-0.5 items-center h-auto min-h-0 p-0.5 bg-[--editor-chrome-elevated] border border-[--editor-chrome-border] rounded-full gap-1.5 px-2 [&_button]:h-[1.625rem] [&_button]:px-[0.55rem]">
			{#each annotateTools as tool (tool.id)}
				<button
					type="button"
					class="inline-flex flex-[0_0_auto] gap-1.5 items-center h-7 px-2.5 text-[11px] font-medium text-[--editor-chrome-text] whitespace-nowrap cursor-pointer bg-transparent border border-transparent rounded-full transition-[background,color,border-color] duration-150 hover:not-disabled:text-[rgba(255,255,255,0.9)] hover:not-disabled:bg-white/[0.09] hover:not-disabled:border-white/[0.12] disabled:cursor-not-allowed disabled:opacity-35"
					class:text-white={currentTool === tool.id}
					onclick={() => onSetTool(tool.id)}
					title={tool.label}
					aria-pressed={currentTool === tool.id}
					aria-label={tool.label}
				>
					<iconify-icon icon={tool.icon} width="15" aria-hidden="true"></iconify-icon>
					<span>{tool.label}</span>
				</button>
			{/each}
		</div>
	</div>
</div>
