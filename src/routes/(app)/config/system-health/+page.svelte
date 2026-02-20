<!--
@file src/routes/(app)/config/system-health/+page.svelte
@component
**System Health Monitoring Page**

Full-page system health monitoring interface for administrators.
-->

<script lang="ts">
</script>

<PageTitle name="System Health" showBackButton={true} backUrl="/config" icon="mdi:heart-pulse" />

<div class="wrapper p-4"><SystemHealth /></div>
