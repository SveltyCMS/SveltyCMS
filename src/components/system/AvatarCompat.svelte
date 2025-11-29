<!--
@file src/components/system/AvatarCompat.svelte
@description Skeleton v4 compatible Avatar component with v2-like API

This is a compatibility wrapper that provides the old Avatar props interface
while using the new Skeleton v4 compound Avatar component internally.

Usage:
```svelte
<script>
  import Avatar from '@components/system/AvatarCompat.svelte';
</script>

<Avatar src="/path/to/image.jpg" initials="JD" class="w-10" />
```
-->

<script lang="ts">
	import { Avatar } from '@skeletonlabs/skeleton-svelte';

	interface Props {
		/** Image source URL */
		src?: string;
		/** Fallback initials when image fails */
		initials?: string;
		/** Alt text for the image */
		alt?: string;
		/** Additional CSS classes */
		class?: string;
		/** Width (Tailwind class or CSS value) */
		width?: string;
		/** Fill color for fallback */
		fill?: string;
		/** Border radius (Tailwind class) */
		rounded?: string;
		/** Border styles */
		border?: string;
		/** Shadow styles */
		shadow?: string;
		/** Action on click */
		onclick?: () => void;
		/** Loading strategy */
		loading?: 'eager' | 'lazy';
	}

	let {
		src = '',
		initials = '',
		alt = 'Avatar',
		class: className = '',
		width = 'w-12',
		fill = 'preset-filled-surface-200-800',
		rounded = 'rounded-full',
		border = '',
		shadow = '',
		onclick,
		loading = 'lazy'
	}: Props = $props();

	// Track if image failed to load
	let imageError = $state(false);

	function handleImageError() {
		imageError = true;
	}

	// Combine all classes
	const rootClasses = $derived(
		[width, fill, rounded, border, shadow, 'overflow-hidden', className].filter(Boolean).join(' ')
	);
</script>

<Avatar class={rootClasses} {onclick}>
	{#if src && !imageError}
		<Avatar.Image {src} {alt} {loading} onerror={handleImageError} class="h-full w-full object-cover" />
	{/if}
	<Avatar.Fallback class="flex h-full w-full items-center justify-center text-sm font-medium">
		{initials || alt?.charAt(0) || '?'}
	</Avatar.Fallback>
</Avatar>
