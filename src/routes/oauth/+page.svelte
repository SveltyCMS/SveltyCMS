<script lang="ts">
	import Loading from '@src/components/Loading.svelte';
import type { PageData } from './$types';

	export let data: PageData;
</script>
<Loading />
{JSON.stringify(data, null, 2)}
