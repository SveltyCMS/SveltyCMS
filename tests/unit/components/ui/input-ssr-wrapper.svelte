<!--
@file tests/unit/components/ui/input-ssr-wrapper.svelte
@component
SSR test wrapper: initIdGenerator() then render Input with forwarded props.
-->
<script lang="ts">
	import { initIdGenerator } from '@utils/id-generator';
	import Input from '@src/components/ui/input.svelte';

	// Accept any Input props for SSR unit tests
	let props: Record<string, unknown> = $props();

	initIdGenerator();
</script>

<Input {...props} />
