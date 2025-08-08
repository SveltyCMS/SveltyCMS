<!--
@file src/routes/(app)/config/widgetManagement/+page.svelte
@component
**Widget Management Configuration Page - Provides interface for managing content widgets and their activation status.**

Features:
- List all available content widgets (core and custom)
- Toggle widget status (active/inactive)
- View widget dependencies and requirements
- Bulk activate required widgets
- Collection validation against active widgets
- Multi-tenant widget configuration
-->

<script lang="ts">
	// ParaglideJS
	// import * as m from '@src/paraglide/messages';

	// Components
	import PageTitle from '@components/PageTitle.svelte';
	import WidgetDashboard from './WidgetDashboard.svelte';

	interface Props {
		data: any;
	}

	let { data }: Props = $props();
</script>

<!-- Page Title with Back Button -->
<PageTitle name="Widget Management" icon="mdi:widgets" showBackButton={true} backUrl="/config" />

<!-- New Widget Management Dashboard -->
<WidgetDashboard {data} />
