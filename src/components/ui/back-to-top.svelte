<!--
@file src/components/ui/back-to-top.svelte
@component
**Back to Top Button**

Modern, minimal floating action button that smoothly scrolls to the top.
Appears after scrolling 200px. Fully accessible.
-->

<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, scale } from 'svelte/transition';

	interface Props {
		targetId?: string; // Optional: specific scroll container ID
	}
	let { targetId }: Props = $props();

	let isVisible = $state(false);
	let scrollContainer = $state<HTMLElement | null>(null);

	onMount(() => {
		const handleScroll = (e: Event) => {
			const target = e.target as HTMLElement;
			if (!target) return;

			const scrollY = target.scrollTop ?? window.scrollY;

			if (scrollY > 200) {
				scrollContainer = target;
				isVisible = true;
			} else if (scrollContainer === target || (!targetId && target === document.documentElement)) {
				isVisible = false;
			}
		};

		// Support both window scroll and nested scrollable containers
		window.addEventListener('scroll', handleScroll, { passive: true, capture: true });

		return () => {
			window.removeEventListener('scroll', handleScroll, { capture: true });
		};
	});

	function scrollToTop() {
		if (scrollContainer) {
			scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
		} else {
			window.scrollTo({ top: 0, behavior: 'smooth' });
		}
	}
</script>

{#if isVisible}
	<button
		type="button"
		class="fixed bottom-16 inset-e-2 z-50 flex h-12 w-12 items-center justify-center rounded-full
		       bg-white/90 dark:bg-zinc-900/90
		       shadow-lg shadow-black/10 dark:shadow-black/50
		       ring-1 ring-zinc-950/5 dark:ring-white/10
		       backdrop-blur-xl
		       transition-all duration-300 hover:scale-105 hover:shadow-xl active:scale-95
		       focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
		onclick={scrollToTop}
		aria-label="Scroll back to top"
		title="Back to top"
		in:scale={{ duration: 200, start: 0.85 }}
		out:fade={{ duration: 180 }}
	>
		<iconify-icon
			icon="fluent-emoji-high-contrast:top-arrow"
			width="26"
			class="text-zinc-700 dark:text-zinc-200"
		></iconify-icon>
	</button>
{/if}
