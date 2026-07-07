<!--
@file src/routes/(admin)/admin/+page.svelte
@component **Admin dashboard landing page**

### Features:
- Navigation cards to admin sections
- Tenant management quick access
- Uses AdminPageShell and AdminCard for theme consistency
-->

<script lang="ts">
  import AdminCard from '@components/admin-card.svelte';
  import AdminPageShell from '@components/admin-page-shell.svelte';
  import Button from '@components/ui/button.svelte';
</script>

<AdminPageShell
  title="System Administration"
  icon="mdi:shield-account"
  description="Manage tenants, system health, and global settings."
>
  <div class="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
    <AdminCard class="p-6">
      <h2 class="mb-2 text-lg font-semibold">Tenants</h2>
      <p class="mb-4 text-sm text-surface-600 dark:text-surface-400">Manage organizations, quotas, and tenant status.</p>
      <Button variant="primary" href="/admin/tenants" data-preload="hover">Manage Tenants</Button>
    </AdminCard>
  </div>
</AdminPageShell>
