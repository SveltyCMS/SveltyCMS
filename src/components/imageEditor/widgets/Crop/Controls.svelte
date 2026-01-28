<!--
@file: src/components/imageEditor/widgets/Crop/Controls.svelte
@component
Modern controls for the Crop tool. Injected into the master toolbar.
Fully responsive with flex-wrap and mobile-friendly touch targets.
-->
<script lang="ts">
	let {
		onRotateLeft,
		onRotateRight,
		onFlipHorizontal,
		onCropShapeChange,
		onAspectRatio,
		onApply,
		onCancel,
		cropShape
	}: {
		onRotateLeft: () => void;
		onRotateRight: () => void;
		onFlipHorizontal: () => void;
		onCropShapeChange: (shape: 'rectangle' | 'circular' | 'square') => void;
		onAspectRatio: (ratio: number | null) => void;
		onApply: () => void;
		onCancel: () => void;
		cropShape: 'rectangle' | 'circular' | 'square';
	} = $props();

	let activeRatio = $state<string>('free');

	function handleRatio(ratio: number | null, label: string) {
		activeRatio = label;
		onAspectRatio(ratio);
	}
</script>

<div class="crop-controls flex flex-wrap items-center justify-center gap-2 px-2 overflow-x-auto">
	<!-- Aspect Ratio Presets -->
	<div class="flex items-center gap-1 shrink-0">
		<span class="text-xs text-surface-500 dark:text-surface-400 hidden sm:inline mr-1">Ratio:</span>
		<div class="btn-group preset-outlined-surface-500">
			<button 
				class="btn-sm px-2 py-1 text-xs" 
				class:preset-filled-primary-500={activeRatio === 'free'}
				onclick={() => handleRatio(null, 'free')}
				title="Free aspect ratio"
			>Free</button>
			<button 
				class="btn-sm px-2 py-1 text-xs" 
				class:preset-filled-primary-500={activeRatio === '1:1'}
				onclick={() => handleRatio(1, '1:1')}
				title="Square 1:1"
			>1:1</button>
			<button 
				class="btn-sm px-2 py-1 text-xs hidden sm:inline-flex" 
				class:preset-filled-primary-500={activeRatio === '4:3'}
				onclick={() => handleRatio(4 / 3, '4:3')}
				title="Standard 4:3"
			>4:3</button>
			<button 
				class="btn-sm px-2 py-1 text-xs" 
				class:preset-filled-primary-500={activeRatio === '16:9'}
				onclick={() => handleRatio(16 / 9, '16:9')}
				title="Widescreen 16:9"
			>16:9</button>
			<button 
				class="btn-sm px-2 py-1 text-xs hidden md:inline-flex" 
				class:preset-filled-primary-500={activeRatio === '3:2'}
				onclick={() => handleRatio(3 / 2, '3:2')}
				title="Photo 3:2"
			>3:2</button>
			<button 
				class="btn-sm px-2 py-1 text-xs hidden md:inline-flex" 
				class:preset-filled-primary-500={activeRatio === '9:16'}
				onclick={() => handleRatio(9 / 16, '9:16')}
				title="Portrait 9:16"
			>9:16</button>
		</div>
	</div>

	<!-- Divider -->
	<div class="h-6 w-px bg-surface-300 dark:bg-surface-600 hidden sm:block shrink-0"></div>

	<!-- Shape -->
	<div class="flex items-center gap-1 shrink-0">
		<span class="text-xs text-surface-500 dark:text-surface-400 hidden md:inline mr-1">Shape:</span>
		<div class="btn-group preset-outlined-surface-500">
			<button 
				class="btn-sm px-2 py-1" 
				class:preset-filled-primary-500={cropShape === 'rectangle' || cropShape === 'square'} 
				onclick={() => onCropShapeChange('rectangle')} 
				title="Rectangle"
				aria-label="Rectangle crop"
			>
				<iconify-icon icon="mdi:rectangle-outline" width="18"></iconify-icon>
			</button>
			<button 
				class="btn-sm px-2 py-1" 
				class:preset-filled-primary-500={cropShape === 'circular'} 
				onclick={() => onCropShapeChange('circular')} 
				title="Circle (saves with transparency)"
				aria-label="Circular crop"
			>
				<iconify-icon icon="mdi:circle-outline" width="18"></iconify-icon>
			</button>
		</div>
	</div>

	<!-- Divider -->
	<div class="h-6 w-px bg-surface-300 dark:bg-surface-600 hidden sm:block shrink-0"></div>

	<!-- Rotate & Flip -->
	<div class="flex items-center gap-1 shrink-0">
		<button 
			class="btn-icon preset-outlined-surface-500 h-8 w-8" 
			onclick={onRotateLeft} 
			title="Rotate Left 90°"
			aria-label="Rotate left"
		>
			<iconify-icon icon="mdi:rotate-left" width="18"></iconify-icon>
		</button>
		<button 
			class="btn-icon preset-outlined-surface-500 h-8 w-8" 
			onclick={onRotateRight} 
			title="Rotate Right 90°"
			aria-label="Rotate right"
		>
			<iconify-icon icon="mdi:rotate-right" width="18"></iconify-icon>
		</button>
		<button 
			class="btn-icon preset-outlined-surface-500 h-8 w-8" 
			onclick={onFlipHorizontal} 
			title="Flip Horizontal"
			aria-label="Flip horizontal"
		>
			<iconify-icon icon="mdi:flip-horizontal" width="18"></iconify-icon>
		</button>
	</div>

	<!-- Spacer on larger screens -->
	<div class="hidden sm:block grow"></div>

	<!-- Action Buttons -->
	<div class="flex items-center gap-2 shrink-0">
		<!-- Cancel -->
		<button 
			class="btn preset-outlined-error-500 gap-1 px-3 py-1.5 text-sm" 
			onclick={onCancel}
			aria-label="Cancel crop"
		>
			<iconify-icon icon="mdi:close" width="16"></iconify-icon>
			<span class="hidden sm:inline">Cancel</span>
		</button>

		<!-- Apply -->
		<button 
			class="btn preset-filled-success-500 gap-1 px-3 py-1.5 text-sm" 
			onclick={onApply}
			aria-label="Apply crop"
		>
			<iconify-icon icon="mdi:check" width="16"></iconify-icon>
			<span class="hidden sm:inline">Apply</span>
		</button>
	</div>
</div>

<style>
	.crop-controls {
		max-width: 100%;
	}

	/* Ensure touch targets are at least 44px on mobile */
	@media (max-width: 640px) {
		.btn-icon {
			min-width: 40px;
			min-height: 40px;
		}
	}
</style>
