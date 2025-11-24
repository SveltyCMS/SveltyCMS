<script lang="ts">
	// Avatar component compat wrapper
	interface Props {
		src?: string;
		initials?: string;
		border?: string;
		width?: string;
		rounded?: string;
		background?: string;
		[key: string]: any;
	}
	
	let { src, initials = '?', border = '', width = 'w-12', rounded = 'rounded-full', background = 'bg-surface-500', ...rest }: Props = $props();
</script>

<div class="avatar {width} {rounded} {border} {background} flex items-center justify-center overflow-hidden" {...rest}>
	{#if src}
		<img {src} alt="avatar" class="w-full h-full object-cover" />
	{:else}
		<span class="text-white font-semibold">{initials}</span>
	{/if}
</div>
