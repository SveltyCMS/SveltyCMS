<!--
@file src/components/site/commerce-legal-bar.svelte
@component Legal links and the withdrawal button for the public store.
@props labels — impressum, privacy, terms, and the statutory withdrawal phrase
-->
<script lang="ts">
	import Button from '@components/ui/button.svelte';

	interface Props {
		labels: {
			impressum: string;
			privacy: string;
			terms: string;
			withdraw: string;
		};
	}

	let { labels }: Props = $props();
</script>

<nav
	class="mt-10 flex flex-wrap items-center gap-3 border-t border-surface-500/30 pt-4 text-sm dark:border-surface-500/40"
	aria-label="Legal"
>
	<a class="text-primary-500 underline-offset-2 hover:underline" href="/legal/impressum"
		>{labels.impressum}</a
	>
	<a class="text-primary-500 underline-offset-2 hover:underline" href="/legal/privacy"
		>{labels.privacy}</a
	>
	<a class="text-primary-500 underline-offset-2 hover:underline" href="/legal/terms"
		>{labels.terms}</a
	>
	<Button href="/widerruf" variant="outline" size="sm">{labels.withdraw}</Button>
</nav>
