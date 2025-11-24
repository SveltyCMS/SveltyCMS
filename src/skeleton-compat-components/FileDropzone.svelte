<script lang="ts">
	// FileDropzone compat component
	import type { Snippet } from 'svelte';
	
	interface Props {
		name?: string;
		files?: FileList | null;
		accept?: string;
		multiple?: boolean;
		children?: Snippet;
		[key: string]: any;
	}
	
	let { name = 'files', files = $bindable(null), accept = '*', multiple = false, children, ...rest }: Props = $props();
	
	function handleChange(e: Event) {
		const target = e.target as HTMLInputElement;
		files = target.files;
	}
</script>

<label class="file-dropzone border-2 border-dashed border-surface-300 rounded p-4 cursor-pointer block text-center" {...rest}>
	<input type="file" {name} {accept} {multiple} onchange={handleChange} class="hidden" />
	{@render children?.()}
</label>
