<!--
@file src/components/ui/file-upload.svelte
@component
**SveltyCMS FileUpload Primitive**

### Props
- `files` (File[]): Bindable array of selected/uploaded files.
- `multiple` (boolean): Whether multiple files are allowed.
- `accept` (string): Acceptable mime types / extensions (default: '*').
- `maxSize` (number): Maximum file size in bytes.
- `label` (string): Text prompt for file upload (default: 'Click or drag files to upload').
- `helper` (string): Helper description under label (default: 'Supports most file types').
- `disabled` (boolean): Disable the upload interaction.
- `class` (string): Additional CSS classes.
- `onchange` (function): Triggered when new files are selected.

### Snippets
- `icon`: Custom snippet for upload icon.
- `children`: Custom content inside the upload zone.

### Features:
- WCAG 3.0 compliant focus/click delegation via native <label>
- Focus state visually mirrored on label with Tailwind focus-within ring
- Alt/aria-label on input for screen reader visibility
-->

<script lang="ts">
import { cn } from '@utils/cn';

interface Props {
	files?: File[];
	multiple?: boolean;
	accept?: string;
	maxSize?: number;
	label?: string;
	helper?: string;
	disabled?: boolean;
	class?: string;
	onchange?: (files: File[]) => void;
	// Snippets
	icon?: import('svelte').Snippet;
	children?: import('svelte').Snippet;
}

let {
	files = $bindable([]),
	multiple = false,
	accept = '*',
	maxSize,
	label = 'Click or drag files to upload',
	helper = 'Supports most file types',
	disabled = false,
	class: className = '',
	onchange,
	icon,
	children
}: Props = $props();

let isDragging = $state(false);

function handleFiles(newFiles: FileList | null) {
	if (!newFiles || disabled) return;

	const filteredFiles = Array.from(newFiles).filter(file => {
		if (maxSize && file.size > maxSize) return false;
		return true;
	});

	if (multiple) {
		files = [...files, ...filteredFiles];
	} else {
		files = filteredFiles.slice(0, 1);
	}

	onchange?.(files);
}

function onDrop(e: DragEvent) {
	e.preventDefault();
	isDragging = false;
	if (disabled) return;
	handleFiles(e.dataTransfer?.files || null);
}

function onDragOver(e: DragEvent) {
	e.preventDefault();
	if (disabled) return;
	isDragging = true;
}

function onDragLeave() {
	isDragging = false;
}
</script>

<label
	class={cn(
		'relative group flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-2xl transition-all duration-200 cursor-pointer outline-none',
		'bg-surface-50/50 dark:bg-surface-900/50',
		isDragging ? 'border-tertiary-500 dark:border-primary-500 bg-tertiary-500 dark:bg-primary-500/5 ring-4 ring-primary-500/10' : 'border-surface-300 hover:border-tertiary-500 dark:hover:border-primary-500/50',
		'focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-tertiary-500 dark:focus-within:border-primary-500',
		disabled && 'opacity-50 cursor-not-allowed grayscale pointer-events-none',
		className
	)}
	ondragover={onDragOver}
	ondragleave={onDragLeave}
	ondrop={onDrop}
>
	<input aria-label={label}
		type="file"
		class="sr-only"
		{multiple}
		{accept}
		{disabled}
		onchange={(e) => handleFiles(e.currentTarget.files)}
	/>

	{#if children}
		{@render children()}
	{:else}
		<div class="pointer-events-none flex flex-col items-center gap-4 text-center">
			<div class={cn(
				"w-16 h-16 rounded-full flex items-center justify-center transition-colors duration-200",
				isDragging ? "bg-tertiary-500 dark:bg-primary-500 text-white" : "bg-surface-200 dark:bg-surface-800 text-surface-600 dark:text-surface-400"
			)}>
				{#if icon}
					{@render icon()}
				{:else}
					<iconify-icon icon="mingcute:upload-2-line" width="32"></iconify-icon>
				{/if}
			</div>

			<div class="space-y-1">
				<p class="font-bold text-lg">{label}</p>
				<p class="text-sm opacity-60">{helper}</p>
			</div>
		</div>
	{/if}

	{#if isDragging}
		<div class="absolute inset-0 pointer-events-none rounded-2xl border-4 border-tertiary-500 dark:border-primary-500/20 animate-pulse"></div>
	{/if}
</label>
