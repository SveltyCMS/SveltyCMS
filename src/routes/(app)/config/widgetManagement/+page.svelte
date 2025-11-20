<!--
@file src/routes/(app)/config/widgetManagement/+page.svelte
@component
**Widget Management Configuration Page - Provides interface for managing content widgets and their activation status with 3-pillar architecture support.**

Features:
- List all available content widgets (core and custom)
- Toggle widget status (active/inactive)
- View widget dependencies and requirements
- Display 3-pillar architecture components (Definition, Input, Display)
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

	const { data }: Props = $props();
</script>

<!-- Page Title with Back Button -->
<PageTitle name="Widget Management" icon="mdi:widgets" showBackButton={true} backUrl="/config" />

<!-- Widget Management Dashboard with 3-Pillar Architecture Support -->
<WidgetDashboard {data} />
