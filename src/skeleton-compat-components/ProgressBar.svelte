<script lang="ts">
	// ProgressBar compat component
	interface Props {
		value?: number;
		max?: number;
		height?: string;
		rounded?: string;
		meter?: string;
		track?: string;
		[key: string]: any;
	}
	
	let { value = 0, max = 100, height = 'h-2', rounded = 'rounded-full', meter = 'bg-primary-500', track = 'bg-surface-200', ...rest }: Props = $props();
	
	const percentage = $derived((value / max) * 100);
</script>

<div class="progress-bar {height} {rounded} {track} overflow-hidden" {...rest}>
	<div class="progress-meter {meter} {height} transition-all" style="width: {percentage}%"></div>
</div>
