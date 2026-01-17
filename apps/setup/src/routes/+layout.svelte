<!--
 @file apps/setup/src/routes/+layout.svelte
 @component
 **This Svelte component serves as the layout for the setup wizard**

 ### Features
 - Skeleton v4 Toasts & Modals
 -->

<script lang="ts">
	import '@shared/theme/app.css';

	let { children } = $props();
</script>

{@render children()}
